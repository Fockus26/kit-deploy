/**
 * `kit-deploy images prune` (phase 06, D049): kit-deploy-images-prune.timer's nightly job (root).
 * Keeps the newest 5 images of each project's repository and any image a container uses.
 */
import type { PruneResult } from "../agent/images";
import type { AgentClient } from "./client";

type Result = { code: number; out: string; err: string };

export const IMAGES_KEEP = 5;
export const IMAGES_USAGE = `usage:
  kit-deploy images prune [--keep <n>] [--dry-run] [--json]
                     each project's images beyond the newest <n> (default ${IMAGES_KEEP}) that no
                     container uses. Nightly by kit-deploy-images-prune.timer (root)
`;

export async function imagesCommand(
  client: AgentClient,
  args: string[],
  json: boolean,
): Promise<Result> {
  if (args[0] !== "prune") return { code: 2, out: "", err: IMAGES_USAGE };
  const k = args.indexOf("--keep");
  const keep = k >= 0 ? Number(args[k + 1]) : IMAGES_KEEP;
  if (!Number.isInteger(keep) || keep < 1 || keep > 50)
    return { code: 2, out: "", err: "--keep takes 1 to 50\n" };
  const dryRun = args.includes("--dry-run");
  const res = await client.call("images.prune", { keep, dryRun });
  if (!res.ok)
    return {
      code: 1,
      out: "",
      err: `kit-agent: ${res.error.code}: ${res.error.message}\n`,
    };
  const r = res.result as PruneResult;
  if (json) return { code: 0, out: `${JSON.stringify(r)}\n`, err: "" };
  const verb = dryRun ? "would remove" : "removed";
  const out = [
    ...r.removed.map((ref) => `${verb} ${ref}`),
    `${verb} ${r.removed.length}, kept ${r.kept}`,
  ];
  return {
    code: 0,
    out: `${out.join("\n")}\n`,
    err: r.failed.map((f) => `warning: ${f}\n`).join(""),
  };
}
