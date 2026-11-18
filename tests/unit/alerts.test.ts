import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dispatch } from "../../agent/dispatch";
import { DB_CERT_PATH } from "../../agent/domains";
import { Agent } from "../../agent/ops";
import { Request, type Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { parseEnvFile } from "../../cli/env";
import { BREVO_URL, brevoMailer, mailerFromEnv } from "../../lib/alerts/brevo";
import { type CheckRepo, runChecks } from "../../lib/alerts/checks";
import {
  EMAIL_TOKENS,
  escapeHtml,
  renderDigest,
  subjectOf,
} from "../../lib/alerts/email";
import { type Digest, evaluate, notify } from "../../lib/alerts/engine";
import type { Observation } from "../../lib/alerts/rules";
import { CADDY_CERTS_DIR } from "../../lib/core/constants";
import { fakeDeps } from "./agent-fakes";
import { DB_PEM, DEPLOY_PEM, WILDCARD_PEM } from "./alerts-certs";
import { memoryAlertStore } from "./alerts-fakes";

const T0 = Date.parse("2026-11-18T12:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000);
const ALL = new Set([
  "site_down",
  "cert_expiring",
  "disk",
  "memory",
  "backup_failed",
  "deploy_failed",
] as const);

const down = (failing: boolean, project = "shop"): Observation => ({
  key: `site_down:${project}`,
  kind: "site_down",
  project,
  failing,
  title: `${project} no responde`,
  detail: failing ? "/api/health respondió 502." : "",
});

describe("evaluate: streaks open and resolve incidents", () => {
  test("a site opens after 3 failing minutes and resolves after 5 fine ones", async () => {
    const m = memoryAlertStore();
    for (const i of [0, 1]) {
      const t = await evaluate(m.store, [down(true)], ALL, at(i));
      expect(t.opened).toEqual([]);
    }
    expect((await evaluate(m.store, [down(true)], ALL, at(2))).opened).toEqual([
      "site_down:shop",
    ]);
    // Still failing: no second row, last_seen moves.
    await evaluate(m.store, [down(true)], ALL, at(3));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]?.lastSeenAt).toEqual(at(3));
    for (const i of [4, 5, 6, 7])
      expect(
        (await evaluate(m.store, [down(false)], ALL, at(i))).resolved,
      ).toEqual([]);
    expect(
      (await evaluate(m.store, [down(false)], ALL, at(8))).resolved,
    ).toEqual(["site_down:shop"]);
    expect(m.rows[0]?.resolvedAt).toEqual(at(8));
  });

  test("a failing streak broken by one fine run starts again", async () => {
    const m = memoryAlertStore();
    await evaluate(m.store, [down(true)], ALL, at(0));
    await evaluate(m.store, [down(true)], ALL, at(1));
    await evaluate(m.store, [down(false)], ALL, at(2));
    await evaluate(m.store, [down(true)], ALL, at(3));
    await evaluate(m.store, [down(true)], ALL, at(4));
    expect(m.rows).toHaveLength(0);
  });

  test("an open alert whose subject is gone resolves only if its check ran", async () => {
    const m = memoryAlertStore();
    for (const i of [0, 1, 2])
      await evaluate(m.store, [down(true)], ALL, at(i));
    await evaluate(m.store, [], new Set(["disk"]), at(3));
    expect(m.rows[0]?.resolvedAt).toBeNull();
    const t = await evaluate(m.store, [], ALL, at(4));
    expect(t.resolved).toEqual(["site_down:shop"]);
  });

  test("certificates open on the first run", async () => {
    const m = memoryAlertStore();
    const t = await evaluate(
      m.store,
      [
        {
          key: "cert:a.com",
          kind: "cert_expiring",
          project: "a",
          failing: true,
          title: "x",
          detail: "",
        },
      ],
      ALL,
      at(0),
    );
    expect(t.opened).toEqual(["cert:a.com"]);
  });
});

describe("notify: one digest per run", () => {
  const capture = () => {
    const sent: Digest[] = [];
    return { sent, mailer: { send: async (d: Digest) => void sent.push(d) } };
  };

  test("everything that opened at once goes in one email, and only once", async () => {
    const m = memoryAlertStore();
    const obs = ["a", "b", "c"].map((p) => down(true, p));
    for (const i of [0, 1, 2]) await evaluate(m.store, obs, ALL, at(i));
    const c = capture();
    expect(await notify(m.store, c.mailer, renderDigest, at(2))).toEqual({
      sent: 3,
    });
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0]?.subject).toBe("[kit-deploy] 3 alertas: 3 abiertas");
    expect(await notify(m.store, c.mailer, renderDigest, at(3))).toEqual({
      sent: 0,
    });
    expect(c.sent).toHaveLength(1);
  });

  test("a failed send is retried by the next run", async () => {
    const m = memoryAlertStore();
    for (const i of [0, 1, 2])
      await evaluate(m.store, [down(true)], ALL, at(i));
    const broken = {
      send: async () => {
        throw new Error("Brevo answered 401");
      },
    };
    expect(await notify(m.store, broken, renderDigest, at(2))).toEqual({
      sent: 0,
      waiting: 1,
      reason: "Brevo answered 401",
    });
    const c = capture();
    expect(await notify(m.store, c.mailer, renderDigest, at(3))).toEqual({
      sent: 1,
    });
  });

  test("without a mailer the emails wait; opened and resolved meanwhile is one email", async () => {
    const m = memoryAlertStore();
    for (const i of [0, 1, 2])
      await evaluate(m.store, [down(true)], ALL, at(i));
    expect(await notify(m.store, null, renderDigest, at(2))).toMatchObject({
      waiting: 1,
    });
    for (const i of [3, 4, 5, 6, 7])
      await evaluate(m.store, [down(false)], ALL, at(i));
    const c = capture();
    expect(await notify(m.store, c.mailer, renderDigest, at(8))).toEqual({
      sent: 1,
    });
    expect(c.sent[0]?.subject).toBe("[kit-deploy] Resuelta: shop no responde");
    expect(await notify(m.store, c.mailer, renderDigest, at(9))).toEqual({
      sent: 0,
    });
  });

  test("resolved later: a second email, the resolved one", async () => {
    const m = memoryAlertStore();
    const c = capture();
    for (const i of [0, 1, 2])
      await evaluate(m.store, [down(true)], ALL, at(i));
    await notify(m.store, c.mailer, renderDigest, at(2));
    for (const i of [3, 4, 5, 6, 7])
      await evaluate(m.store, [down(false)], ALL, at(i));
    await notify(m.store, c.mailer, renderDigest, at(7));
    expect(c.sent.map((d) => d.subject)).toEqual([
      "[kit-deploy] Abierta: shop no responde",
      "[kit-deploy] Resuelta: shop no responde",
    ]);
    expect(c.sent[1]?.html).toContain("duró 5 min");
  });
});

describe("email", () => {
  test("tokens match app/globals.css' light theme", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const [name, hex] of Object.entries(EMAIL_TOKENS)) {
      const m = new RegExp(`--${name}: light-dark\\((#[0-9a-f]{6})`).exec(css);
      expect(m?.[1]).toBe(hex);
    }
  });

  test("escapes what it prints and writes the state as a word", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;",
    );
    const row = {
      id: "1",
      key: "site_down:shop",
      kind: "site_down" as const,
      project: "shop",
      title: "shop <b>",
      detail: "",
      openedAt: at(0),
      lastSeenAt: at(0),
      resolvedAt: null,
      notifiedAt: null,
      resolvedNotifiedAt: null,
    };
    const d = renderDigest([row], at(0));
    expect(d.html).toContain("shop &lt;b&gt;");
    expect(d.html).not.toContain("shop <b>");
    expect(d.html).toContain("ABIERTA");
    expect(d.html).toContain("https://deploy.fockus.dev/p/shop");
    expect(d.text).toContain("ABIERTA · Sitio caído · shop");
    expect(subjectOf([row, { ...row, id: "2", resolvedAt: at(3) }])).toBe(
      "[kit-deploy] 2 alertas: 1 abierta, 1 resuelta",
    );
  });
});

describe("Brevo", () => {
  const KEY = `xkeysib-${"a".repeat(64)}-AbCdEf123`;
  test("posts to the v3 API with the key only in its header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const m = brevoMailer(KEY, "cesar@example.com", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messageId: "<x>" }), {
        status: 201,
      });
    });
    await m.send({ subject: "s", html: "<p>h</p>", text: "t" });
    expect(calls[0]?.url).toBe(BREVO_URL);
    expect((calls[0]?.init.headers as Record<string, string>)["api-key"]).toBe(
      KEY,
    );
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({
      sender: { name: "kit-deploy", email: "alertas@fockus.dev" },
      to: [{ email: "cesar@example.com" }],
      subject: "s",
      htmlContent: "<p>h</p>",
    });
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  test("an error says Brevo's code, never the key", async () => {
    const m = brevoMailer(
      KEY,
      "c@example.com",
      async () =>
        new Response(
          JSON.stringify({ code: "unauthorized", message: "Key not found" }),
          { status: 401 },
        ),
    );
    const err = await m
      .send({ subject: "s", html: "h", text: "t" })
      .catch((e) => e as Error);
    expect(err?.message).toBe(
      "Brevo answered 401 (unauthorized: Key not found)",
    );
    expect(err?.message).not.toContain(KEY);
  });

  test("no mailer without a well-formed key and recipient", () => {
    expect(mailerFromEnv({})).toBeNull();
    expect(
      mailerFromEnv({ ALERTS_BREVO_KEY: "nope", ALERTS_TO: "c@example.com" }),
    ).toBeNull();
    expect(
      mailerFromEnv({ ALERTS_BREVO_KEY: KEY, ALERTS_TO: "not an email" }),
    ).toBeNull();
    expect(
      mailerFromEnv({ ALERTS_BREVO_KEY: KEY, ALERTS_TO: "c@example.com" }),
    ).not.toBeNull();
  });
});

const LE = `${CADDY_CERTS_DIR}/acme-v02.api.letsencrypt.org-directory`;
const STATUS = [
  "shop: shop-20261118-033001.dump",
  "old: old-20261116-033001.dump",
  "ghost: NO BACKUP",
  "Off-VPS: r2:kit-backups",
  "Last failures:",
  "FAIL 2026-11-17T03:30:02+00:00 shop: pg_dump",
  "FAIL 2026-11-18T03:30:09+00:00 kit_deploy: upload to r2:kit-backups (the dump is on this disk)",
  "",
].join("\n");

function agentSetup() {
  const f = fakeDeps({ "kit-db status": () => ({ stdout: STATUS }) });
  f.files.set(DB_CERT_PATH, DB_PEM);
  f.files.set(`${LE}/deploy.fockus.dev/deploy.fockus.dev.crt`, DEPLOY_PEM);
  f.files.set(
    `${LE}/wildcard_.preview.fockus.dev/wildcard_.preview.fockus.dev.crt`,
    WILDCARD_PEM,
  );
  const agent = new Agent(f.deps);
  const client: AgentClient = {
    call: (op, params) =>
      dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "1", op, params }),
      ) as Promise<Response>,
  };
  return { ...f, client };
}

describe("agent: platform.certs and backups.status", () => {
  test("schemas take no params", () => {
    for (const op of ["platform.certs", "backups.status"]) {
      expect(Request.safeParse({ id: "1", op, params: {} }).success).toBe(true);
      expect(Request.safeParse({ id: "1", op, params: { x: 1 } }).success).toBe(
        false,
      );
    }
  });

  test("the three platform certificates' expiry; never the key file", async () => {
    const s = agentSetup();
    const r = (await s.client.call("platform.certs", {})) as Response;
    expect(r.ok && r.result).toEqual([
      {
        name: "db.fockus.dev",
        notAfter: expect.stringMatching(/^2036-11-15T/),
      },
      {
        name: "deploy.fockus.dev",
        notAfter: expect.stringMatching(/^2036-11-15T/),
      },
      {
        name: "*.preview.fockus.dev",
        notAfter: expect.stringMatching(/^2036-11-15T/),
      },
    ]);
  });

  test("a missing certificate is null, not an error", async () => {
    const s = agentSetup();
    s.files.delete(DB_CERT_PATH);
    const r = (await s.client.call("platform.certs", {})) as Response;
    expect(
      r.ok && (r.result as { notAfter: string | null }[])[0]?.notAfter,
    ).toBeNull();
  });

  test("backups: every database's last dump and the FAIL lines, remote by label", async () => {
    const s = agentSetup();
    const r = (await s.client.call("backups.status", {})) as Response;
    if (!r.ok) throw new Error(r.error.message);
    expect(r.result).toEqual({
      databases: [
        { name: "shop", lastBackupAt: "2026-11-18T03:30:01.000Z" },
        { name: "old", lastBackupAt: "2026-11-16T03:30:01.000Z" },
        { name: "ghost", lastBackupAt: null },
      ],
      failures: [
        { at: "2026-11-17T03:30:02.000Z", db: "shop", why: "pg_dump" },
        {
          at: "2026-11-18T03:30:09.000Z",
          db: "kit_deploy",
          why: "upload to r2:kit-backups (the dump is on this disk)",
        },
      ],
    });
  });
});

function repo(over: Partial<CheckRepo> = {}): CheckRepo {
  return {
    liveSites: async () => [],
    domainCerts: async () => [],
    lastProductionDeploys: async () => [],
    vps: async () => null,
    ...over,
  };
}

/** An AgentClient answering from a table. */
function cannedAgent(answers: Record<string, unknown>): AgentClient {
  return {
    call: async (op) =>
      op in answers
        ? ({ id: "1", ok: true, result: answers[op] } as Response)
        : ({
            id: "1",
            ok: false,
            error: { code: "internal", message: `no ${op}` },
          } as Response),
  };
}

describe("runChecks", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const base = {
    "container.list": [
      {
        name: "kd-shop-aaa",
        state: "running",
        project: "shop",
        env: "production",
        port: 20001,
      },
      {
        name: "kd-blog-bbb",
        state: "exited",
        project: "blog",
        env: "production",
        port: 20002,
      },
      {
        name: "kd-off-ccc",
        state: "exited",
        project: "off",
        env: "production",
        port: 20003,
      },
    ],
    "health.check": { ok: false, status: 502 },
    "platform.certs": [
      { name: "db.fockus.dev", notAfter: "2026-11-25T00:00:00Z" },
      { name: "deploy.fockus.dev", notAfter: null },
    ],
    "backups.status": {
      databases: [
        { name: "shop", lastBackupAt: "2026-11-18T03:30:01Z" },
        { name: "old", lastBackupAt: "2026-11-16T03:30:01Z" },
      ],
      failures: [{ at: "2026-11-17T03:30:02Z", db: "shop", why: "pg_dump" }],
    },
  };
  const r = repo({
    liveSites: async () => [
      {
        project: "shop",
        container: "kd-shop-aaa",
        port: 20001,
        stoppedOnPurpose: false,
      },
      {
        project: "blog",
        container: "kd-blog-bbb",
        port: 20002,
        stoppedOnPurpose: false,
      },
      {
        project: "off",
        container: "kd-off-ccc",
        port: 20003,
        stoppedOnPurpose: true,
      },
    ],
    domainCerts: async () => [
      {
        project: "shop",
        host: "shop.com",
        certNotAfter: new Date("2027-01-30T00:00:00Z"),
        status: "ready",
      },
      {
        project: "shop",
        host: "new.shop.com",
        certNotAfter: null,
        status: "issuing",
      },
    ],
    lastProductionDeploys: async () => [
      {
        project: "shop",
        status: "failed",
        sha: "a".repeat(40),
        error: "/api/health did not answer 2xx in 60s",
        createdAt: new Date(now - 3_600_000),
      },
      {
        project: "blog",
        status: "failed",
        sha: "b".repeat(40),
        error: null,
        createdAt: new Date(now - 30 * 86_400_000),
      },
    ],
    vps: async () => ({
      at: new Date(now - 30_000),
      memUsed: 95,
      memTotal: 100,
      diskUsed: 50,
      diskTotal: 100,
      load1: 0,
      cpus: 4,
    }),
  });

  test("every subject once, failing or fine", async () => {
    const out = await runChecks({ agent: cannedAgent(base), repo: r, now });
    expect(out.problems).toEqual([]);
    const byKey = Object.fromEntries(out.observations.map((o) => [o.key, o]));
    expect(byKey["site_down:shop"]).toMatchObject({
      failing: true,
      detail: "/api/health respondió 502.",
    });
    expect(byKey["site_down:blog"]).toMatchObject({
      failing: true,
      detail: "El contenedor kd-blog-bbb no está en marcha.",
    });
    expect(byKey["site_down:off"]).toBeUndefined(); // Parar on purpose
    expect(byKey["cert:shop.com"]?.failing).toBe(false);
    expect(byKey["cert:new.shop.com"]).toBeUndefined();
    expect(byKey["cert:db.fockus.dev"]).toMatchObject({
      failing: true,
      title: "El certificado de db.fockus.dev vence en 6 días",
    });
    expect(byKey["cert:deploy.fockus.dev"]).toBeUndefined();
    expect(byKey.memory?.failing).toBe(true);
    expect(byKey.disk?.failing).toBe(false);
    // shop's failure is older than its newest dump: not failing. old's dump is 2.5 days old.
    expect(byKey["backup:shop"]?.failing).toBe(false);
    expect(byKey["backup:old"]).toMatchObject({
      failing: true,
      detail: "El último backup es del 2026-11-16.",
    });
    expect(byKey["deploy_failed:shop"]?.failing).toBe(true);
    expect(byKey["deploy_failed:blog"]?.failing).toBe(false); // a month old
    expect(out.covered.size).toBe(6);
  });

  test("a check that cannot run covers nothing and says why", async () => {
    const { "backups.status": _, ...rest } = base;
    const out = await runChecks({
      agent: cannedAgent(rest),
      repo: repo({ ...r, vps: async () => null }),
      now,
    });
    expect(out.covered.has("backup_failed")).toBe(false);
    expect(out.covered.has("disk")).toBe(false);
    expect(out.problems).toEqual([
      "vps: no VPS reading in the last 5 minutes",
      "backups: no backups.status",
    ]);
  });
});

describe("kit-deploy alerts", () => {
  const ctx = (extra = {}) => {
    const m = memoryAlertStore();
    return {
      m,
      ctx: {
        alerts: () => ({
          store: m.store,
          reader: m.reader,
          repo: repo(),
          mailer: null,
        }),
        now: () => T0,
        ...extra,
      },
    };
  };
  const agent = cannedAgent({
    "container.list": [],
    "platform.certs": [],
    "backups.status": { databases: [], failures: [] },
  });

  test("check: the summary, warnings on stderr, exit 0", async () => {
    const { ctx: c } = ctx();
    const r = await runCli(["alerts", "check"], agent, c);
    expect(r.code).toBe(0);
    expect(r.out).toBe("checked 0, failing 0, emailed 0\n");
    expect(r.err).toBe("warning: vps: no VPS reading in the last 5 minutes\n");
  });

  test("ls with nothing open", async () => {
    const { ctx: c } = ctx();
    expect((await runCli(["alerts", "ls"], agent, c)).out).toBe(
      "no open alerts\n",
    );
  });

  test("setup: root only, key from stdin, refused when malformed and never echoed", async () => {
    const written: string[][] = [];
    const base = {
      writeAlertsEnv: async (k: string, t: string) => void written.push([k, t]),
      readValue: async () => "not-a-key\n",
    };
    const notRoot = await runCli(
      ["alerts", "setup", "--to", "c@example.com"],
      agent,
      { ...base, pins: { isRoot: false, write: async () => {} } },
    );
    expect(notRoot.code).toBe(1);
    const bad = await runCli(
      ["alerts", "setup", "--to", "c@example.com"],
      agent,
      { ...base, pins: { isRoot: true, write: async () => {} } },
    );
    expect(bad.code).toBe(2);
    expect(bad.err).not.toContain("not-a-key");
    const key = `xkeysib-${"f".repeat(64)}-Ab12`;
    const good = await runCli(
      ["alerts", "setup", "--to", "c@example.com"],
      agent,
      {
        ...base,
        readValue: async () => `${key}\n`,
        pins: { isRoot: true, write: async () => {} },
      },
    );
    expect(good.code).toBe(0);
    expect(good.out).not.toContain(key);
    expect(written).toEqual([[key, "c@example.com"]]);
  });

  test("alerts.env: only its two keys are read", () => {
    expect(
      parseEnvFile(
        "ALERTS_BREVO_KEY=k\nALERTS_TO=a@b.co\nDATABASE_URL=x\n",
        new Set(["ALERTS_BREVO_KEY", "ALERTS_TO"]),
      ),
    ).toEqual({ ALERTS_BREVO_KEY: "k", ALERTS_TO: "a@b.co" });
  });
});

describe("kit-deploy-alerts.{service,timer}", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  test("every minute, oneshot, shorter than its period, shipped and installed", () => {
    expect(read("infra/kit-deploy-alerts.timer")).toMatch(
      /^OnUnitActiveSec=1min$/m,
    );
    const svc = read("infra/kit-deploy-alerts.service");
    expect(svc).toMatch(
      /^ExecStart=\/usr\/local\/bin\/kit-deploy alerts check$/m,
    );
    expect(svc).toMatch(/^TimeoutStartSec=55s$/m);
    expect(svc).toMatch(/^Requires=kit-agent\.service$/m);
    for (const u of ["kit-deploy-alerts.service", "kit-deploy-alerts.timer"])
      expect(read("scripts/release.sh")).toContain(`infra/${u}`);
    expect(read("infra/update.sh")).toContain(
      "install_timer kit-deploy-alerts",
    );
  });
});
