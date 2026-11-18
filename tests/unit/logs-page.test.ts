import { describe, expect, test } from "bun:test";
import {
  backupState,
  cleanQuery,
  failuresOf,
  type LogRow,
  logFileName,
  logFileText,
  logTime,
  parseLogFilter,
} from "../../lib/kit/logs-page";

const SOURCES = [{ env: "production" }, { env: "pr-7" }];
const DAYS = ["2026-11-17", "2026-11-16", "2026-11-15"];

describe("parseLogFilter", () => {
  test("defaults to production, today, following live", () => {
    const f = parseLogFilter({}, SOURCES, DAYS);
    expect(f).toEqual({
      env: "production",
      day: "2026-11-17",
      level: undefined,
      query: undefined,
      mode: "live",
    });
  });

  test("another day or a search text is a search", () => {
    expect(parseLogFilter({ day: "2026-11-16" }, SOURCES, DAYS).mode).toBe(
      "search",
    );
    expect(parseLogFilter({ q: "timeout" }, SOURCES, DAYS).mode).toBe("search");
  });

  test("values that are not the page's options fall back", () => {
    const f = parseLogFilter(
      { env: "pr-9", day: "2020-01-01", level: "debug" },
      SOURCES,
      DAYS,
    );
    expect(f.env).toBe("production");
    expect(f.day).toBe("2026-11-17");
    expect(f.level).toBeUndefined();
    expect(
      parseLogFilter({ env: "pr-7", level: "warn" }, SOURCES, DAYS),
    ).toMatchObject({
      env: "pr-7",
      level: "warn",
    });
  });

  test("a repeated parameter takes the first", () => {
    expect(
      parseLogFilter({ level: ["error", "info"] }, SOURCES, DAYS).level,
    ).toBe("error");
  });
});

describe("cleanQuery", () => {
  test("trims; blank, too long or with control characters is no search", () => {
    expect(cleanQuery("  boom  ")).toBe("boom");
    expect(cleanQuery("   ")).toBeUndefined();
    expect(cleanQuery("a".repeat(201))).toBeUndefined();
    expect(cleanQuery("a\u0007b")).toBeUndefined();
    expect(cleanQuery(undefined)).toBeUndefined();
  });
});

describe("log file", () => {
  const rows: LogRow[] = [
    { ts: "2026-11-17T14:02:11.123456789Z", level: "info", line: "listening" },
    { ts: "2026-11-17T14:02:12.000000000Z", level: "error", line: "boom" },
  ];
  test("time column is the UTC clock", () => {
    expect(logTime(rows[0]?.ts ?? "")).toBe("14:02:11");
  });
  test("one line per entry, newline-terminated", () => {
    expect(logFileText(rows)).toBe(
      "2026-11-17T14:02:11.123456789Z INFO  listening\n2026-11-17T14:02:12.000000000Z ERROR boom\n",
    );
    expect(logFileText([])).toBe("");
  });
  test("name from validated values", () => {
    expect(logFileName("kd_hello", { env: "pr-7", day: "2026-11-17" })).toBe(
      "kd_hello-pr-7-2026-11-17.log",
    );
  });
});

describe("backupState", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  test("fresh and no failure is ready", () => {
    expect(backupState({ at: "2026-11-17T03:00:00Z" }, [], now).status).toBe(
      "ready",
    );
  });
  test("35 h is fresh, 36 h is a warning", () => {
    expect(backupState({ at: "2026-11-16T01:00:00Z" }, [], now).status).toBe(
      "ready",
    );
    expect(backupState({ at: "2026-11-16T00:00:00Z" }, [], now).status).toBe(
      "warning",
    );
  });
  test("a failure wins over a fresh backup and carries its text", () => {
    const s = backupState(
      { at: "2026-11-17T03:00:00Z" },
      ["FAIL 2026-11-17 kd_hello: disk full"],
      now,
    );
    expect(s).toEqual({
      status: "warning",
      reason: "FAIL 2026-11-17 kd_hello: disk full",
    });
  });
  test("no backup or an unreadable date is a warning", () => {
    expect(backupState(null, [], now).status).toBe("warning");
    expect(backupState({ at: null }, [], now).status).toBe("warning");
  });
  test("failuresOf matches the database by its field, not a substring", () => {
    const f = [
      "FAIL 2026-11-17 kd_hello: disk full",
      "FAIL 2026-11-17 kd_hello_preview: oops",
    ];
    expect(failuresOf("kd_hello", f)).toEqual([f[0] as string]);
    expect(failuresOf("kd_hello_preview", f)).toEqual([f[1] as string]);
  });
});
