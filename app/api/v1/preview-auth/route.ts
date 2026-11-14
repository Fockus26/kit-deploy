import { db } from "@/lib/db/store";
import { handlePreviewAuth } from "@/lib/preview/access";
import { drizzlePreviewStore } from "@/lib/preview/store";

/** Shared by every request of this web process: forward_auth asks on every preview asset. */
const cache = new Map<string, number>();

// Caddy's forward_auth (one call per preview request, any method).
const handle = (request: Request) =>
  handlePreviewAuth(request, { store: drizzlePreviewStore(db()), cache });

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
