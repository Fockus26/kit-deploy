import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { trimValue } from "../../cli/env-commands";
import { AdminError } from "../../lib/db/admin";
import {
  type EnvStore,
  type StoredVar,
  sshActor,
} from "../../lib/db/env-store";
import { fakeDeps } from "./agent-fakes";

const SECRET = "xkeysib-never-on-screen-0123456789";

/** The real agent behind the client: what the CLI sends is what kit-agent would get. */
function realAgent() {
  const f = fakeDeps();
  f.files.set(MASTER_KEY, randomBytes(32).toString("base64"));
  const agent = new Agent(f.deps);
  const sent: unknown[] = [];
  const client: AgentClient = {
    async call(op, params) {
      sent.push({ op, params });
      return (await dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "t", op, params }),
      )) as Response;
    },
  };
  return { client, sent, logs: f.logs };
}

function memoryEnv(projects = ["kd_hello"]) {
  const rows = new Map<string, StoredVar & { project: string; env: string }>();
  const audit: {
    actor: string;
    action: string;
    project: string;
    environment: string;
    name: string;
  }[] = [];
  const key = (p: string, e: string, n: string) => `${p}/${e}/${n}`;
  const known = (p: string) => {
    if (!projects.includes(p)) throw new AdminError(`no project ${p}`);
  };
  const store: EnvStore = {
    async list(project, environment) {
      known(project);
      return [...rows.values()]
        .filter((r) => r.project === project && r.env === environment)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async set(project, environment, v, actor) {
      known(project);
      const k = key(project, environment, v.name);
      const created = !rows.has(k);
      rows.set(k, {
        ...v,
        project,
        env: environment,
        updatedAt: new Date("2026-11-17T20:00:00Z"),
        updatedBy: actor,
      });
      audit.push({
        actor,
        action: "env.set",
        project,
        environment,
        name: v.name,
      });
      return { created };
    },
    async remove(project, environment, name, actor) {
      known(project);
      const gone = rows.delete(key(project, environment, name));
      if (gone)
        audit.push({ actor, action: "env.remove", project, environment, name });
      return gone;
    },
  };
  return { store, rows, audit };
}

function cli() {
  const a = realAgent();
  const m = memoryEnv();
  let stdin = "";
  const run = (argv: string[], input = "") => {
    stdin = input;
    return runCli(argv, a.client, {
      env: () => m.store,
      readValue: async () => stdin,
      actor: "ssh:cesar",
    });
  };
  return { ...a, ...m, run };
}

describe("kit-deploy env set", () => {
  test("a secret: sealed by the agent, stored, audited, never printed", async () => {
    const c = cli();
    const r = await c.run(
      ["env", "set", "kd_hello", "production", "BREVO_API_KEY"],
      `${SECRET}\n`,
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("set BREVO_API_KEY in kd_hello production (secret");
    expect(r.out).toContain("the next deploy of production gets it");
    const row = c.rows.get("kd_hello/production/BREVO_API_KEY");
    expect(row?.secret).toBe(true);
    expect(JSON.stringify(row)).not.toContain("xkeysib");
    expect(c.audit).toEqual([
      {
        actor: "ssh:cesar",
        action: "env.set",
        project: "kd_hello",
        environment: "production",
        name: "BREVO_API_KEY",
      },
    ]);
    expect(JSON.stringify([r, c.logs])).not.toContain("xkeysib");
  });

  test("replacing says so", async () => {
    const c = cli();
    await c.run(["env", "set", "kd_hello", "preview", "A"], "1");
    const r = await c.run(["env", "set", "kd_hello", "preview", "A"], "2");
    expect(r.out).toStartWith("replaced A");
  });

  test("--plain, and NEXT_PUBLIC_* is plain by itself", async () => {
    const c = cli();
    await c.run(
      ["env", "set", "kd_hello", "production", "LOG_LEVEL", "--plain"],
      "info",
    );
    const pub = await c.run(
      ["env", "set", "kd_hello", "production", "NEXT_PUBLIC_SITE_URL"],
      "https://kd-hello.fockus.dev\n",
    );
    expect(c.rows.get("kd_hello/production/LOG_LEVEL")?.secret).toBe(false);
    expect(c.rows.get("kd_hello/production/NEXT_PUBLIC_SITE_URL")?.secret).toBe(
      false,
    );
    expect(pub.out).toContain(
      "needs a new build (now: kit-deploy rebuild kd_hello)",
    );
  });

  test("development points at env pull", async () => {
    const c = cli();
    const r = await c.run(["env", "set", "kd_hello", "development", "A"], "v");
    expect(r.out).toContain("kit-deploy env pull kd_hello > .env.local");
  });

  test.each([
    [
      "a managed name",
      ["kd_hello", "production", "DATABASE_URL"],
      "x",
      /set by kit-deploy itself/,
    ],
    [
      "a reserved name",
      ["kd_hello", "production", "PORT"],
      "1",
      /set by kit-deploy itself/,
    ],
    [
      "a bad name",
      ["kd_hello", "production", "lower"],
      "x",
      /invalid variable name/,
    ],
    [
      "a bad environment",
      ["kd_hello", "staging", "A"],
      "x",
      /invalid environment/,
    ],
    ["a bad project", ["../x", "production", "A"], "x", /invalid project/],
    ["an empty value", ["kd_hello", "production", "A"], "\n", /empty value/],
    [
      "a multi-line value",
      ["kd_hello", "production", "A"],
      `${SECRET}\nsecond\n`,
      /newline/,
    ],
  ])("refuses %s, without echoing the value", async (_, args, input, msg) => {
    const c = cli();
    const r = await c.run(["env", "set", ...args], input);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(msg);
    expect(r.err).not.toContain("xkeysib");
    expect(c.rows.size).toBe(0);
    expect(c.audit).toEqual([]);
  });

  test("an unknown project: nothing sealed into a row, nothing audited", async () => {
    const c = cli();
    const r = await c.run(["env", "set", "nope", "production", "A"], "v");
    expect(r.code).toBe(1);
    expect(r.err).toBe("no project nope\n");
    expect(c.audit).toEqual([]);
  });

  test("the value never travels in argv", async () => {
    const c = cli();
    const r = await c.run([
      "env",
      "set",
      "kd_hello",
      "production",
      "A",
      SECRET,
    ]);
    expect(r.code).toBe(2);
    expect(c.sent).toEqual([]);
  });

  test("usage errors", async () => {
    const c = cli();
    for (const argv of [
      ["env"],
      ["env", "set", "kd_hello", "production"],
      ["env", "set", "kd_hello", "production", "A", "--secret"],
      ["env", "cat", "kd_hello", "production"],
    ]) {
      expect((await c.run(argv)).code).toBe(2);
    }
  });
});

describe("kit-deploy env ls", () => {
  async function seeded() {
    const c = cli();
    await c.run(
      ["env", "set", "kd_hello", "production", "BREVO_API_KEY"],
      SECRET,
    );
    await c.run(
      ["env", "set", "kd_hello", "production", "NEXT_PUBLIC_SITE_URL"],
      "https://kd-hello.fockus.dev",
    );
    await c.run(
      ["env", "set", "kd_hello", "production", "LONG", "--plain"],
      "x".repeat(100),
    );
    await c.run(["env", "set", "kd_hello", "preview", "OTHER"], "y");
    return c;
  }

  test("plain values shown, secrets never, only that environment", async () => {
    const c = await seeded();
    const r = await c.run(["env", "ls", "kd_hello", "production"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("NEXT_PUBLIC_SITE_URL");
    expect(r.out).toContain("https://kd-hello.fockus.dev");
    expect(r.out).toMatch(/BREVO_API_KEY\s+secret.*\(hidden\)/);
    expect(r.out).toContain(`${"x".repeat(60)}…`);
    expect(r.out).not.toContain("OTHER");
    expect(r.out).not.toContain("xkeysib");
  });

  test("--json: values whole, null for secrets", async () => {
    const c = await seeded();
    const r = await c.run(["env", "ls", "kd_hello", "production", "--json"]);
    const rows = JSON.parse(r.out) as {
      name: string;
      value: string | null;
      secret: boolean;
    }[];
    expect(rows.map((x) => [x.name, x.secret, x.value])).toEqual([
      ["BREVO_API_KEY", true, null],
      ["LONG", false, "x".repeat(100)],
      ["NEXT_PUBLIC_SITE_URL", false, "https://kd-hello.fockus.dev"],
    ]);
  });

  test("the secret's blob is never sent to env.reveal", async () => {
    const c = await seeded();
    c.sent.length = 0;
    await c.run(["env", "ls", "kd_hello", "production"]);
    const names = (
      c.sent as { op: string; params: { vars: { name: string }[] } }[]
    )
      .filter((s) => s.op === "env.reveal")
      .flatMap((s) => s.params.vars.map((v) => v.name));
    expect(names.sort()).toEqual(["LONG", "NEXT_PUBLIC_SITE_URL"]);
  });

  test("empty", async () => {
    const c = cli();
    const r = await c.run(["env", "ls", "kd_hello", "development"]);
    expect(r.out).toBe("no variables in kd_hello development\n");
  });
});

describe("kit-deploy env rm", () => {
  test("removes and audits; a missing one is an error with no audit row", async () => {
    const c = cli();
    await c.run(["env", "set", "kd_hello", "production", "A"], "v");
    const r = await c.run(["env", "rm", "kd_hello", "production", "A"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("removed A from kd_hello production");
    expect(c.audit.at(-1)?.action).toBe("env.remove");
    const again = await c.run(["env", "rm", "kd_hello", "production", "A"]);
    expect(again.code).toBe(1);
    expect(c.audit.length).toBe(2);
  });
});

describe("helpers", () => {
  test("trimValue drops one trailing newline only", () => {
    expect(trimValue("v\n")).toBe("v");
    expect(trimValue("v\r\n")).toBe("v");
    expect(trimValue("v\n\n")).toBe("v\n");
    expect(trimValue("v")).toBe("v");
  });

  test("sshActor", () => {
    expect(sshActor({ USER: "cesar" })).toBe("ssh:cesar");
    expect(sshActor({ SUDO_USER: "cesar", USER: "root" })).toBe("ssh:cesar");
    expect(sshActor({ USER: "a b" })).toBe("ssh:unknown");
    expect(sshActor({})).toBe("ssh:unknown");
  });
});
