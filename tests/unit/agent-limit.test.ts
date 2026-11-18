/** L3 (phase 05 security review): log reads in the root daemon, two at a time, a bounded queue. */
import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { Busy, Limiter } from "../../agent/limit";
import type { LogDeps } from "../../agent/logs";
import { Agent, LOG_READS } from "../../agent/ops";
import { fakeDeps } from "./agent-fakes";

function deferred() {
  let open: () => void = () => {};
  const p = new Promise<void>((r) => {
    open = r;
  });
  return { p, open };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("Limiter", () => {
  test("at most max at once; the next one runs when a slot frees", async () => {
    const l = new Limiter(2, 4, 1_000);
    const gate = deferred();
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await gate.p;
      running--;
      return "done";
    };
    const all = Promise.all([l.run(task), l.run(task), l.run(task)]);
    await tick();
    expect(running).toBe(2);
    gate.open();
    expect(await all).toEqual(["done", "done", "done"]);
    expect(peak).toBe(2);
  });

  test("past the queue: refused at once", async () => {
    const l = new Limiter(1, 1, 1_000);
    const gate = deferred();
    const first = l.run(() => gate.p);
    const second = l.run(() => Promise.resolve("second"));
    await expect(l.run(() => Promise.resolve("third"))).rejects.toBeInstanceOf(
      Busy,
    );
    gate.open();
    await first;
    expect(await second).toBe("second");
  });

  test("a wait past waitMs is refused and leaves the queue", async () => {
    const l = new Limiter(1, 2, 20);
    const gate = deferred();
    const first = l.run(() => gate.p);
    await expect(l.run(() => Promise.resolve(1))).rejects.toThrow("no turn");
    gate.open();
    await first;
    // Its slot was not leaked: one more runs straight away.
    expect(await l.run(() => Promise.resolve(2))).toBe(2);
  });

  test("a task that throws frees its slot", async () => {
    const l = new Limiter(1, 0, 10);
    await expect(
      l.run(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(await l.run(() => Promise.resolve("ok"))).toBe("ok");
  });
});

describe("logs.tail / logs.search through the agent", () => {
  test("the agent's default is 2 at once, 8 waiting", () => {
    expect(LOG_READS).toEqual({ max: 2, queue: 8, waitMs: 10_000 });
  });

  test("past its limit a read is command_failed 'busy'; the rest answer", async () => {
    const gate = deferred();
    const logs: LogDeps = {
      follow: async () => {},
      append: async () => {},
      size: async () => 0,
      async *lines() {},
      readTail: async () => null,
      list: async () => {
        await gate.p;
        return [];
      },
      gzip: async () => {},
      remove: async () => {},
    } as unknown as LogDeps;
    const d = fakeDeps();
    const agent = new Agent(
      d.deps,
      () => Date.parse("2026-11-17T12:00:00Z"),
      logs,
      new Limiter(2, 1, 5_000),
    );
    const send = (id: string) =>
      dispatch(
        agent,
        d.deps,
        JSON.stringify({
          id,
          op: "logs.tail",
          params: { project: "kd_hello" },
        }),
      );
    const pending = [send("1"), send("2"), send("3")];
    await tick();
    const fourth = await send("4");
    expect(fourth).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    expect(!fourth.ok && fourth.error.message).toContain("busy");
    gate.open();
    for (const r of await Promise.all(pending)) expect(r.ok).toBe(true);
  });
});
