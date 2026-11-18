import { connection } from "next/server";
import { logsTail } from "@/lib/panel/data";
import { handleLogsPoll } from "@/lib/panel/logs-poll";
import { sessionUser } from "@/lib/panel/session";

// Request time only (cacheComponents): the session and kit-agent are per request.
export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleLogsPoll(request, {
    signedIn: async () => (await sessionUser()) !== null,
    tail: (project, env, level, lines) => logsTail(project, env, level, lines),
  });
}
