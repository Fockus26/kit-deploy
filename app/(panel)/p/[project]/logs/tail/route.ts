/**
 * Thin wrapper of `logsTail` for the Logs page's live follow (polled every 2 s). The session is
 * checked here (a missing one answers 401, never the login redirect `panelUser()` would throw),
 * and the filters are validated with the agent's own shapes. Nothing else of the panel reads it.
 */
import { type NextRequest, NextResponse } from "next/server";
import { FOLLOW_LINES, LOG_ENV, LOG_LEVELS } from "@/lib/kit/logs-page";
import { isUnavailable, logsTail } from "@/lib/panel/data";
import { findProject } from "@/lib/panel/projects";
import { sessionUser } from "@/lib/panel/session";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project: string }> },
) {
  if (!(await sessionUser())) return json({ error: "unauthorized" }, 401);
  const { project } = await params;
  if (!(await findProject(project))) return json({ error: "not_found" }, 404);
  const q = request.nextUrl.searchParams;
  const env = q.get("env") ?? "production";
  const level = q.get("level") ?? undefined;
  if (!LOG_ENV.test(env)) return json({ error: "bad_request" }, 400);
  if (level !== undefined && !LOG_LEVELS.some((l) => l === level))
    return json({ error: "bad_request" }, 400);
  const res = await logsTail(
    project,
    env,
    LOG_LEVELS.find((l) => l === level),
    FOLLOW_LINES,
  );
  if (isUnavailable(res)) return json({ unavailable: "agent" }, 503);
  return json({ entries: res.entries });
}
