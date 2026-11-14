import { db } from "@/lib/db/store";
import { handlePreviewExchange } from "@/lib/preview/access";
import { drizzlePreviewStore } from "@/lib/preview/store";

// Reached only on a preview host: Caddy rewrites <x>.preview.fockus.dev/__kit-deploy/exchange here.
export function POST(request: Request): Promise<Response> {
  return handlePreviewExchange(request, { store: drizzlePreviewStore(db()) });
}
