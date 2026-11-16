/**
 * The nightly sweep (`kit-deploy preview sweep`, phase 03 U10): what a missed close or a failed
 * stop left behind.
 *
 *   1. Previews whose PR is closed on GitHub (the `DELETE /api/v1/preview` never arrived): closed
 *      like a normal close (`closePreview`: file, rows, containers, comment). Needs the token.
 *   2. `<project>-pr-<n>-<sha>` containers no deployment row holds (a stop that failed, a switch
 *      that died mid-way): stopped and removed. Only from `container.list`, which lists nothing
 *      but kit-deploy's label, and only names that match their own labels; the agent checks the
 *      label again before each stop and remove. gaby, evolution_* and the rest are never listed.
 *   3. `/etc/caddy/previews/<project>-pr-<n>.caddy` with no live or asleep preview in the
 *      database: removed through `preview.remove` (validate + bounded reload, restored on error).
 *
 * 2 and 3 run per project under its switch lock, so they never race a deploy or a close of the
 * same project (mid-switch, a new container exists before its row names it). Everything goes
 * through kit-agent's validated operations (D011). `dryRun` reads and reports, changes nothing.
 */

import type { OpName } from "@/agent/protocol";
import type { Params } from "@/cli/client";
import type { PullStateReader } from "./pr-state";
import { closePreview, type SwitchDeps } from "./switch";

export type SweepProject = { id: string; name: string; repo: string };

export interface SweepRepo {
  projects(): Promise<SweepProject[]>;
  /** PRs that still have something: an open (queued, starting, live) or asleep preview
   * deployment, or a preview row that still names a container. Each (project, PR) once. */
  previewPrs(): Promise<Array<{ project: SweepProject; pr: number }>>;
  /** Read under the project's lock: every container name a row of the project still holds (any
   * environment), and the PRs with a live or asleep preview (the ones that own a file). */
  holds(projectId: string): Promise<{ containers: string[]; prs: number[] }>;
}

export type SweepDeps = {
  switch: SwitchDeps;
  sweep: SweepRepo;
  /** null = no GitHub token: closed PRs are not swept this run (and the output says so). */
  pullState: PullStateReader | null;
  dryRun?: boolean;
};

export type SweepReport = {
  lines: string[];
  closed: number;
  containers: number;
  files: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
};

type Listed = {
  name: string;
  state: string;
  project: string;
  env: string;
  site: string;
};

const PROJECT = /^[a-z0-9][a-z0-9_]{0,39}$/;
const PREVIEW_CONTAINER =
  /^([a-z0-9][a-z0-9_]{0,39})-pr-([1-9][0-9]{0,5})-[0-9a-f]{7,12}$/;

async function call<O extends OpName>(
  deps: SweepDeps,
  op: O,
  params: Params<O>,
): Promise<unknown> {
  const res = await deps.switch.agent.call(op, params);
  if (!res.ok)
    throw new Error(`${op}: ${res.error.code}: ${res.error.message}`);
  return res.result;
}

/** A preview container this sweep may touch: kit-deploy's label says preview, and its name, its
 * project label and its site label all agree. Anything else is left as it is. */
function previewContainer(c: Listed): { project: string; pr: number } | null {
  if (c.env !== "preview") return null;
  const m = PREVIEW_CONTAINER.exec(c.name);
  if (!m?.[1] || !m[2]) return null;
  if (c.project !== m[1] || c.site !== `${m[1]}-pr-${m[2]}`) return null;
  return { project: m[1], pr: Number(m[2]) };
}

export async function sweepPreviews(deps: SweepDeps): Promise<SweepReport> {
  const dry = deps.dryRun === true;
  const r: SweepReport = {
    lines: [],
    closed: 0,
    containers: 0,
    files: 0,
    skipped: 0,
    failed: 0,
    dryRun: dry,
  };
  const say = (line: string) => r.lines.push(line);
  const failed = (what: string, e: unknown) => {
    r.failed++;
    say(`failed ${what}: ${(e as Error).message}`);
  };
  const skip = (line: string) => {
    r.skipped++;
    say(`skip ${line}`);
  };
  const lock = <T>(projectId: string, fn: () => Promise<T>) =>
    deps.switch.repo.withProjectLock(projectId, fn);

  // 1. Previews of PRs closed on GitHub.
  if (!deps.pullState) {
    skip(
      "closed PRs: no GITHUB_STATUS_TOKEN (github.env), their previews are not checked",
    );
  } else {
    let prs: Awaited<ReturnType<SweepRepo["previewPrs"]>> = [];
    try {
      prs = await deps.sweep.previewPrs();
    } catch (e) {
      failed("listing previews", e);
    }
    for (const { project, pr } of prs) {
      const what = `${project.name} pr-${pr}`;
      try {
        const state = await deps.pullState(project.repo, pr);
        if (state === "open") continue;
        if (state === "missing") {
          skip(
            `${what}: ${project.repo}#${pr} not found on GitHub, left as it is`,
          );
          continue;
        }
        if (dry) {
          say(`would close ${what}: PR closed on GitHub`);
        } else {
          const { removed } = await closePreview(deps.switch, project, pr);
          say(
            `closed ${what}: PR closed on GitHub; file removed, ${removed.length} container(s) removed${removed.length ? ` (${removed.join(", ")})` : ""}`,
          );
        }
        r.closed++;
      } catch (e) {
        failed(`closing ${what}`, e);
      }
    }
  }

  let projects: SweepProject[];
  try {
    projects = await deps.sweep.projects();
  } catch (e) {
    failed("listing projects", e);
    return r;
  }
  const known = new Set(projects.map((p) => p.name));

  const removeContainer = async (c: Listed, why: string) => {
    if (dry) {
      say(`would remove container ${c.name} (${c.state}): ${why}`);
      r.containers++;
      return;
    }
    try {
      if (
        c.state === "running" ||
        c.state === "restarting" ||
        c.state === "paused"
      )
        await call(deps, "container.stop", { name: c.name, timeoutS: 0 });
      await call(deps, "container.remove", { name: c.name });
      say(`removed container ${c.name} (${c.state}): ${why}`);
      r.containers++;
    } catch (e) {
      failed(`removing container ${c.name}`, e);
    }
  };

  const removeFile = async (project: string, pr: number, why: string) => {
    const file = `/etc/caddy/previews/${project}-pr-${pr}.caddy`;
    if (dry) {
      say(`would remove file ${file}: ${why}`);
      r.files++;
      return;
    }
    try {
      await call(deps, "preview.remove", { project, pr });
      say(`removed file ${file}: ${why}`);
      r.files++;
    } catch (e) {
      failed(`removing file ${file}`, e);
    }
  };

  const listFiles = async () =>
    (await call(deps, "preview.list", {})) as {
      previews: Array<{ project: string; pr: number }>;
      ignored: number;
    };

  // 2 + 3, per project, under its lock.
  for (const p of projects) {
    try {
      await lock(p.id, async () => {
        const holds = await deps.sweep.holds(p.id);
        const held = new Set(holds.containers);
        const live = new Set(holds.prs);
        const listed = (await call(deps, "container.list", {
          project: p.name,
        })) as Listed[];
        for (const c of listed) {
          if (c.env !== "preview") continue;
          const id = previewContainer(c);
          if (!id || id.project !== p.name) {
            skip(
              `container ${c.name}: its name does not match its labels, left as it is`,
            );
            continue;
          }
          if (held.has(c.name)) continue;
          await removeContainer(c, "no deployment holds it");
        }
        const { previews } = await listFiles();
        for (const f of previews) {
          if (f.project !== p.name || live.has(f.pr)) continue;
          await removeFile(
            f.project,
            f.pr,
            "no live or asleep preview in the database",
          );
        }
      });
    } catch (e) {
      failed(`sweeping ${p.name}`, e);
    }
  }

  // Leftovers of a project that is no longer in the database: no lock to take, nothing to race.
  try {
    const listed = (await call(deps, "container.list", {})) as Listed[];
    for (const c of listed) {
      if (c.env !== "preview" || known.has(c.project)) continue;
      const id = previewContainer(c);
      if (!id) {
        skip(
          `container ${c.name}: its name does not match its labels, left as it is`,
        );
        continue;
      }
      await removeContainer(c, `project ${id.project} is not in the database`);
    }
    const { previews, ignored } = await listFiles();
    for (const f of previews) {
      if (known.has(f.project) || !PROJECT.test(f.project)) continue;
      await removeFile(
        f.project,
        f.pr,
        `project ${f.project} is not in the database`,
      );
    }
    if (ignored > 0)
      skip(
        `${ignored} file(s) in /etc/caddy/previews/ that are not preview files, left as they are`,
      );
  } catch (e) {
    failed("sweeping unknown projects", e);
  }

  const verb = dry ? "would remove" : "removed";
  say(
    `sweep${dry ? " (dry run)" : ""}: ${r.closed} closed PR(s) ${dry ? "would be " : ""}cleaned, ${verb} ${r.containers} container(s) and ${r.files} file(s), ${r.skipped} skipped, ${r.failed} failed`,
  );
  return r;
}
