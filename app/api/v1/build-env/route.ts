import { handleBuildEnv } from "@/lib/api/build-env";
import { db, drizzleStore } from "@/lib/db/store";
import { drizzleSwitchRepo } from "@/lib/deploy/drizzle-repo";
import { switchDeps } from "@/lib/deploy/runtime";

/** The Action's `next build` variables for its environment (phase 04 U7). */
export async function POST(request: Request): Promise<Response> {
  const repo = drizzleSwitchRepo(db());
  return handleBuildEnv(request, drizzleStore(), {
    agent: switchDeps().agent,
    vars: (projectId, environment) => repo.envVars(projectId, environment),
  });
}
