import { connection } from "next/server";
import { db } from "@/lib/db/store";
import { handlePreviewAuth } from "@/lib/preview/access";
import { drizzlePreviewStore } from "@/lib/preview/store";

/** Shared by every request of this web process: forward_auth asks on every preview asset. */
const cache = new Map<string, number>();

// Caddy's forward_auth (one call per preview request, any method). Request time only: never
// prerendered at build (cacheComponents), where there is no database.
async function handle(request: Request): Promise<Response> {
  await connection();
  return handlePreviewAuth(request, {
    store: drizzlePreviewStore(db()),
    cache,
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
