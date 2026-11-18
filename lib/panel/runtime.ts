/**
 * The panel's real dependencies: kit_deploy through Drizzle and kit-agent through its socket
 * (D011: the web container never talks to Docker or holds the master key). Server only.
 *
 *   KIT_AGENT_SOCKET     default /run/kit-deploy/agent.sock
 *   GITHUB_STATUS_TOKEN  /etc/kit-deploy/github.env (rebuild dispatch, commit status)
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { socketClient } from "@/cli/client";
import { drizzleAlertsReader } from "@/lib/alerts/store";
import { drizzleCronStore } from "@/lib/cron/store";
import { drizzleAdminStore } from "@/lib/db/admin";
import { drizzleAuditStore } from "@/lib/db/audit";
import { drizzleEnvStore } from "@/lib/db/env-store";
import { db } from "@/lib/db/store";
import { drizzleTokenStore } from "@/lib/db/tokens";
import { drizzleSwitchRepo } from "@/lib/deploy/drizzle-repo";
import { githubRequest, githubTokenFromEnv } from "@/lib/deploy/github";
import { switchDeps } from "@/lib/deploy/runtime";
import { regenerate } from "@/lib/deploy/switch";
import { systemResolver } from "@/lib/domains/resolve";
import { drizzleDomainStore } from "@/lib/domains/store";
import { drizzleMetricsReader } from "@/lib/metrics/read";
import type { ActionDeps } from "./actions/deps";
import type { PanelDeps } from "./data/deps";
import { drizzlePanelStore } from "./data/store";
import { sessionUser } from "./session";

const SOCKET = () =>
  process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock";
/** A page waits this long for kit-agent, then shows "No se pudo hablar con kit-agent". */
export const READ_TIMEOUT_MS = 10_000;

export function panelDeps(): PanelDeps {
  const database = db();
  return {
    agent: socketClient(SOCKET(), READ_TIMEOUT_MS),
    store: drizzlePanelStore(database),
    env: drizzleEnvStore(database),
    domains: drizzleDomainStore(database),
    metrics: drizzleMetricsReader(database),
    tokens: drizzleTokenStore(database),
    alerts: drizzleAlertsReader(database),
    cron: drizzleCronStore(database),
    now: Date.now,
  };
}

export function actionDeps(): ActionDeps {
  const database = db();
  const sw = switchDeps();
  const store = drizzlePanelStore(database);
  const repo = drizzleSwitchRepo(database);
  return {
    user: sessionUser,
    agent: sw.agent,
    env: drizzleEnvStore(database),
    admin: drizzleAdminStore(database),
    tokens: drizzleTokenStore(database),
    switch: sw,
    domains: {
      store: drizzleDomainStore(database),
      resolve: systemResolver(),
      agent: sw.agent,
      liveProjects: async () =>
        new Set((await repo.liveSites()).map((s) => s.project)),
      regenerate: async (project) =>
        (await regenerate(sw, { project }))[0] ?? { ok: true },
    },
    openDeployment: (project, pr) => store.openDeployment(project, pr),
    github: () => {
      const token = githubTokenFromEnv();
      return token ? githubRequest(token) : null;
    },
    later: (task) => after(task),
    revalidate: (path, type) => revalidatePath(path, type),
    audit: drizzleAuditStore(database),
  };
}
