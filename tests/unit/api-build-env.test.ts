import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import type { Response as AgentResponse } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { handleBuildEnv } from "../../lib/api/build-env";
import {
  deriveEnvKey,
  deriveServerActionsKey,
  seal,
} from "../../lib/core/crypto";
import type { DeployStore } from "../../lib/db/store";
import type { SealedVar } from "../../lib/deploy/repo";
import { generateDeployToken, hashToken } from "../../lib/tokens";
import { fakeDeps } from "./agent-fakes";

const MASTER = randomBytes(32).toString("base64");
const KEY = deriveEnvKey(MASTER);
const { token: TOKEN, hash: HASH } = generateDeployToken();

const row = (
  environment: "production" | "preview",
  name: string,
  secret: boolean,
  value: string,
): SealedVar => ({
  name,
  secret,
  sealed: seal(KEY, { project: "kd_hello", environment, name, secret }, value),
});

const ROWS: Record<"production" | "preview", SealedVar[]> = {
  production: [
    row(
      "production",
      "NEXT_PUBLIC_SITE_URL",
      false,
      "https://kd-hello.fockus.dev",
    ),
    row("production", "NEXT_PUBLIC_PRICE", false, "$5 #promo"),
    row("production", "BREVO_API_KEY", true, "xkeysib-never-in-a-build"),
    row("production", "LOG_LEVEL", false, "info"),
  ],
  preview: [
    row("preview", "NEXT_PUBLIC_SITE_URL", false, "https://preview.example"),
  ],
};

function setup() {
  const f = fakeDeps();
  f.files.set(MASTER_KEY, MASTER);
  const agent = new Agent(f.deps);
  const sent: { op: string; params: unknown }[] = [];
  const client: AgentClient = {
    async call(op, params) {
      sent.push({ op, params });
      return (await dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "t", op, params }),
      )) as AgentResponse;
    },
  };
  const store = {
    async findTokenProject(hash: string) {
      return hash === HASH
        ? {
            tokenId: "t1",
            project: { id: "p1", name: "kd_hello", repo: "Fockus26/kd-hello" },
          }
        : null;
    },
    async touchToken() {},
  } as unknown as DeployStore;
  const call = (body: unknown, token = TOKEN) =>
    handleBuildEnv(
      new Request("https://deploy.fockus.dev/api/v1/build-env", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      store,
      { agent: client, vars: async (_id, env) => ROWS[env] },
    );
  return { call, sent, logs: f.logs };
}

function nextReads(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "kd-build-"));
  writeFileSync(join(dir, ".env"), content);
  return loadEnvConfig(dir, false, { info() {}, error() {} }, true).combinedEnv;
}

describe("POST /api/v1/build-env", () => {
  test("production: its public variables and its Server Actions key, as a .env", async () => {
    const s = setup();
    const res = await s.call({ environment: "production" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { names: string[]; dotenv: string };
    expect(body.names.sort()).toEqual([
      "NEXT_PUBLIC_PRICE",
      "NEXT_PUBLIC_SITE_URL",
    ]);
    const env = nextReads(body.dotenv);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://kd-hello.fockus.dev");
    expect(env.NEXT_PUBLIC_PRICE).toBe("$5 #promo");
    expect(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY).toBe(
      deriveServerActionsKey(MASTER, "kd_hello", "production"),
    );
    expect(
      Buffer.from(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ?? "", "base64"),
    ).toHaveLength(32);
    // Neither a secret nor a server variable.
    expect(body.dotenv).not.toContain("BREVO");
    expect(body.dotenv).not.toContain("LOG_LEVEL");
  });

  test("the secret's blob never even reaches the agent", async () => {
    const s = setup();
    await s.call({ environment: "production" });
    const names = (s.sent[0]?.params as { vars: { name: string }[] }).vars.map(
      (v) => v.name,
    );
    expect(names.sort()).toEqual(["NEXT_PUBLIC_PRICE", "NEXT_PUBLIC_SITE_URL"]);
  });

  test("a preview gets Preview's values and another key", async () => {
    const s = setup();
    const body = (await (await s.call({ environment: "preview" })).json()) as {
      dotenv: string;
    };
    const env = nextReads(body.dotenv);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://preview.example");
    expect(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY).toBe(
      deriveServerActionsKey(MASTER, "kd_hello", "preview"),
    );
    expect(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY).not.toBe(
      deriveServerActionsKey(MASTER, "kd_hello", "production"),
    );
  });

  test("the key is stable per project and environment, and differs by project", () => {
    expect(deriveServerActionsKey(MASTER, "kd_hello", "production")).toBe(
      deriveServerActionsKey(MASTER, "kd_hello", "production"),
    );
    expect(deriveServerActionsKey(MASTER, "kd_hello", "production")).not.toBe(
      deriveServerActionsKey(MASTER, "maranatha", "production"),
    );
  });

  test("a bad token, a bad body, development", async () => {
    const s = setup();
    expect(
      (await s.call({ environment: "production" }, "kd_wrong")).status,
    ).toBe(401);
    const other = generateDeployToken();
    expect(hashToken(other.token)).not.toBe(HASH);
    expect(
      (await s.call({ environment: "production" }, other.token)).status,
    ).toBe(401);
    expect((await s.call({ environment: "development" })).status).toBe(400);
    expect((await s.call({ environment: "production", extra: 1 })).status).toBe(
      400,
    );
    expect(s.sent).toEqual([]);
  });
});

describe("env.build in the agent", () => {
  test("refuses a secret or a server variable even if a caller sends one", async () => {
    const f = fakeDeps();
    f.files.set(MASTER_KEY, MASTER);
    const agent = new Agent(f.deps);
    for (const v of [ROWS.production[2], ROWS.production[3]]) {
      const res = await dispatch(
        agent,
        f.deps,
        JSON.stringify({
          id: "1",
          op: "env.build",
          params: { project: "kd_hello", environment: "production", vars: [v] },
        }),
      );
      expect(res).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(JSON.stringify(res)).not.toContain("xkeysib");
    }
  });
});
