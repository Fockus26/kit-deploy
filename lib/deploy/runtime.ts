/** The switch wired to the real agent socket and database (web app and CLI on the VPS). */
import { socketClient } from "@/cli/client";
import { db } from "@/lib/db/store";
import { drizzleSwitchRepo } from "./drizzle-repo";
import type { SwitchDeps } from "./switch";

export function switchDeps(): SwitchDeps {
  return {
    agent: socketClient(
      process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock",
    ),
    repo: drizzleSwitchRepo(db()),
  };
}
