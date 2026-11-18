/** What the panel's actions work with; lib/panel/runtime.ts builds the real ones, tests fakes. */
import type { AgentClient } from "@/cli/client";
import type { AdminStore } from "@/lib/db/admin";
import type { EnvStore } from "@/lib/db/env-store";
import type { TokenStore } from "@/lib/db/tokens";
import type { GitHubRequest } from "@/lib/deploy/github";
import type { SwitchDeps } from "@/lib/deploy/switch";
import type { CheckDeps } from "@/lib/domains/check";
import type { SessionSource } from "./core";

export type ActionDeps = SessionSource & {
  agent: AgentClient;
  env: EnvStore;
  admin: AdminStore;
  tokens: TokenStore;
  /** The switch (redeploy, rollback) with the agent and the database. */
  switch: SwitchDeps;
  /** The domain store, resolver and site rewrite (`domain check`'s). */
  domains: CheckDeps;
  /** A queued or starting deployment of that scope (production, or one PR): a second submit of
   * Redeploy finds the first one's instead of queueing another. */
  openDeployment(
    project: string,
    pr: number | null,
  ): Promise<{ id: string; sha: string; generation: number } | null>;
  /** GitHub with the platform's token, or null without it. */
  github(): GitHubRequest | null;
  /** Runs after the response is sent (Next's `after`): the switch of a redeploy. */
  later(task: () => Promise<void>): void;
  /** `revalidatePath` of the pages that show what changed. */
  revalidate(path: string, type?: "page" | "layout"): void;
};
