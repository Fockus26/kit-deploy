/**
 * The switch (brief, Architecture): the new container starts beside the old one → `/api/health`
 * answers → the site file points at it → `caddy reload` → the old one stops after a drain.
 * Rollback is the same switch onto a kept container; nothing is rebuilt. The last KEEP production
 * containers stay (stopped) for that; older ones are removed.
 *
 * Everything goes through kit-agent (`AgentClient`) and the database (`SwitchRepo`); time is
 * injected, so it is tested without waiting.
 */

import type { OpName } from "@/agent/protocol";
import type { AgentClient, Params } from "@/cli/client";
import { containerName, type Target } from "@/lib/core";
import type { ClaimedDeployment, KeptDeployment, SwitchRepo } from "./repo";

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
  target: Target,
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

async function deployOne(
  ctx: Ctx,
  c: ClaimedDeployment,
): Promise<SwitchOutcome> {
  const target: Target = { project: c.project.name, env: "production" };
  const name = containerName(target, c.sha);
  let started: string | null = null;
  let reused = false;
  try {
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
      reused = true;
      await call(ctx, "container.start", { name });
    } else {
      await call(ctx, "image.pull", { image: c.image });
      const alloc = (await call(ctx, "ports.allocate", {
        target,
        sha: c.sha,
      })) as { port: number };
      port = alloc.port;
      await call(ctx, "container.run", {
        target,
        sha: c.sha,
        image: c.image,
        port,
        memoryMb: c.project.memoryMb,
      });
    }
    started = name;

    if (!(await waitHealthy(ctx, port))) {
      throw new SwitchError(
        `/api/health did not answer 2xx in ${ctx.healthTimeoutMs / 1000}s`,
      );
    }
    if (reuse) await ctx.repo.clearContainer(reuse.id);
    await cutOver(ctx, target, {
      id: c.id,
      projectId: c.project.id,
      hosts: c.hosts,
      container: name,
      port,
    });
    return { result: "live" };
  } catch (e) {
    const message =
      e instanceof SwitchError
        ? e.message
        : `unexpected: ${(e as Error).message}`;
    ctx.log({ event: "switch.failed", deployment: c.id, error: message });
    if (started) {
      const n = started;
      await quietly(ctx, `stop ${n}`, () =>
        call(ctx, "container.stop", { name: n, timeoutS: 0 }),
      );
      // A kept container stays for rollback; a new one that never served is removed.
      if (!reused) {
        await quietly(ctx, `remove ${n}`, () =>
          call(ctx, "container.remove", { name: n }),
        );
      }
    }
    await ctx.repo.markFailed(c.id, message);
    return { result: "failed", error: message };
  }
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
      done.push({ id: c.id, ...(await deployOne(ctx, c)) });
    }
    return done;
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
    const target: Target = { project: project.name, env: "production" };

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
