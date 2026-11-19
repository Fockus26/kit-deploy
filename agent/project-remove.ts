/**
 * `project.remove` (D059): what kit-deploy put on the machine for one project, taken off it — so a
 * project is retired the platform's way, not by hand on the VPS. Only what kit-deploy's own
 * records say is the project's:
 * - Caddy files: `/etc/caddy/sites/<project>.caddy` and `/etc/caddy/previews/<project>-pr-<n>.caddy`,
 *   each only if its first line is the header kit-deploy writes for that name;
 * - containers: Docker's labels `dev.fockus.kit-deploy=1` and `…project=<project>` (gaby,
 *   evolution_* or the dashboard never carry them);
 * - images: tags of the repository in the root-owned pin `/etc/kit-deploy/images/<project>` (the
 *   database is the web app's to write, so it never decides), none still used by a container;
 * - the pin itself, last, and only once everything above is gone.
 *
 * Order: the Caddy files first, in one validate + reload, so no host is ever proxied to a container
 * that is gone; if Caddy refuses, every file is put back and nothing else is touched. Then the
 * containers (stopped, then `docker rm` without `-f`), the images (`docker image rm` without
 * `-f`: Docker refuses one in use) and the pin.
 *
 * Kept, always: the kit-db databases `<project>` / `<project>_preview` and their markers (no
 * `kit-db drop` here: CLAUDE.md), the master key, the logs (14 days) and Caddy's certificates.
 * Running it again finds nothing and is not an error.
 */
import { CADDY_PREVIEWS_DIR, CADDY_SITES_DIR } from "../lib/core/constants";
import { IMAGE_PINS_DIR, parsePin, pinPath } from "../lib/core/image-pin";
import { assertProject } from "../lib/core/validate";
import { ownsDatabase } from "./databases";
import type { Deps } from "./deps";
import { parseImages } from "./images";
import type { ManagedContainer } from "./ops";

export type ProjectRemoval = {
  project: string;
  dryRun: boolean;
  /** Caddy files removed (or that would be). */
  sites: string[];
  /** Containers removed (or that would be), with the state they had. */
  containers: { name: string; state: string }[];
  /** `repo:tag` removed (or that would be). */
  images: string[];
  /** The pin file, when it was (or would be) removed. */
  pin: string | null;
  /** Never touched: whether each exists in kit-db and is kit-deploy's (D051). */
  databases: { database: string; exists: boolean; managed: boolean }[];
  /** What was left and why: a file without kit-deploy's header, an image another pin shares. */
  skipped: string[];
  /** What failed; a second run retries it. */
  failed: string[];
};

/** What the Agent lends: its container list and its validate + reload with rollback. */
export type RemoveHooks = {
  list(): Promise<ManagedContainer[]>;
  applySiteChanges(
    files: readonly { path: string; previous: string | null }[],
    change: () => Promise<void>,
  ): Promise<void>;
};

const TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_S = 10;
const PREVIEW_NAME = /^([a-z0-9][a-z0-9_]{0,39})-pr-([1-9][0-9]{0,5})\.caddy$/;
const PROJECT_FILE = /^[a-z0-9][a-z0-9_]{0,39}$/;

/** The end of a command's stderr, one line, bounded. */
function why(r: { code: number; stderr: string }): string {
  return r.stderr.trim().split("\n").at(-1)?.slice(0, 200) || `exit ${r.code}`;
}

/** The project's Caddy files that carry kit-deploy's header for their name, with their content. */
async function siteFiles(
  deps: Deps,
  project: string,
  skipped: string[],
): Promise<{ path: string; previous: string }[]> {
  const candidates: { path: string; name: string }[] = [
    { path: `${CADDY_SITES_DIR}/${project}.caddy`, name: project },
  ];
  for (const f of (await deps.listFiles(CADDY_PREVIEWS_DIR)).sort()) {
    const m = PREVIEW_NAME.exec(f);
    if (m?.[1] === project)
      candidates.push({
        path: `${CADDY_PREVIEWS_DIR}/${f}`,
        name: `${project}-pr-${m[2]}`,
      });
  }
  const out: { path: string; previous: string }[] = [];
  for (const c of candidates) {
    const previous = await deps.readFile(c.path);
    if (previous === null) continue;
    // `— ` after a production name, ` (` after a preview's: never a prefix of another name.
    const header = `# Written by kit-deploy for ${c.name}${c.name === project ? " — " : " ("}`;
    if (previous.startsWith(header)) out.push({ path: c.path, previous });
    else skipped.push(`${c.path}: not written by kit-deploy, left as it is`);
  }
  return out;
}

/** Every container on the machine (any label) with the image it uses: an image one of them
 * references is never removed. */
async function containerImages(
  deps: Deps,
): Promise<{ name: string; refs: string[] }[] | string> {
  const r = await deps.run(
    [
      "docker",
      "ps",
      "-a",
      "--no-trunc",
      "--format",
      "{{.Names}}\t{{.Image}}\t{{.ImageID}}",
    ],
    { timeoutMs: TIMEOUT_MS },
  );
  if (r.code !== 0) return `docker ps failed: ${why(r)}`;
  return r.stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [name, ...refs] = l.trim().split("\t");
      return { name: name ?? "", refs: refs.filter(Boolean) };
    });
}

export async function removeProject(
  deps: Deps,
  rawProject: string,
  dryRun: boolean,
  hooks: RemoveHooks,
): Promise<ProjectRemoval> {
  const project = assertProject(rawProject);
  const out: ProjectRemoval = {
    project,
    dryRun,
    sites: [],
    containers: [],
    images: [],
    pin: null,
    databases: [],
    skipped: [],
    failed: [],
  };

  // 1. Caddy: every file of the project in one change; a refusal puts them all back and stops here.
  const sites = await siteFiles(deps, project, out.skipped);
  out.sites = sites.map((s) => s.path);
  if (!dryRun && sites.length > 0) {
    await hooks.applySiteChanges(sites, async () => {
      for (const s of sites) await deps.removeFile(s.path);
    });
  }

  // 2. Containers: Docker's labels decide (the list filters on both); the name is checked again.
  const mine = (await hooks.list()).filter(
    (c) => c.project === project && c.name.startsWith(`${project}-`),
  );
  const removed = new Set<string>();
  for (const c of mine) {
    out.containers.push({ name: c.name, state: c.state });
    if (dryRun) {
      removed.add(c.name);
      continue;
    }
    if (["running", "restarting", "paused"].includes(c.state)) {
      const s = await deps.run(
        ["docker", "stop", `--time=${STOP_TIMEOUT_S}`, c.name],
        { timeoutMs: TIMEOUT_MS },
      );
      if (s.code !== 0) {
        out.failed.push(`${c.name}: docker stop failed: ${why(s)}`);
        continue;
      }
    }
    const r = await deps.run(["docker", "rm", c.name], {
      timeoutMs: TIMEOUT_MS,
    });
    if (r.code === 0) removed.add(c.name);
    else out.failed.push(`${c.name}: docker rm failed: ${why(r)}`);
  }
  if (!dryRun)
    out.containers = out.containers.filter((c) => removed.has(c.name));

  // 3. Images of the pinned repository, unless another project pins the same one.
  const path = pinPath(project);
  const pin = parsePin(await deps.readFile(path));
  let pinShared = false;
  if (pin !== null) {
    for (const f of await deps.listFiles(IMAGE_PINS_DIR)) {
      if (f === project || !PROJECT_FILE.test(f)) continue;
      if (parsePin(await deps.readFile(`${IMAGE_PINS_DIR}/${f}`)) === pin)
        pinShared = true;
    }
    if (pinShared)
      out.skipped.push(`${pin}: also pinned by another project, images kept`);
  }
  if (pin !== null && !pinShared) {
    const all = await containerImages(deps);
    const ls = await deps.run(
      [
        "docker",
        "image",
        "ls",
        pin,
        "--no-trunc",
        "--format",
        "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}",
      ],
      { timeoutMs: TIMEOUT_MS },
    );
    if (typeof all === "string") out.failed.push(all);
    else if (ls.code !== 0)
      out.failed.push(`${pin}: docker image ls failed: ${why(ls)}`);
    else {
      // In a dry run the project's own containers are still there: they will not hold anything.
      const used = new Set(
        all.filter((c) => !removed.has(c.name)).flatMap((c) => c.refs),
      );
      for (const img of parseImages(ls.stdout, pin)) {
        if (used.has(img.ref) || used.has(img.id)) {
          out.skipped.push(`${img.ref}: used by a container, kept`);
          continue;
        }
        if (dryRun) {
          out.images.push(img.ref);
          continue;
        }
        const r = await deps.run(["docker", "image", "rm", img.ref], {
          timeoutMs: TIMEOUT_MS,
        });
        if (r.code === 0) out.images.push(img.ref);
        else out.failed.push(`${img.ref}: docker image rm failed: ${why(r)}`);
      }
    }
  }

  // 4. The pin, last: while anything above is left, a second run still needs it to find it.
  if (pin !== null || (await deps.readFile(path)) !== null) {
    if (out.failed.length > 0)
      out.skipped.push(`${path}: kept until the failures above are fixed`);
    else {
      if (!dryRun) await deps.removeFile(path);
      out.pin = path;
    }
  }

  // Kept: the databases. Only whether they exist (kit-db's output, with the URL, is dropped).
  for (const database of [project, `${project}_preview`]) {
    const r = await deps.run(["kit-db", "url", database]);
    out.databases.push({
      database,
      exists: r.code === 0,
      managed: await ownsDatabase(deps, database),
    });
  }

  deps.log({
    event: "project.remove",
    project,
    dryRun,
    sites: out.sites.length,
    containers: out.containers.length,
    images: out.images.length,
    pin: out.pin !== null,
    failed: out.failed.length,
  });
  return out;
}
