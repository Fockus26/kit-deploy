import { describe, expect, test } from "bun:test";
import type { LogEntry } from "../../agent/logs";
import { handleLogsPoll, type LogsPollDeps } from "../../lib/panel/logs-poll";

const entry = (line: string, level: LogEntry["level"] = "info"): LogEntry => ({
  ts: "2026-11-17T14:02:11.123456789Z",
  container: "maranatha-prod-a1b2c3d",
  env: "production",
  stream: "stdout",
  line,
  level,
});

function deps(over: Partial<LogsPollDeps> = {}): LogsPollDeps & {
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  return {
    calls,
    signedIn: async () => true,
    tail: async (...args) => {
      calls.push(args);
      return { entries: [entry("GET / 200"), entry("boom", "error")] };
    },
    ...over,
  };
}

const get = (qs: string) =>
  new Request(`https://deploy.fockus.dev/api/panel/logs?${qs}`);

describe("logs poll", () => {
  test("no session → 401, kit-agent never asked", async () => {
    const d = deps({ signedIn: async () => false });
    const r = await handleLogsPoll(get("project=maranatha"), d);
    expect(r.status).toBe(401);
    expect(r.headers.get("location")).toBeNull();
    expect(d.calls).toHaveLength(0);
  });

  test("lines come as hour, level and text; production by default", async () => {
    const d = deps();
    const r = await handleLogsPoll(get("project=maranatha"), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({
      lines: [
        { time: "14:02:11", level: "info", text: "GET / 200" },
        { time: "14:02:11", level: "error", text: "boom" },
      ],
    });
    expect(d.calls[0]).toEqual(["maranatha", "production", undefined, 20]);
  });

  test("a bad project, env, level or size → 400", async () => {
    for (const qs of [
      "",
      "project=Nope",
      "project=maranatha&env=staging",
      "project=maranatha&level=debug",
      "project=maranatha&lines=0",
      "project=maranatha&lines=9999",
    ]) {
      expect((await handleLogsPoll(get(qs), deps())).status).toBe(400);
    }
  });

  test("kit-agent down → 503", async () => {
    const d = deps({ tail: async () => ({ unavailable: "agent" }) });
    expect((await handleLogsPoll(get("project=maranatha"), d)).status).toBe(
      503,
    );
  });
});
