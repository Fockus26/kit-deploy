import { connection } from "next/server";
import { requestUser } from "@/lib/auth";
import { db } from "@/lib/db/store";
import { handlePreviewAccess } from "@/lib/preview/access";
import { drizzlePreviewStore } from "@/lib/preview/store";

export async function GET(request: Request): Promise<Response> {
  // Request time only: never prerendered at build (cacheComponents), where there is no database.
  await connection();
  return handlePreviewAccess(request, {
    store: drizzlePreviewStore(db()),
    user: requestUser,
  });
}
