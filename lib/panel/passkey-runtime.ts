/**
 * The real dependencies of Eliminar passkey (lib/panel/actions/passkeys.ts, D055). Server only.
 * The guard lives as long as the web process: one container (lib/auth/totp-check.ts).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { clientIp } from "@/lib/auth/handler";
import { betterAuthTotp, memoryTotpGuard } from "@/lib/auth/totp-check";
import { drizzlePasskeyStore } from "@/lib/db/passkeys";
import { db } from "@/lib/db/store";
import type { PasskeyDeps } from "./actions/passkeys";
import { drizzlePanelStore } from "./data/store";
import { sessionUser } from "./session";

const guard = memoryTotpGuard();

export function passkeyDeps(): PasskeyDeps {
  const database = db();
  const store = drizzlePanelStore(database);
  return {
    user: sessionUser,
    passkeys: drizzlePasskeyStore(database),
    totpEnabled: (userId) => store.twoFactorEnabled(userId),
    verifyTotp: betterAuthTotp(auth, headers),
    guard,
    clientIp: async () => clientIp(await headers()),
    log: (line) => console.warn(line),
    revalidate: (path) => revalidatePath(path),
  };
}
