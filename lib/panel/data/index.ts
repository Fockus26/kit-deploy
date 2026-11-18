/**
 * What the panel's pages read (phase 05 W6, D032). Each reader checks the session first
 * (`panelUser()`: none → /login), runs once per request (React `cache`) and is dynamic: call it
 * inside a Suspense boundary (cacheComponents). kit-agent down is a typed `{ unavailable:
 * "agent" }` in the part it affects, never a throw. Server only: it opens the database and the
 * agent socket.
 */
import { cache } from "react";
import type { Environment } from "@/lib/core/env";
import type { DeploymentStatus } from "@/lib/db/schema";
import { panelDeps } from "../runtime";
import { panelUser } from "../session";
import {
  readDeployment,
  readDeployments,
  readHome,
  readPreviews,
  readProjectOverview,
} from "./projects";
import {
  type LogLevel,
  readCron,
  readDatabases,
  readDomains,
  readEnvList,
  readLogFilters,
  readLogsSearch,
  readLogsTail,
  readSettings,
} from "./resources";

export { isUnavailable, type Unavailable } from "./deps";
export type * from "./projects";
export type * from "./resources";

export const homeData = cache(async () => {
  await panelUser();
  return readHome(panelDeps());
});

/** null: no such project (the page calls `notFound()`). */
export const projectOverview = cache(async (project: string) => {
  await panelUser();
  return readProjectOverview(panelDeps(), project);
});

export const deployments = cache(
  async (
    project: string,
    environment?: "production" | "preview",
    status?: DeploymentStatus,
  ) => {
    await panelUser();
    return readDeployments(panelDeps(), project, { environment, status });
  },
);

export const deploymentDetail = cache(async (project: string, id: string) => {
  await panelUser();
  return readDeployment(panelDeps(), project, id);
});

export const previews = cache(async (project: string) => {
  await panelUser();
  return readPreviews(panelDeps(), project);
});

export const envList = cache(
  async (project: string, environment: Environment) => {
    await panelUser();
    return readEnvList(panelDeps(), project, environment);
  },
);

export const domainsData = cache(async (project: string) => {
  await panelUser();
  return readDomains(panelDeps(), project);
});

export const logFilters = cache(async (project: string) => {
  await panelUser();
  return readLogFilters(panelDeps(), project);
});

export const logsTail = cache(
  async (project: string, env?: string, level?: LogLevel, lines?: number) => {
    await panelUser();
    return readLogsTail(panelDeps(), project, {
      ...(env ? { env } : {}),
      ...(level ? { level } : {}),
      ...(lines ? { lines } : {}),
    });
  },
);

export const logsSearch = cache(
  async (
    project: string,
    day: string,
    query?: string,
    env?: string,
    level?: LogLevel,
    before?: number,
  ) => {
    await panelUser();
    return readLogsSearch(panelDeps(), project, {
      day,
      ...(query ? { query } : {}),
      ...(env ? { env } : {}),
      ...(level ? { level } : {}),
      ...(before !== undefined ? { before } : {}),
    });
  },
);

export const databases = cache(async (project: string) => {
  await panelUser();
  return readDatabases(panelDeps(), project);
});

/** `auditBefore`: the previous page's `auditNext` (an ISO date in the URL). */
export const settingsData = cache(async (auditBefore?: string) => {
  const user = await panelUser();
  const before = auditBefore ? new Date(auditBefore) : undefined;
  return readSettings(
    panelDeps(),
    user.userId,
    before && !Number.isNaN(+before) ? before : undefined,
  );
});

/** null: no such project (the page calls `notFound()`). */
export const cronData = cache(async (project: string) => {
  await panelUser();
  return readCron(panelDeps(), project);
});
