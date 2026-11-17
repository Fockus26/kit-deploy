/**
 * `kit-deploy rebuild <project>` (phase 04 U8b): a NEXT_PUBLIC_* changed, which Next inlines at
 * build, so production needs a new image. The platform asks GitHub to run the project's
 * `deploy-vps.yml` on its production branch with `rebuild: true`; the Action builds with the
 * current public variables (build-env) and posts `{sha, rebuild: true}`, which deploys the
 * rebuilt image as the live commit's next generation. Needs the platform's GitHub token with
 * Actions: Read and write on the repo (César, 2026-11-17).
 */
import { assertRepo, discard, type GitHubRequest } from "./github";

export const WORKFLOW_FILE = "deploy-vps.yml";

const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

export async function dispatchRebuild(
  request: GitHubRequest,
  repo: string,
  branch: string,
): Promise<void> {
  if (!BRANCH.test(branch) || branch.includes("..")) {
    throw new Error(`bad branch "${branch}"`);
  }
  const res = await request(
    "POST",
    `/repos/${assertRepo(repo)}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    [204],
    // workflow_dispatch inputs travel as strings, also a boolean one.
    { ref: branch, inputs: { rebuild: "true" } },
  );
  await discard(res);
}
