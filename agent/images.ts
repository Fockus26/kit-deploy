/**
 * `images.prune` (phase 06, D049): the nightly cleanup of the projects' images. Only repositories
 * pinned in /etc/kit-deploy/images/<project> are looked at (the root-owned list of what kit-deploy
 * pulls), so gaby's, evolution's or the dashboard's own image are never candidates. Per pinned
 * repository the `keep` newest are kept, and so is every image any container on the machine uses
 * (running or stopped: a stopped one is a rollback target). The rest is `docker image rm` — never
 * `-f`, so Docker itself refuses anything still in use.
 */
import { IMAGE_PINS_DIR, parsePin } from "../lib/core/image-pin";
import type { Deps } from "./deps";

export type PruneResult = {
  /** `repo:tag` removed (or that would be, with dryRun). */
  removed: string[];
  kept: number;
  /** `repo:tag: why` that Docker refused. */
  failed: string[];
};

const TIMEOUT_MS = 60_000;
const PROJECT_FILE = /^[a-z0-9][a-z0-9_]{0,39}$/;

type Image = { id: string; ref: string; created: number };

function parseImages(stdout: string, pin: string): Image[] {
  const out: Image[] = [];
  for (const line of stdout.split("\n")) {
    const [id, repo, tag, created] = line.trim().split("\t");
    if (!id || repo !== pin || !tag || tag === "<none>") continue;
    // `docker image ls` CreatedAt: `2026-11-18 03:00:00 +0000 UTC`.
    const t = Date.parse(
      (created ?? "").replace(/ \+0000 UTC$/, "Z").replace(" ", "T"),
    );
    out.push({ id, ref: `${repo}:${tag}`, created: Number.isNaN(t) ? 0 : t });
  }
  return out;
}

export async function pruneImages(
  deps: Deps,
  keep: number,
  dryRun: boolean,
): Promise<PruneResult> {
  const pins = new Set<string>();
  for (const f of await deps.listFiles(IMAGE_PINS_DIR)) {
    if (!PROJECT_FILE.test(f)) continue;
    const pin = parsePin(await deps.readFile(`${IMAGE_PINS_DIR}/${f}`));
    if (pin) pins.add(pin);
  }
  const result: PruneResult = { removed: [], kept: 0, failed: [] };
  if (pins.size === 0) return result;

  // Every container, any label: an image a container references is never removed.
  const ps = await deps.run(
    [
      "docker",
      "ps",
      "-a",
      "--no-trunc",
      "--format",
      "{{.Image}}\t{{.ImageID}}",
    ],
    {
      timeoutMs: TIMEOUT_MS,
    },
  );
  if (ps.code !== 0) throw new Error(`docker ps failed (exit ${ps.code})`);
  const used = new Set(
    ps.stdout
      .split(/[\t\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

  for (const pin of [...pins].sort()) {
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
    if (ls.code !== 0) {
      result.failed.push(`${pin}: docker image ls failed (exit ${ls.code})`);
      continue;
    }
    const images = parseImages(ls.stdout, pin).sort(
      (a, b) => b.created - a.created,
    );
    images.forEach((img, i) => {
      if (i < keep || used.has(img.ref) || used.has(img.id)) result.kept++;
    });
    const doomed = images.filter(
      (img, i) => i >= keep && !used.has(img.ref) && !used.has(img.id),
    );
    for (const img of doomed) {
      if (dryRun) {
        result.removed.push(img.ref);
        continue;
      }
      const r = await deps.run(["docker", "image", "rm", img.ref], {
        timeoutMs: TIMEOUT_MS,
      });
      if (r.code === 0) result.removed.push(img.ref);
      else
        result.failed.push(
          `${img.ref}: ${r.stderr.trim().split("\n").at(-1)?.slice(0, 200) ?? `exit ${r.code}`}`,
        );
    }
  }
  deps.log({
    event: "images.prune",
    dryRun,
    removed: result.removed.length,
    kept: result.kept,
    failed: result.failed.length,
  });
  return result;
}
