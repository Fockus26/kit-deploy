import { handleDeploy } from "@/lib/api/deploy";
import { drizzleStore } from "@/lib/db/store";

export async function POST(request: Request): Promise<Response> {
  return handleDeploy(request, drizzleStore());
}
