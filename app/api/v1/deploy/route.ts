import { after } from "next/server";
import { handleDeploy } from "@/lib/api/deploy";
import { drizzleStore } from "@/lib/db/store";
import { switchDeps } from "@/lib/deploy/runtime";
import { processProject } from "@/lib/deploy/switch";

export async function POST(request: Request): Promise<Response> {
  return handleDeploy(request, drizzleStore(), {
    // The Action gets its 202 at once; the switch (pull, start, health, Caddy) runs after.
    onQueued: (projectId) =>
      after(async () => {
        try {
          await processProject(switchDeps(), projectId);
        } catch (e) {
          console.error("switch:", e instanceof Error ? e.message : e);
        }
      }),
  });
}
