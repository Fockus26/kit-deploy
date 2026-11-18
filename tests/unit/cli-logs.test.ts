import { describe, expect, test } from "bun:test";
import type { LogEntry } from "../../agent/logs";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { formatEntry, printable } from "../../cli/logs-commands";

const NOW = Date.parse("2026-11-17T12:00:00Z");

const entry = (s: number, line: string, over: Partial<LogEntry> = {}) =>
  ({
    ts: `2026-11-17T10:00:${String(s).padStart(2, "0")}.000000000Z`,
    container: "kd_hello-prod-3f2a9c1e7b4d",
    env: "production",
    stream: "stdout",
    line,
    level: "info",
    ...over,
  }) as LogEntry;

function client(answers: (op: string, params: unknown) => Response) {
  const sent: { op: string; params: unknown }[] = [];
  const c: AgentClient = {
    async call(op, params) {
      sent.push({ op, params });
      return answers(op, params);
    },
  };
  return { c, sent };
}

const okRes = (result: unknown): Response => ({ id: "t", ok: true, result });

describe("kit-deploy logs", () => {
  test("tail: defaults, --pr and --level reach the op; lines printed", async () => {
    const { c, sent } = client(() =>
      okRes({
        entries: [
          entry(1, "hello"),
          entry(2, "boom", { level: "error", stream: "stderr" }),
        ],
      }),
    );
    const r = await runCli(
      ["logs", "kd_hello", "--pr", "7", "--level", "error", "-n", "50"],
      c,
    );
    expect(r.code).toBe(0);
    expect(sent[0]).toEqual({
      op: "logs.tail",
      params: { project: "kd_hello", env: "pr-7", level: "error", lines: 50 },
    });
    expect(r.out).toBe(
      "2026-11-17T10:00:01.000Z production info hello\n2026-11-17T10:00:02.000Z production error stderr boom\n",
    );
  });

  test("search: --grep today by default, newest last on screen, cursor hint", async () => {
    const { c, sent } = client(() =>
      okRes({
        day: "2026-11-17",
        entries: [entry(5, "new"), entry(3, "old")],
        next: 3,
      }),
    );
    const r = await runCli(["logs", "kd_hello", "--grep", "GET /a"], c, {
      now: () => NOW,
    });
    expect(sent[0]).toEqual({
      op: "logs.search",
      params: { project: "kd_hello", day: "2026-11-17", query: "GET /a" },
    });
    expect(r.out.split("\n")[0]).toContain("old");
    expect(r.err).toContain("--before 3");
  });

  test("--json prints the agent's result", async () => {
    const result = { day: "2026-11-10", entries: [], next: null };
    const { c } = client(() => okRes(result));
    const r = await runCli(
      ["logs", "kd_hello", "--day", "2026-11-10", "--json"],
      c,
    );
    expect(JSON.parse(r.out)).toEqual(result);
  });

  test("bad arguments are usage errors before any call", async () => {
    const { c, sent } = client(() => okRes({ entries: [] }));
    for (const args of [
      ["logs"],
      ["logs", "kd_hello", "extra"],
      ["logs", "kd_hello", "--pr", "x"],
      ["logs", "kd_hello", "--level", "debug"],
      ["logs", "kd_hello", "-n", "501"],
      ["logs", "kd_hello", "--day", "yesterday"],
      ["logs", "kd_hello", "-f", "--grep", "x"],
      ["logs", "kd_hello", "--before", "3"],
      ["logs", "kd_hello", "--grep", "x".repeat(201)],
      ["logs", "kd_hello", "--regex", "a.*"],
    ]) {
      expect((await runCli(args, c)).code).toBe(2);
    }
    expect((await runCli(["logs", "../etc"], c)).code).toBe(2);
    expect(sent).toEqual([]);
  });

  test("the agent's refusal is shown", async () => {
    const { c } = client(() => ({
      id: "t",
      ok: false,
      error: {
        code: "bad_request",
        message: "day 2026-10-01 is outside the kept logs",
      },
    }));
    const r = await runCli(["logs", "kd_hello", "--day", "2026-10-01"], c);
    expect(r.code).toBe(1);
    expect(r.err).toContain("outside the kept logs");
  });

  test("-f polls logs.tail and prints only the new lines", async () => {
    const answers = [
      [entry(1, "a"), entry(2, "b")],
      [entry(1, "a"), entry(2, "b"), entry(2, "b2"), entry(3, "c")],
      [entry(3, "c")],
      [entry(3, "c"), entry(4, "d")],
    ];
    let i = 0;
    const { c, sent } = client(() => okRes({ entries: answers[i++] ?? [] }));
    const written: string[] = [];
    let sleeps = 0;
    const r = await runCli(["logs", "kd_hello", "-f"], c, {
      follow: {
        write: (t) => written.push(t),
        sleep: async (ms) => {
          expect(ms).toBe(2000);
          return ++sleeps < answers.length;
        },
      },
    });
    expect(r.code).toBe(0);
    expect(sent).toHaveLength(answers.length);
    const lines = written
      .join("")
      .trim()
      .split("\n")
      .map((l) => l.split(" ").at(-1));
    expect(lines).toEqual(["a", "b", "b2", "c", "d"]);
  });

  test("control characters never reach the terminal", () => {
    expect(printable("\u001b[31mred\u001b[0m\r\tx")).toBe("^[[31mred^[[0m?\tx");
    expect(formatEntry(entry(1, "\u001b]0;pwned\u0007"))).not.toContain(
      "\u001b",
    );
  });
});
