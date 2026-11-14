import { requestUser } from "@/lib/auth";
import { db } from "@/lib/db/store";
import { handlePreviewAccess } from "@/lib/preview/access";
import { drizzlePreviewStore } from "@/lib/preview/store";

export function GET(request: Request): Promise<Response> {
  return handlePreviewAccess(request, {
    store: drizzlePreviewStore(db()),
    user: requestUser,
  });
}
