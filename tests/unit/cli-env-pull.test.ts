import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { dotenvLine } from "../../cli/env-commands";
import { AdminError } from "../../lib/db/admin";
import type { EnvStore, StoredVar } from "../../lib/db/env-store";
import { fakeDeps } from "./agent-fakes";

/** The values Next.js must read back exactly from what `env pull` writes. */
const AWKWARD = [
  "plain",
  "$HOME",
  "${HOME}x",
  "pa$$word",
  "$1abc",
  "\\$x",
  "a#b c",
  " lead and trail ",
  "a=b",
  "back\\slash",
  "ends\\",
  "\\n literal",
  "`tick`",
  'dq "x"',
  "it's",
  "ñ€😀",
  '{"json":1}',
];

/** What Next.js loads from a `.env.local` with this content. */
function nextReads(content: string): Record<string, string | undefined> {
  const dir = mkdtempSync(join(tmpdir(), "kd-pull-"));
  // `.env`: under bun test NODE_ENV is "test", and Next skips `.env.local` then. Same parser.
  writeFileSync(join(dir, ".env"), content);
  // forceReload: @next/env caches the first load of the process otherwise.
  const { combinedEnv } = loadEnvConfig(
    dir,
    true,
    { info() {}, error() {} },
    true,
  );
  return combinedEnv;
}

function cli(stdoutIsTTY = false) {
  const f = fakeDeps();
  f.files.set(MASTER_KEY, randomBytes(32).toString("base64"));
  const agent = new Agent(f.deps);
  const client: AgentClient = {
    async call(op, params) {
      return (await dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "t", op, params }),
      )) as Response;
    },
  };
  const rows: (StoredVar & { env: string })[] = [];
  const store: EnvStore = {
    async list(project, environment) {
      if (project !== "kd_hello") throw new AdminError(`no project ${project}`);
      return rows.filter((r) => r.env === environment);
    },
    async set(_p, environment, v, actor) {
      rows.push({
        ...v,
        env: environment,
        updatedAt: new Date(),
        updatedBy: actor,
      });
      return { created: true };
    },
    async remove() {
      return false;
    },
  };
  let stdin = "";
  const run = (argv: string[], input = "") => {
    stdin = input;
    return runCli(argv, client, {
      env: () => store,
      readValue: async () => stdin,
      actor: "ssh:cesar",
      stdoutIsTTY,
    });
  };
  return { run, logs: f.logs };
}

describe("dotenvLine", () => {
  test("every awkward value reads back exactly through Next's own parser", () => {
    const content = AWKWARD.map((v, i) => dotenvLine(`V${i}`, v)).join("");
    const env = nextReads(content);
    for (const [i, v] of AWKWARD.entries()) expect(env[`V${i}`]).toBe(v);
  });
});

describe("kit-deploy env pull", () => {
  test("Development, secrets included, as a .env.local Next.js reads", async () => {
    const c = cli();
    await c.run(
      ["env", "set", "kd_hello", "development", "BREVO_API_KEY"],
      "xkeysib-dev-$1#x",
    );
    await c.run(
      ["env", "set", "kd_hello", "development", "NEXT_PUBLIC_SITE_URL"],
      "http://localhost:3000",
    );
    await c.run(
      ["env", "set", "kd_hello", "production", "PROD_ONLY"],
      "never-here",
    );
    const r = await c.run(["env", "pull", "kd_hello"]);
    expect(r.code).toBe(0);
    expect(r.out).toStartWith("# kit-deploy env pull kd_hello (development)");
    const env = nextReads(r.out);
    expect(env.BREVO_API_KEY).toBe("xkeysib-dev-$1#x");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(r.out).not.toContain("PROD_ONLY");
    // The terminal sees the names, never a value.
    expect(r.err).toContain("BREVO_API_KEY, NEXT_PUBLIC_SITE_URL");
    expect(r.err).not.toContain("xkeysib");
    expect(JSON.stringify(c.logs)).not.toContain("xkeysib");
  });

  test("never to a terminal", async () => {
    const c = cli(true);
    await c.run(["env", "set", "kd_hello", "development", "A"], "secret-value");
    const r = await c.run(["env", "pull", "kd_hello"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toContain("> .env.local");
    expect(r.err).not.toContain("secret-value");
  });

  test("an empty set writes only the header", async () => {
    const c = cli();
    const r = await c.run(["env", "pull", "kd_hello"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      "# kit-deploy env pull kd_hello (development). Do not commit this file.\n",
    );
    expect(r.err).toContain("empty .env.local");
  });

  test("usage and unknown project", async () => {
    const c = cli();
    expect((await c.run(["env", "pull"])).code).toBe(2);
    expect((await c.run(["env", "pull", "kd_hello", "development"])).code).toBe(
      2,
    );
    expect((await c.run(["env", "pull", "../x"])).code).toBe(2);
    const nope = await c.run(["env", "pull", "nope"]);
    expect(nope.code).toBe(1);
    expect(nope.err).toBe("no project nope\n");
  });
});
