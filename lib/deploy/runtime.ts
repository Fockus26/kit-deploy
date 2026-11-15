/** The switch wired to the real agent socket and database (web app and CLI on the VPS). */
import { socketClient } from "@/cli/client";
import { db } from "@/lib/db/store";
import { statusPublisherFromEnv } from "./commit-status";
import { drizzleSwitchRepo } from "./drizzle-repo";
import { commenterFromEnv } from "./pr-comment";
import type { SwitchDeps } from "./switch";

export function switchDeps(): SwitchDeps {
  return {
    agent: socketClient(
      process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock",
    ),
    repo: drizzleSwitchRepo(db()),
    // GITHUB_STATUS_TOKEN comes from /etc/kit-deploy/github.env (docker --env-file).
    status: statusPublisherFromEnv(),
    // The same token edits the PR's preview comment (Pull requests: read and write).
    comments: commenterFromEnv(),
  };
}
