import { describe, expect, test } from "bun:test";
import {
  backupTime,
  parseList,
  parseSize,
  parseStatus,
} from "../../agent/databases";
import type { RunResult } from "../../agent/deps";
import { dispatch } from "../../agent/dispatch";
import { Agent } from "../../agent/ops";
import { Request, type Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { age } from "../../cli/db-commands";
import { fakeDeps } from "./agent-fakes";

const LIST = [
  "kd_hello 7629 kB",
  "kd_hello_preview   12 MB  ",
  "kd_hello2 1 GB",
  "kit_deploy 9 MB",
  "melao 512 bytes",
  "",
].join("\n");

const STATUS = [
  "kd_hello: kd_hello-20261117-033001.dump",
  "kd_hello_preview: NO BACKUP",
  "kd_hello2: kd_hello2-20261117-033005.dump",
  "kit_deploy: kit_deploy-20261117-033010.dump",
  "melao: melao-20261116-033000.dump",
  "Off-VPS: r2:kit-backups",
  "Last failures:",
  "FAIL 2026-11-16T03:30:02+00:00 melao: pg_dump",
  "FAIL 2026-11-16T03:30:04+00:00 kd_hello2: pg_dump",
  "FAIL 2026-11-17T03:30:07+00:00 kd_hello_preview: upload to r2:kit-backups (the dump is on this disk)",
  "FAIL  2026-11-17T03:30:08+00:00   kd_hello:   pg_dump near postgresql://kd_hello:s3cr3t@h/kd_hello",
  "",
].join("\r\n");

type Handler = (argv: readonly string[]) => Partial<RunResult>;

function setup(handlers: Record<string, Handler> = {}) {
  const f = fakeDeps({
    "kit-db list": () => ({ stdout: LIST }),
    "kit-db status": () => ({ stdout: STATUS }),
    ...handlers,
  });
  const agent = new Agent(f.deps);
  const send = (params: Record<string, unknown>) =>
    dispatch(
      agent,
      f.deps,
      JSON.stringify({ id: "1", op: "db.status", params }),
    ) as Promise<Response>;
  const client: AgentClient = {
    call: (op, params) =>
      dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "1", op, params }),
      ) as Promise<Response>,
  };
  return { ...f, send, client };
}

const result = (r: Response) => {
  if (!r.ok) throw new Error(r.error.message);
  return r.result as {
    databases: {
      name: string;
      env: string;
      sizeBytes: number | null;
      sizeText: string;
      lastBackup: { file: string; at: string | null } | null;
    }[];
    offVps: string | null;
    failures: string[];
  };
};

describe("db.status", () => {
  test("only the project's two databases, with size and last backup", async () => {
    const s = setup();
    const r = result(await s.send({ project: "kd_hello" }));
    expect(r.databases).toEqual([
      {
        name: "kd_hello",
        env: "production",
        sizeBytes: 7629 * 1024,
        sizeText: "7629 kB",
        lastBackup: {
          file: "kd_hello-20261117-033001.dump",
          at: "2026-11-17T03:30:01.000Z",
        },
      },
      {
        name: "kd_hello_preview",
        env: "preview",
        sizeBytes: 12 * 1024 ** 2,
        sizeText: "12 MB",
        lastBackup: null,
      },
    ]);
    expect(r.offVps).toBe("r2:kit-backups");
    expect(s.calls).toEqual([
      ["kit-db", "list"],
      ["kit-db", "status"],
    ]);
    expect(s.runOpts.every((o) => (o?.timeoutMs ?? 0) > 0)).toBe(true);
  });

  test("failures: only lines naming one of its databases, scrubbed", async () => {
    const r = result(await setup().send({ project: "kd_hello" }));
    expect(r.failures).toEqual([
      "FAIL 2026-11-17T03:30:07+00:00 kd_hello_preview: upload to r2:kit-backups (the dump is on this disk)",
      "FAIL  2026-11-17T03:30:08+00:00   kd_hello:   pg_dump near postgresql://…",
    ]);
    const text = JSON.stringify(r);
    for (const other of ["melao", "kd_hello2", "kit_deploy", "1 GB", "s3cr3t"])
      expect(text).not.toContain(other);
  });

  test("a project without databases: none, never another's", async () => {
    const r = result(await setup().send({ project: "shop" }));
    expect(r).toEqual({
      databases: [],
      offVps: "r2:kit-backups",
      failures: [],
    });
  });

  test("NOT CONFIGURED and no failures", async () => {
    const s = setup({
      "kit-db status": () => ({
        stdout:
          "kd_hello: NO BACKUP\nOff-VPS: NOT CONFIGURED\nLast failures:\n",
      }),
    });
    const r = result(await s.send({ project: "kd_hello" }));
    expect(r.offVps).toBeNull();
    expect(r.failures).toEqual([]);
    expect(r.databases[0]?.lastBackup).toBeNull();
  });

  test("an on-the-fly remote is only 'configured', in offVps and in failures", async () => {
    const remote = ":s3,access_key_id=AKIA123,secret_access_key=zzz:bucket";
    const s = setup({
      "kit-db status": () => ({
        stdout: `kd_hello: NO BACKUP\nOff-VPS: ${remote}\nLast failures:\nFAIL 2026-11-17T03:30:07+00:00 kd_hello: upload to ${remote} (the dump is on this disk)\n`,
      }),
    });
    const r = result(await s.send({ project: "kd_hello" }));
    expect(r.offVps).toBe("(configured)");
    expect(JSON.stringify(r)).not.toContain("AKIA123");
    expect(r.failures[0]).toContain("upload to (configured)");
  });

  test("a failure naming an earlier remote with credentials is redacted too", async () => {
    const old = ":s3,secret_access_key=OLDKEY:bucket";
    const s = setup({
      "kit-db status": () => ({
        stdout: `kd_hello: NO BACKUP\nOff-VPS: r2:kit-backups\nLast failures:\nFAIL 2026-11-10T03:30:07+00:00 kd_hello: upload to ${old} (the dump is on this disk)\n`,
      }),
    });
    const r = result(await s.send({ project: "kd_hello" }));
    expect(JSON.stringify(r)).not.toContain("OLDKEY");
    expect(r.failures[0]).toContain("upload to (configured) (the dump");
  });

  test("a database in status but not in list is not shown", async () => {
    const s = setup({ "kit-db list": () => ({ stdout: "kd_hello 8 kB\n" }) });
    const r = result(await s.send({ project: "kd_hello" }));
    expect(r.databases.map((d) => d.name)).toEqual(["kd_hello"]);
  });

  test("kit-db failing: command_failed, without any URL", async () => {
    const s = setup({
      "kit-db list": () => ({
        code: 1,
        stderr: "psql: could not connect postgresql://u:pw@h/d\n",
      }),
    });
    const res = await s.send({ project: "kd_hello" });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    expect(JSON.stringify(res)).not.toContain("pw@");
  });

  test("a previews name is refused; a bad project never reaches kit-db", async () => {
    const s = setup();
    expect(await s.send({ project: "shop_preview" })).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    expect(await s.send({ project: "x; drop" })).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    expect(await s.send({ project: "kd_hello", extra: 1 })).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    expect(s.calls).toEqual([]);
  });

  test("schema: db.status { project }", () => {
    expect(
      Request.safeParse({
        id: "1",
        op: "db.status",
        params: { project: "kd_hello" },
      }).success,
    ).toBe(true);
    expect(
      Request.safeParse({ id: "1", op: "db.status", params: {} }).success,
    ).toBe(false);
  });
});

describe("parsers", () => {
  test("parseSize: pg_size_pretty's units", () => {
    expect(parseSize("512 bytes")).toBe(512);
    expect(parseSize("7629 kB")).toBe(7629 * 1024);
    expect(parseSize("3 GB")).toBe(3 * 1024 ** 3);
    expect(parseSize("12MB")).toBeNull();
    expect(parseSize("big")).toBeNull();
  });

  test("parseList: odd spacing, blank lines, CRLF", () => {
    const m = parseList("  a_b   12   MB \r\n\r\nc 1 kB\nBad 1 kB\n");
    expect([...m]).toEqual([
      ["a_b", "12 MB"],
      ["c", "1 kB"],
    ]);
  });

  test("parseStatus: a database line after the failures header is not a database", () => {
    const p = parseStatus(
      "a: NO BACKUP\nOff-VPS: NOT CONFIGURED\nLast failures:\nb: x.dump\nFAIL 1 a: x\n",
    );
    expect([...p.backups]).toEqual([["a", null]]);
    expect(p.failures).toEqual(["FAIL 1 a: x"]);
    expect(p.remote).toBeNull();
  });

  test("backupTime: kit-db's name only, a real moment only", () => {
    expect(backupTime("kd", "kd-20261117-033001.dump")).toBe(
      "2026-11-17T03:30:01.000Z",
    );
    expect(backupTime("kd", "kd_preview-20261117-033001.dump")).toBeNull();
    expect(backupTime("kd", "kd-20261399-033001.dump")).toBeNull();
    expect(backupTime("kd", "kd-latest.dump")).toBeNull();
  });
});

describe("kit-deploy db status", () => {
  test("a table of its databases, the copy and its failures", async () => {
    const s = setup();
    const r = await runCli(["db", "status", "kd_hello"], s.client);
    expect(r.code).toBe(0);
    expect(r.out).toContain("DATABASE");
    expect(r.out).toMatch(
      /kd_hello\s+production\s+7629 kB\s+2026-11-17 03:30 UTC/,
    );
    expect(r.out).toMatch(/kd_hello_preview\s+preview\s+12 MB\s+none/);
    expect(r.out).toContain("off-VPS copy: r2:kit-backups");
    expect(r.out).toContain("last backup failures:");
    expect(r.out).not.toContain("melao");
  });

  test("--json is the agent's result", async () => {
    const s = setup();
    const r = await runCli(["db", "status", "kd_hello", "--json"], s.client);
    expect(JSON.parse(r.out).databases).toHaveLength(2);
  });

  test("without databases it says how to create them", async () => {
    const s = setup();
    const r = await runCli(["db", "status", "shop"], s.client);
    expect(r.out).toContain(
      "not created: shop, shop_preview (kit-deploy db create shop)",
    );
    expect(r.out).toContain("no recent backup failures");
  });

  test("usage and bad names", async () => {
    const s = setup();
    expect((await runCli(["db", "status"], s.client)).code).toBe(2);
    expect((await runCli(["db", "status", "a", "b"], s.client)).code).toBe(2);
    expect((await runCli(["db", "status", "Bad"], s.client)).code).toBe(2);
    expect((await runCli(["db", "nope"], s.client)).code).toBe(2);
    expect(s.calls).toEqual([]);
  });

  test("an agent error is reported", async () => {
    const s = setup({ "kit-db status": () => ({ code: 2, stderr: "boom" }) });
    const r = await runCli(["db", "status", "kd_hello"], s.client);
    expect(r.code).toBe(1);
    expect(r.err).toContain("command_failed");
  });

  test("age", () => {
    const at = "2026-11-17T03:30:00.000Z";
    const t = Date.parse(at);
    expect(age(at, t + 5 * 60_000)).toBe("5 min ago");
    expect(age(at, t + 5 * 3_600_000)).toBe("5 h ago");
    expect(age(at, t + 3 * 86_400_000)).toBe("3 d ago");
  });
});
