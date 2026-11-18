/**
 * Thin wrapper of `logsSearch` for the Logs page's "Cargar más" (the older page of a search,
 * by the `before` cursor). Same session and validation rules as `../tail/route.ts`.
 */
import { type NextRequest, NextResponse } from "next/server";
import { cleanQuery, LOG_DAY, LOG_ENV, LOG_LEVELS } from "@/lib/kit/logs-page";
import { isUnavailable, logsSearch } from "@/lib/panel/data";
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
  const day = q.get("day") ?? "";
  const env = q.get("env") ?? "production";
  const levelRaw = q.get("level") ?? undefined;
  const queryRaw = q.get("q") ?? undefined;
  const beforeRaw = q.get("before");
  const before = beforeRaw === null ? undefined : Number(beforeRaw);
  if (
    !LOG_DAY.test(day) ||
    !LOG_ENV.test(env) ||
    (levelRaw !== undefined && !LOG_LEVELS.some((l) => l === levelRaw)) ||
    (queryRaw !== undefined && cleanQuery(queryRaw) === undefined) ||
    (before !== undefined && !Number.isSafeInteger(before)) ||
    (before !== undefined && before < 0)
  )
    return json({ error: "bad_request" }, 400);
  const res = await logsSearch(
    project,
    day,
    cleanQuery(queryRaw),
    env,
    LOG_LEVELS.find((l) => l === levelRaw),
    before,
  );
  if (isUnavailable(res)) return json({ unavailable: "agent" }, 503);
  return json({ entries: res.entries, next: res.next });
}
