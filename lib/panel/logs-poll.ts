/**
 * The live-logs box polls this (HANDOFF §3 "Logs en vivo", every 2 s): a thin GET over `logsTail`
 * (lib/panel/data), which asks kit-agent's `logs.tail`. A request without a session gets a 401,
 * never a redirect; kit-agent down is a 503 the box shows as "reconectando". Lines carry their UTC
 * hour as text so server and browser agree.
 */
import { z } from "zod";
import type { LogEntry } from "@/agent/logs";
import { logTime } from "@/lib/kit/panel-format";
import { projectField } from "@/lib/panel/schemas";

export const MAX_POLL_LINES = 200;
export const DEFAULT_POLL_LINES = 20;

const query = z.object({
  project: projectField,
  env: z
    .string()
    .regex(/^(production|pr-[1-9][0-9]{0,5})$/)
    .optional(),
  level: z.enum(["error", "warn", "info"]).optional(),
  lines: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_POLL_LINES)
    .default(DEFAULT_POLL_LINES),
});

export type PollLine = { time: string; level: LogEntry["level"]; text: string };

export type LogsPollDeps = {
  /** Whether the request carries a dashboard session (never redirects). */
  signedIn(): Promise<boolean>;
  tail(
    project: string,
    env: string | undefined,
    level: "error" | "warn" | "info" | undefined,
    lines: number,
  ): Promise<{ entries: LogEntry[] } | { unavailable: "agent" }>;
};

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function handleLogsPoll(
  request: Request,
  deps: LogsPollDeps,
): Promise<Response> {
  if (!(await deps.signedIn())) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const parsed = query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { project, env, level, lines } = parsed.data;
  const r = await deps.tail(project, env ?? "production", level, lines);
  if ("unavailable" in r) return json({ error: "agent" }, 503);
  const out: PollLine[] = r.entries.map((e) => ({
    time: logTime(e.ts),
    level: e.level,
    text: e.line,
  }));
  return json({ lines: out }, 200);
}
