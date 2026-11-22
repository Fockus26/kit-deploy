/**
 * The real dependencies of Eliminar proyecto (lib/panel/actions/project-remove.ts, D069): the
 * database, kit-agent through its socket (D011) and the panel's one TOTP guard. Server only.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { socketClient } from "@/cli/client";
import { auth } from "@/lib/auth";
import { clientIp } from "@/lib/auth/handler";
import { betterAuthTotp } from "@/lib/auth/totp-check";
import { drizzleProjectRemovalStore } from "@/lib/db/project-remove";
import { db } from "@/lib/db/store";
import type { ProjectRemoveDeps } from "./actions/project-remove";
import { drizzlePanelStore } from "./data/store";
import { sessionUser } from "./session";
import { panelTotpGuard } from "./totp-guard";

export function projectRemoveDeps(): ProjectRemoveDeps {
  const database = db();
  const store = drizzlePanelStore(database);
  return {
    user: sessionUser,
    // The client's default timeout: above the agent's slowest step, so a long `docker rm` is
    // never cut halfway and reported as "kit-agent did not answer".
    agent: socketClient(
      process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock",
    ),
    removal: drizzleProjectRemovalStore(database),
    totpEnabled: (userId) => store.twoFactorEnabled(userId),
    verifyTotp: betterAuthTotp(auth, headers),
    guard: panelTotpGuard,
    clientIp: async () => clientIp(await headers()),
    log: (line) => console.warn(line),
    revalidate: (path, type) => revalidatePath(path, type),
  };
}
