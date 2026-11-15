/**
 * The switch (brief, Architecture): the new container starts beside the old one → `/api/health`
 * answers → the site file points at it → `caddy reload` → the old one stops after a drain.
 * Rollback is the same switch onto a kept container; nothing is rebuilt. The last KEEP production
 * containers stay (stopped) for that; older ones are removed.
 *
 * A preview (a deployment with a PR) is the same switch with its own target `pr-<n>`: 384 MB
 * (D017), its file in `/etc/caddy/previews/` through `preview.write`, and nothing kept — a new
 * push replaces the PR's container, and closing the PR removes it (`closePreview`). At most
 * PREVIEW_LIMIT previews run per project: before a fifth starts, the least recently pushed one
 * sleeps (`makeRoom`, D017) — its host says "dormido" and its next push wakes it.
 *
 * Everything goes through kit-agent (`AgentClient`) and the database (`SwitchRepo`); time is
 * injected, so it is tested without waiting.
 */

import type { OpName } from "@/agent/protocol";
import type { AgentClient, Params } from "@/cli/client";
import {
  containerName,
  MEMORY_MB,
  PREVIEW_LIMIT,
  type ProductionTarget,
  previewHost,
  type Target,
} from "@/lib/core";
import {
  type CommitStatus,
  STATUS_CONTEXTS,
  type StatusPublisher,
} from "./commit-status";
import {
  asleepCommentBody,
  closedCommentBody,
  liveCommentBody,
  type PreviewCommenter,
  previewMarker,
} from "./pr-comment";
import type {
  ClaimedDeployment,
  KeptDeployment,
  RunningPreview,
  SwitchRepo,
} from "./repo";

export const KEEP = 5;

export type SwitchDeps = {
  agent: AgentClient;
  repo: SwitchRepo;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
  /** How long the new container has to answer `/api/health`. */
  healthTimeoutMs?: number;
  healthIntervalMs?: number;
  /** Time the old container keeps serving in-flight requests after Caddy moved. */
  drainMs?: number;
  /** Publishes the commit's status on GitHub after each deployment; null = no token, skipped. */
  status?: StatusPublisher | null;
  /** Creates or edits the PR's preview comment; null = no token, skipped. */
  comments?: PreviewCommenter | null;
};

/** How one deployment ended; `error` is what `deployments.error` got. */
export type SwitchOutcome =
  | { result: "live" }
  | { result: "failed"; error: string };

export class SwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwitchError";
  }
}

type Ctx = Required<SwitchDeps>;

function withDefaults(d: SwitchDeps): Ctx {
  return {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (e) =>
      console.log(JSON.stringify({ t: new Date().toISOString(), ...e })),
    healthTimeoutMs: 60_000,
    healthIntervalMs: 1_000,
    drainMs: 10_000,
    status: null,
    comments: null,
    ...d,
  };
}

async function call<O extends OpName>(
  ctx: Ctx,
  op: O,
  params: Params<O>,
): Promise<unknown> {
  const res = await ctx.agent.call(op, params);
  if (!res.ok)
    throw new SwitchError(`${op}: ${res.error.code}: ${res.error.message}`);
  return res.result;
}

async function waitHealthy(ctx: Ctx, port: number): Promise<boolean> {
  const attempts = Math.max(
    1,
    Math.ceil(ctx.healthTimeoutMs / ctx.healthIntervalMs),
  );
  for (let i = 0; i < attempts; i++) {
    const h = (await call(ctx, "health.check", { port })) as { ok: boolean };
    if (h.ok) return true;
    await ctx.sleep(ctx.healthIntervalMs);
  }
  return false;
}

/** Best effort: a failure here is logged, never undoes a switch that already happened. */
async function quietly(ctx: Ctx, what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    ctx.log({
      event: "switch.cleanup_failed",
      what,
      error: (e as Error).message,
    });
  }
}

async function stopAfterDrain(
  ctx: Ctx,
  previous: { container: string | null } | null,
  keep: string,
) {
  if (!previous?.container || previous.container === keep) return;
  const name = previous.container;
  await ctx.sleep(ctx.drainMs);
  await quietly(ctx, `stop ${name}`, () =>
    call(ctx, "container.stop", { name }),
  );
}

async function prune(ctx: Ctx, projectId: string) {
  const kept = await ctx.repo.listKept(projectId);
  for (const k of kept.slice(KEEP)) {
    if (k.status === "live") continue;
    await quietly(ctx, `remove ${k.container}`, async () => {
      await call(ctx, "container.remove", { name: k.container });
      await ctx.repo.clearContainer(k.id);
    });
  }
}

/** Points the site at `port`, marks `id` live, drains and stops the previous container. */
async function cutOver(
  ctx: Ctx,
  target: ProductionTarget,
  d: {
    id: string;
    projectId: string;
    hosts: string[];
    container: string;
    port: number;
  },
) {
  await call(ctx, "site.write", { target, hosts: d.hosts, port: d.port });
  const previous = await ctx.repo.markLive(d.id, d.container, d.port);
  ctx.log({
    event: "switch.live",
    deployment: d.id,
    container: d.container,
    port: d.port,
  });
  await stopAfterDrain(ctx, previous, d.container);
  await prune(ctx, d.projectId);
}

/** What a deployment started, so a failure cleans exactly that up. */
type Attempt = { started: string | null; reused: boolean };

/** Pulls the image and runs it in a new container on a fresh loopback port. */
async function runNew(
  ctx: Ctx,
  target: Target,
  c: ClaimedDeployment,
  memoryMb: number,
  attempt: Attempt,
): Promise<number> {
  await call(ctx, "image.pull", { image: c.image });
  const alloc = (await call(ctx, "ports.allocate", {
    target,
    sha: c.sha,
  })) as { port: number };
  await call(ctx, "container.run", {
    target,
    sha: c.sha,
    image: c.image,
    port: alloc.port,
    memoryMb,
  });
  attempt.started = containerName(target, c.sha);
  return alloc.port;
}

async function mustBeHealthy(ctx: Ctx, port: number) {
  if (!(await waitHealthy(ctx, port))) {
    throw new SwitchError(
      `/api/health did not answer 2xx in ${ctx.healthTimeoutMs / 1000}s`,
    );
  }
}

async function deployProduction(
  ctx: Ctx,
  c: ClaimedDeployment,
  attempt: Attempt,
) {
  const target: ProductionTarget = {
    project: c.project.name,
    env: "production",
  };
  const name = containerName(target, c.sha);
  if (c.hosts.length === 0)
    throw new SwitchError(`${c.project.name} has no domains`);

  // The same commit may still have its container from an earlier deployment: start that one.
  const kept = await ctx.repo.listKept(c.project.id);
  // Never the live one: a failed health check would then stop the site that is serving.
  if (kept.some((k) => k.container === name && k.status === "live")) {
    throw new SwitchError(`${c.sha.slice(0, 12)} is already live`);
  }
  const reuse = kept.find((k) => k.container === name && k.port !== null);
  let port: number;
  if (reuse?.port) {
    port = reuse.port;
    attempt.reused = true;
    await call(ctx, "container.start", { name });
    attempt.started = name;
  } else {
    port = await runNew(ctx, target, c, c.project.memoryMb, attempt);
  }

  await mustBeHealthy(ctx, port);
  if (reuse) await ctx.repo.clearContainer(reuse.id);
  await cutOver(ctx, target, {
    id: c.id,
    projectId: c.project.id,
    hosts: c.hosts,
    container: name,
    port,
  });
}

/**
 * Puts one preview to sleep (D017). Caddy first: if it refuses the "dormido" file, nothing changed
 * and the new preview does not start. Then the row (asleep), then the container: a stop that fails
 * throws, so the new one never starts beside it, and the asleep row keeps the container's name
 * until it is gone — the next `makeRoom` retries it before putting anyone else to sleep.
 */
async function sleepPreview(
  ctx: Ctx,
  project: { name: string; repo: string },
  v: RunningPreview,
) {
  if (v.status === "live") {
    await call(ctx, "preview.write", {
      project: project.name,
      pr: v.pr,
      state: "asleep",
    });
    if (!(await ctx.repo.markAsleep(v.id)))
      throw new SwitchError(`pr-${v.pr} changed while putting it to sleep`);
    ctx.log({
      event: "preview.asleep",
      project: project.name,
      pr: v.pr,
      container: v.container,
    });
  }
  await call(ctx, "container.stop", { name: v.container });
  await quietly(ctx, `remove ${v.container}`, async () => {
    await call(ctx, "container.remove", { name: v.container });
    await ctx.repo.clearContainer(v.id);
  });
  if (v.status === "live") {
    await upsertComment(
      ctx,
      { repo: project.repo, project: project.name, pr: v.pr },
      asleepCommentBody({ project: project.name, pr: v.pr }),
      false,
    );
  }
}

/** Before PR `pr`'s new container starts: if that would make more than PREVIEW_LIMIT running,
 * the others sleep, least recently pushed first (a leftover asleep container goes before any
 * live one). Production never counts. Runs under the project lock, so it reads a count no other
 * switch of the project is changing. */
async function makeRoom(
  ctx: Ctx,
  project: { id: string; name: string; repo: string },
  pr: number,
) {
  const others = (await ctx.repo.runningPreviews(project.id))
    .filter((r) => r.pr !== pr)
    .sort(
      (a, b) =>
        Number(a.status === "live") - Number(b.status === "live") ||
        +a.lastPushAt - +b.lastPushAt,
    );
  // The new one makes others + 1: leave PREVIEW_LIMIT - 1 others running.
  while (others.length > PREVIEW_LIMIT - 1) {
    const v = others.shift();
    if (v) await sleepPreview(ctx, project, v);
  }
}

/** A PR's preview: a new container beside the PR's current one, health, its preview file points
 * at it, then the previous one drains and is removed (previews keep nothing for rollback). */
async function deployPreview(
  ctx: Ctx,
  c: ClaimedDeployment,
  pr: number,
  attempt: Attempt,
) {
  const target: Target = { project: c.project.name, env: "preview", pr };
  const name = containerName(target, c.sha);
  await makeRoom(ctx, c.project, pr);
  const port = await runNew(ctx, target, c, MEMORY_MB.preview, attempt);
  await mustBeHealthy(ctx, port);

  await call(ctx, "preview.write", {
    project: c.project.name,
    pr,
    state: "running",
    port,
  });
  const previous = await ctx.repo.markLive(c.id, name, port);
  ctx.log({
    event: "switch.live",
    deployment: c.id,
    pr,
    container: name,
    port,
  });
  if (previous?.container && previous.container !== name) {
    const old = previous.container;
    await stopAfterDrain(ctx, previous, name);
    await quietly(ctx, `remove ${old}`, async () => {
      await call(ctx, "container.remove", { name: old });
      await ctx.repo.clearContainer(previous.id);
    });
  }
}

async function deployOne(
  ctx: Ctx,
  c: ClaimedDeployment,
): Promise<SwitchOutcome> {
  const attempt: Attempt = { started: null, reused: false };
  try {
    if (c.pr === null) await deployProduction(ctx, c, attempt);
    else await deployPreview(ctx, c, c.pr, attempt);
    return { result: "live" };
  } catch (e) {
    const message =
      e instanceof SwitchError
        ? e.message
        : `unexpected: ${(e as Error).message}`;
    ctx.log({ event: "switch.failed", deployment: c.id, error: message });
    if (attempt.started) {
      const n = attempt.started;
      await quietly(ctx, `stop ${n}`, () =>
        call(ctx, "container.stop", { name: n, timeoutS: 0 }),
      );
      // A kept container stays for rollback; a new one that never served is removed.
      if (!attempt.reused) {
        await quietly(ctx, `remove ${n}`, () =>
          call(ctx, "container.remove", { name: n }),
        );
      }
    }
    await ctx.repo.markFailed(c.id, message);
    return { result: "failed", error: message };
  }
}

/** The status GitHub gets for this deployment: production's on its first domain, a preview's
 * on its own host (`kit-deploy/preview`). */
function statusFor(c: ClaimedDeployment, outcome: SwitchOutcome): CommitStatus {
  const base = { repo: c.project.repo, sha: c.sha };
  const host = c.pr === null ? c.hosts[0] : previewHost(c.project.name, c.pr);
  const context =
    c.pr === null ? STATUS_CONTEXTS.production : STATUS_CONTEXTS.preview;
  if (outcome.result === "failed") {
    return {
      ...base,
      context,
      state: "failure",
      description: `Deploy failed: ${outcome.error}`,
    };
  }
  const what = c.pr === null ? "Live" : "Preview";
  return {
    ...base,
    context,
    state: "success",
    description: host ? `${what} at ${host}` : what,
    ...(host ? { targetUrl: `https://${host}` } : {}),
  };
}

/** Best effort, after the switch is decided: GitHub being down never changes the outcome. */
async function publishStatus(
  ctx: Ctx,
  c: ClaimedDeployment,
  outcome: SwitchOutcome,
) {
  if (!ctx.status) {
    ctx.log({
      event: "switch.status_skipped",
      deployment: c.id,
      reason: "no GITHUB_STATUS_TOKEN",
    });
    return;
  }
  const s = statusFor(c, outcome);
  try {
    await ctx.status(s);
    ctx.log({
      event: "switch.status",
      deployment: c.id,
      context: s.context,
      state: s.state,
    });
  } catch (e) {
    ctx.log({
      event: "switch.status_failed",
      deployment: c.id,
      context: s.context,
      error: (e as Error).message,
    });
  }
}

/** Best effort, like the status: creates or edits the PR's comment. `live` creates it if it is
 * not there yet; `closed` only edits it (a PR that never had a preview gets no comment). */
async function upsertComment(
  ctx: Ctx,
  p: { repo: string; project: string; pr: number; deployment?: string },
  body: string,
  create: boolean,
) {
  const where = {
    ...(p.deployment ? { deployment: p.deployment } : {}),
    project: p.project,
    pr: p.pr,
  };
  if (!ctx.comments) {
    ctx.log({
      event: "preview.comment_skipped",
      ...where,
      reason: "no GITHUB_STATUS_TOKEN",
    });
    return;
  }
  try {
    const result = await ctx.comments({
      repo: p.repo,
      pr: p.pr,
      marker: previewMarker(p.project),
      body,
      create,
    });
    if (result === "missing") {
      ctx.log({
        event: "preview.comment_skipped",
        ...where,
        reason: "no comment",
      });
      return;
    }
    ctx.log({ event: "preview.comment", ...where, result });
  } catch (e) {
    ctx.log({
      event: "preview.comment_failed",
      ...where,
      error: (e as Error).message,
    });
  }
}

/** After a preview's switch: its URL in the PR. A failed push leaves the comment as it was (it
 * still points at the preview that serves); the failure is on the commit's status. */
async function commentPreview(
  ctx: Ctx,
  c: ClaimedDeployment,
  outcome: SwitchOutcome,
) {
  if (c.pr === null || outcome.result !== "live") return;
  await upsertComment(
    ctx,
    {
      repo: c.project.repo,
      project: c.project.name,
      pr: c.pr,
      deployment: c.id,
    },
    liveCommentBody({ project: c.project.name, pr: c.pr, sha: c.sha }),
    true,
  );
}

/** Deploys the project's newest queued deployment (and any queued while it ran). */
export async function processProject(
  deps: SwitchDeps,
  projectId: string,
): Promise<Array<{ id: string } & SwitchOutcome>> {
  const ctx = withDefaults(deps);
  return ctx.repo.withProjectLock(projectId, async () => {
    const done: Array<{ id: string } & SwitchOutcome> = [];
    for (
      let c = await ctx.repo.claimNext(projectId);
      c;
      c = await ctx.repo.claimNext(projectId)
    ) {
      const outcome = await deployOne(ctx, c);
      await publishStatus(ctx, c, outcome);
      await commentPreview(ctx, c, outcome);
      done.push({ id: c.id, ...outcome });
    }
    return done;
  });
}

/**
 * PR `pr` was closed (live or asleep): its preview file goes (the host answers "preview no existe" again), its
 * queued and live deployments are superseded, and its containers are stopped and removed. Under
 * the project's lock, so it never races a switch of the same PR. Idempotent.
 */
export async function closePreview(
  deps: SwitchDeps,
  project: { id: string; name: string; repo: string },
  pr: number,
): Promise<{ removed: string[] }> {
  const ctx = withDefaults(deps);
  return ctx.repo.withProjectLock(project.id, async () => {
    // The file first: if Caddy refuses, nothing else changed and the next close retries it all.
    await call(ctx, "preview.remove", { project: project.name, pr });
    const rows = await ctx.repo.closePreview(project.id, pr);
    const removed: string[] = [];
    for (const r of rows) {
      await quietly(ctx, `remove ${r.container}`, async () => {
        await call(ctx, "container.stop", { name: r.container, timeoutS: 0 });
        await call(ctx, "container.remove", { name: r.container });
        await ctx.repo.clearContainer(r.id);
        removed.push(r.container);
      });
    }
    ctx.log({ event: "preview.closed", project: project.name, pr, removed });
    await upsertComment(
      ctx,
      { repo: project.repo, project: project.name, pr },
      closedCommentBody({ project: project.name, pr }),
      false,
    );
    return { removed };
  });
}

/** Back to the newest kept deployment before the live one. No build, no pull. */
export async function rollback(
  deps: SwitchDeps,
  projectName: string,
): Promise<{ from: string | null; to: string }> {
  const ctx = withDefaults(deps);
  const project = await ctx.repo.projectByName(projectName);
  if (!project) throw new SwitchError(`no project ${projectName}`);
  return ctx.repo.withProjectLock(project.id, async () => {
    const kept = await ctx.repo.listKept(project.id);
    const live = kept.find((k) => k.status === "live") ?? null;
    // One step back in history: the newest kept build older than the live one.
    const to = kept.find(
      (k): k is KeptDeployment & { port: number } =>
        k.status === "superseded" &&
        k.port !== null &&
        (!live || k.createdAt < live.createdAt),
    );
    if (!to)
      throw new SwitchError(
        `${projectName} has no earlier deployment to roll back to`,
      );
    const target: ProductionTarget = {
      project: project.name,
      env: "production",
    };

    await call(ctx, "container.start", { name: to.container });
    if (!(await waitHealthy(ctx, to.port))) {
      await quietly(ctx, `stop ${to.container}`, () =>
        call(ctx, "container.stop", { name: to.container, timeoutS: 0 }),
      );
      throw new SwitchError(
        `${to.container} did not pass /api/health; still on the live one`,
      );
    }
    await cutOver(ctx, target, {
      id: to.id,
      projectId: project.id,
      hosts: project.hosts,
      container: to.container,
      port: to.port,
    });
    return { from: live?.id ?? null, to: to.id };
  });
}

/** Rewrites every live site's Caddy file and starts its container if it is not running. */
export async function regenerate(
  deps: SwitchDeps,
): Promise<Array<{ project: string; ok: boolean; error?: string }>> {
  const ctx = withDefaults(deps);
  const containers = (await call(ctx, "container.list", {})) as Array<{
    name: string;
    state: string;
  }>;
  const running = new Set(
    containers.filter((c) => c.state === "running").map((c) => c.name),
  );
  const out: Array<{ project: string; ok: boolean; error?: string }> = [];
  for (const s of await ctx.repo.liveSites()) {
    try {
      if (!running.has(s.container))
        await call(ctx, "container.start", { name: s.container });
      await call(ctx, "site.write", {
        target: { project: s.project, env: "production" },
        hosts: s.hosts,
        port: s.port,
      });
      out.push({ project: s.project, ok: true });
    } catch (e) {
      out.push({ project: s.project, ok: false, error: (e as Error).message });
    }
  }
  return out;
}
