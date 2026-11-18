import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { OpName } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import type { ActionResult } from "../../lib/panel/actions/core";
import {
  rebuildProject,
  redeployProject,
  restartProject,
  rollbackProject,
  stopProject,
} from "../../lib/panel/actions/deployments";
import type { ActionDeps } from "../../lib/panel/actions/deps";
import {
  addProjectDomain,
  checkProjectDomainsNow,
  removeProjectDomain,
  setProjectDomainRedirect,
} from "../../lib/panel/actions/domains";
import { removeEnvVar, setEnvVar } from "../../lib/panel/actions/env";
import {
  createProject,
  createProjectDatabases,
  createToken,
  revokeToken,
} from "../../lib/panel/actions/projects";
import { formToObject } from "../../lib/panel/schemas";
import { hashToken } from "../../lib/tokens";
import { at, err, name, ok, sha } from "./deploy-fakes";
import { domainRow } from "./domain-fakes";
import { actionWorld, form, realAgent, USER } from "./panel-fakes";

const SECRET = "xkeysib-panel-never-shown-0123456789";
const raw = (fields: Record<string, string | string[]>) =>
  formToObject(form(fields), ["environments"]);

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: restoring every spy of a test
  (console.error as any).mockRestore?.();
});

type Action = (deps: ActionDeps, raw: unknown) => Promise<ActionResult>;
const ACTIONS: [string, Action][] = [
  ["setEnvVar", setEnvVar],
  ["removeEnvVar", removeEnvVar],
  ["redeployProject", redeployProject],
  ["rollbackProject", rollbackProject],
  ["rebuildProject", rebuildProject],
  ["stopProject", stopProject],
  ["restartProject", restartProject],
  ["addProjectDomain", addProjectDomain],
  ["removeProjectDomain", removeProjectDomain],
  ["setProjectDomainRedirect", setProjectDomainRedirect],
  ["checkProjectDomainsNow", checkProjectDomainsNow],
  ["createProject", createProject],
  ["createToken", createToken],
  ["revokeToken", revokeToken],
  ["createProjectDatabases", createProjectDatabases],
];

describe("panel actions: the session comes first", () => {
  test.each(
    ACTIONS,
  )("%s without a session → typed 401, nothing done", async (_n, action) => {
    const w = actionWorld({ user: null });
    const r = await action(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: SECRET,
        environments: ["production"],
        confirm: "kd_hello",
      }),
    );
    expect(r).toEqual({
      ok: false,
      code: "unauthorized",
      status: 401,
      message: expect.stringContaining("sesión"),
    });
    expect(w.fa.calls).toEqual([]);
    expect(w.env.audit).toEqual([]);
    expect(w.revalidated).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  test("a session lookup that throws is no session", async () => {
    const w = actionWorld();
    w.deps.user = async () => {
      throw new Error("db down");
    };
    const r = await redeployProject(w.deps, raw({ project: "kd_hello" }));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
});

describe("panel actions: schemas", () => {
  test("spaces are not a name; too long and bad shapes are refused with Spanish messages", async () => {
    const w = actionWorld();
    const spaces = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "   ",
        value: "x",
        environments: ["production"],
      }),
    );
    expect(spaces).toMatchObject({
      ok: false,
      code: "invalid",
      status: 400,
      fields: { name: "Falta el nombre." },
    });
    const long = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "A".repeat(129),
        value: "x",
        environments: ["production"],
      }),
    );
    expect(long).toMatchObject({
      ok: false,
      fields: { name: "Como mucho 128 caracteres." },
    });
    const managed = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "DATABASE_URL",
        value: "x",
        environments: ["production"],
      }),
    );
    expect(managed).toMatchObject({
      ok: false,
      fields: { name: expect.stringContaining("kit-deploy") },
    });
    const runtime = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "NODE_OPTIONS_X",
        value: "x",
        environments: ["production"],
      }),
    );
    expect(runtime).toMatchObject({
      ok: false,
      fields: { name: expect.stringContaining("runtime") },
    });
    const noEnv = await setEnvVar(
      w.deps,
      raw({ project: "kd_hello", name: "API_KEY", value: "x" }),
    );
    expect(noEnv).toMatchObject({
      ok: false,
      fields: { environments: "Marca al menos un entorno." },
    });
    const badProject = await redeployProject(
      w.deps,
      raw({ project: "Bad Name" }),
    );
    expect(badProject).toMatchObject({
      ok: false,
      code: "invalid",
      fields: { project: expect.any(String) },
    });
    expect(w.fa.calls).toEqual([]);
  });

  test("a value is never echoed: whitespace-only, multi-line and oversized values", async () => {
    const w = actionWorld();
    for (const value of [
      "   ",
      `${SECRET}\nsecond line`,
      SECRET.repeat(2000),
    ]) {
      const r = await setEnvVar(
        w.deps,
        raw({
          project: "kd_hello",
          name: "API_KEY",
          value,
          environments: ["production"],
        }),
      );
      expect(r).toMatchObject({ ok: false, code: "invalid" });
      expect(JSON.stringify(r)).not.toContain(SECRET);
    }
  });
});

describe("panel actions: variables", () => {
  test("set seals through kit-agent, stores only the blob, never returns the value", async () => {
    const a = realAgent();
    const w = actionWorld({ agent: a.client });
    const r = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: `${SECRET}\n`,
        secret: "on",
        environments: ["production", "preview"],
      }),
    );
    expect(r).toEqual({
      ok: true,
      name: "API_KEY",
      secret: true,
      environments: ["production", "preview"],
      created: { production: true, preview: true },
      needs: "redeploy",
    });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const stored = [...w.env.rows.values()];
    expect(stored).toHaveLength(2);
    for (const s of stored) {
      expect(s.secret).toBe(true);
      expect(JSON.stringify(s)).not.toContain(SECRET);
      expect(s.updatedBy).toBe(`web:${USER.userId}`);
    }
    expect(w.env.audit.map((x) => x.actor)).toEqual([
      `web:${USER.userId}`,
      `web:${USER.userId}`,
    ]);
    // The trailing newline of the textarea is not part of the value.
    expect(a.sent[0]).toMatchObject({
      op: "env.seal",
      params: { value: SECRET },
    });
    expect(a.logs.join("\n")).not.toContain(SECRET);
    expect(w.revalidated).toEqual(["/p/kd_hello/env"]);
  });

  test("a second submit replaces (upsert): created false, still one row per environment", async () => {
    const w = actionWorld({ agent: realAgent().client });
    const f = {
      project: "kd_hello",
      name: "API_KEY",
      value: SECRET,
      secret: "on",
      environments: ["production"],
    };
    await setEnvVar(w.deps, raw(f));
    const again = await setEnvVar(w.deps, raw(f));
    expect(again).toMatchObject({ ok: true, created: { production: false } });
    expect(w.env.rows.size).toBe(1);
  });

  test("NEXT_PUBLIC_* is plain and needs a rebuild; Development needs nothing", async () => {
    const w = actionWorld({ agent: realAgent().client });
    const pub = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "NEXT_PUBLIC_SITE",
        value: "https://x.example",
        secret: "on",
        environments: ["production", "development"],
      }),
    );
    expect(pub).toMatchObject({ ok: true, secret: false, needs: "rebuild" });
    const dev = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: SECRET,
        environments: ["development"],
      }),
    );
    expect(dev).toMatchObject({ ok: true, secret: false, needs: null });
  });

  test("a failed seal's message never contains the value, nor does the log", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const echoing: AgentClient = {
      async call(op) {
        if (op !== "env.seal") throw new Error(`unexpected ${op}`);
        return {
          id: "x",
          ok: false,
          error: { code: "internal", message: `could not seal ${SECRET}` },
        };
      },
    };
    const w = actionWorld({ agent: echoing });
    const r = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: SECRET,
        secret: "on",
        environments: ["production"],
      }),
    );
    expect(r).toMatchObject({ ok: false, code: "agent", status: 503 });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(SECRET);
    expect(w.env.rows.size).toBe(0);
    expect(w.revalidated).toEqual([]);
  });

  test("kit-agent down while sealing: the agent notice, no value anywhere", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const { AgentUnreachable } = await import("../../cli/client");
    const down: AgentClient = {
      async call() {
        throw new AgentUnreachable(
          "cannot reach kit-agent at /run/kit-deploy/agent.sock: ENOENT",
        );
      },
    };
    const w = actionWorld({ agent: down });
    const r = await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: SECRET,
        environments: ["production"],
      }),
    );
    expect(r).toMatchObject({
      ok: false,
      code: "agent",
      message: expect.stringContaining("kit-agent"),
    });
    expect(JSON.stringify(r) + JSON.stringify(errors.mock.calls)).not.toContain(
      SECRET,
    );
  });

  test("an unknown project is a 404, not a stack", async () => {
    const w = actionWorld({ agent: realAgent().client });
    const r = await setEnvVar(
      w.deps,
      raw({
        project: "nope",
        name: "API_KEY",
        value: SECRET,
        environments: ["production"],
      }),
    );
    expect(r).toMatchObject({ ok: false, code: "not_found", status: 404 });
  });

  test("remove needs the project's name typed; a second submit is ok with removed: false", async () => {
    const w = actionWorld({ agent: realAgent().client });
    await setEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        name: "API_KEY",
        value: SECRET,
        environments: ["production"],
      }),
    );
    const wrong = await removeEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        environment: "production",
        name: "API_KEY",
        confirm: "kd_hell",
      }),
    );
    expect(wrong).toMatchObject({
      ok: false,
      code: "confirmation",
      fields: { confirm: expect.any(String) },
    });
    expect(w.env.rows.size).toBe(1);
    const gone = await removeEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        environment: "production",
        name: "API_KEY",
        confirm: " kd_hello ",
      }),
    );
    expect(gone).toEqual({
      ok: true,
      name: "API_KEY",
      environment: "production",
      removed: true,
      needs: "redeploy",
    });
    const again = await removeEnvVar(
      w.deps,
      raw({
        project: "kd_hello",
        environment: "production",
        name: "API_KEY",
        confirm: "kd_hello",
      }),
    );
    expect(again).toMatchObject({ ok: true, removed: false, needs: null });
    expect(w.env.audit.filter((a) => a.action === "env.remove")).toHaveLength(
      1,
    );
  });
});

const LIVE = (extra: Partial<{ status: "live" | "superseded" }> = {}) => ({
  id: "d-live",
  sha: sha("a"),
  status: "live" as const,
  container: name("a"),
  port: 20001,
  createdAt: at(10),
  ...extra,
});

describe("panel actions: deployments", () => {
  test("redeploy queues the live commit's next generation and runs the switch after the response", async () => {
    const w = actionWorld({ rows: [LIVE()] });
    const r = await redeployProject(w.deps, raw({ project: "kd_hello" }));
    expect(r).toMatchObject({
      ok: true,
      already: false,
      deployment: { sha: sha("a"), generation: 2 },
    });
    expect(w.later).toHaveLength(1);
    expect(w.fa.calls).toEqual([]);
    await w.later[0]?.();
    expect(w.fa.ops()).toContain("container.run");
  });

  test("a second submit while the first is queued finds it, queues nothing", async () => {
    const open = { id: "d-q", sha: sha("a"), generation: 2 };
    const w = actionWorld({ rows: [LIVE()], open });
    const r = await redeployProject(w.deps, raw({ project: "kd_hello" }));
    expect(r).toEqual({ ok: true, deployment: open, already: true });
    expect(w.later).toEqual([]);
  });

  test("nothing live → conflict in Spanish; unknown project → 404", async () => {
    const w = actionWorld({ rows: [] });
    expect(
      await redeployProject(w.deps, raw({ project: "kd_hello" })),
    ).toMatchObject({
      ok: false,
      code: "conflict",
      message: expect.stringContaining("nada en vivo"),
    });
    expect(
      await redeployProject(w.deps, raw({ project: "kd_hello", pr: "7" })),
    ).toMatchObject({
      ok: false,
      code: "conflict",
      message: expect.stringContaining("#7"),
    });
    expect(
      await redeployProject(w.deps, raw({ project: "otro" })),
    ).toMatchObject({ ok: false, code: "not_found" });
  });

  test("rollback checks the typed project name, then goes back (or to the chosen one)", async () => {
    const rows = [
      LIVE(),
      {
        id: "d-old",
        sha: sha("b"),
        status: "superseded" as const,
        container: name("b"),
        port: 20002,
        createdAt: at(5),
      },
      {
        id: "d-older",
        sha: sha("c"),
        status: "superseded" as const,
        container: name("c"),
        port: 20003,
        createdAt: at(1),
      },
    ];
    const w = actionWorld({ rows });
    const wrong = await rollbackProject(
      w.deps,
      raw({ project: "kd_hello", confirm: "otro" }),
    );
    expect(wrong).toMatchObject({ ok: false, code: "confirmation" });
    expect(w.fa.calls).toEqual([]);
    const chosen = await rollbackProject(
      w.deps,
      raw({
        project: "kd_hello",
        confirm: "kd_hello",
        to: "00000000-0000-4000-8000-000000000000",
      }),
    );
    expect(chosen).toMatchObject({ ok: false, code: "conflict" });
    const back = await rollbackProject(
      w.deps,
      raw({ project: "kd_hello", confirm: "kd_hello" }),
    );
    expect(back).toMatchObject({ ok: true, from: "d-live", to: "d-old" });
  });

  test('rollback to a chosen kept deployment ("Rollback a este")', async () => {
    const { rollback } = await import("../../lib/deploy/switch");
    const { deps: sd, memoryRepo, fakeAgent } = await import("./deploy-fakes");
    const repo = memoryRepo([
      LIVE(),
      {
        id: "d-old",
        sha: sha("b"),
        status: "superseded",
        container: name("b"),
        port: 20002,
        createdAt: at(5),
      },
      {
        id: "d-older",
        sha: sha("c"),
        status: "superseded",
        container: name("c"),
        port: 20003,
        createdAt: at(1),
      },
    ]);
    const r = await rollback(sd(fakeAgent().agent, repo).d, "kd_hello", {
      to: "d-older",
    });
    expect(r).toEqual({ from: "d-live", to: "d-older" });
  });

  test("rollback with nothing kept → conflict", async () => {
    const w = actionWorld({ rows: [LIVE()] });
    const r = await rollbackProject(
      w.deps,
      raw({ project: "kd_hello", confirm: "kd_hello" }),
    );
    expect(r).toMatchObject({
      ok: false,
      code: "conflict",
      message: expect.stringContaining("anterior"),
    });
  });

  test("Parar needs the typed name; then stops production's container", async () => {
    const w = actionWorld({ rows: [LIVE()] });
    expect(
      await stopProject(
        w.deps,
        raw({ project: "kd_hello", confirm: "KD_HELLO" }),
      ),
    ).toMatchObject({ ok: false, code: "confirmation" });
    expect(w.fa.calls).toEqual([]);
    const r = await stopProject(
      w.deps,
      raw({ project: "kd_hello", confirm: "kd_hello" }),
    );
    expect(r).toEqual({ ok: true, container: name("a") });
    expect(w.fa.calls).toEqual([
      { op: "container.stop", params: { name: name("a") } },
    ]);
  });

  test("Reiniciar stops and starts the same container; nothing live → conflict", async () => {
    const w = actionWorld({ rows: [LIVE()] });
    expect(await restartProject(w.deps, raw({ project: "kd_hello" }))).toEqual({
      ok: true,
      container: name("a"),
    });
    expect(w.fa.ops()).toEqual(["container.stop", "container.start"]);
    const empty = actionWorld({ rows: [] });
    expect(
      await restartProject(empty.deps, raw({ project: "kd_hello" })),
    ).toMatchObject({ ok: false, code: "conflict" });
  });

  test("rebuild without the GitHub token says where it is; with it, dispatches", async () => {
    const w = actionWorld();
    expect(
      await rebuildProject(w.deps, raw({ project: "kd_hello" })),
    ).toMatchObject({
      ok: false,
      code: "failed",
      message: expect.stringContaining("github.env"),
    });
    const calls: string[] = [];
    const g = actionWorld({
      github: () => async (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        return new Response(null, { status: 204 });
      },
    });
    expect(await rebuildProject(g.deps, raw({ project: "kd_hello" }))).toEqual({
      ok: true,
      repo: "fockus26/kd-hello",
      branch: "main",
    });
    expect(calls).toEqual([
      "POST /repos/fockus26/kd-hello/actions/workflows/deploy-vps.yml/dispatches",
    ]);
  });
});

describe("panel actions: domains", () => {
  test("add returns the DNS records; a second submit of the same host is ok and adds nothing", async () => {
    const w = actionWorld();
    const r = await addProjectDomain(
      w.deps,
      raw({ project: "kd_hello", host: " Tienda.Example.com " }),
    );
    expect(r).toMatchObject({
      ok: true,
      host: "tienda.example.com",
      redirect: "none",
      already: false,
      dns: { zone: "example.com", records: [{ type: "A", name: "tienda" }] },
    });
    expect(w.admin.domains).toHaveLength(1);
    w.domains.rows.push(
      domainRow("tienda.example.com", { project: "kd_hello" }),
    );
    const again = await addProjectDomain(
      w.deps,
      raw({ project: "kd_hello", host: "tienda.example.com" }),
    );
    expect(again).toMatchObject({ ok: true, already: true });
    expect(w.admin.domains).toHaveLength(1);
  });

  test("another project's host → conflict; the platform's → invalid", async () => {
    const w = actionWorld();
    w.admin.domains.push({
      project: "otro",
      host: "x.example.com",
      redirect: "none",
    });
    expect(
      await addProjectDomain(
        w.deps,
        raw({ project: "kd_hello", host: "x.example.com" }),
      ),
    ).toMatchObject({ ok: false, code: "conflict", status: 409 });
    expect(
      await addProjectDomain(
        w.deps,
        raw({ project: "kd_hello", host: "deploy.fockus.dev" }),
      ),
    ).toMatchObject({
      ok: false,
      code: "invalid",
      fields: { host: "Ese dominio es de la plataforma." },
    });
    expect(
      await addProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "www.example.com",
          redirect: "to_apex",
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "invalid",
      fields: { redirect: expect.any(String) },
    });
  });

  test("remove checks the typed host; the default domain needs force; the last host stays", async () => {
    const w = actionWorld();
    w.domains.rows.push(
      domainRow("kd-hello.fockus.dev", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
      domainRow("tienda.example.com", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
    );
    expect(
      await removeProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "tienda.example.com",
          confirm: "tienda",
        }),
      ),
    ).toMatchObject({ ok: false, code: "confirmation" });
    expect(
      await removeProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "kd-hello.fockus.dev",
          confirm: "kd-hello.fockus.dev",
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "conflict",
      fields: { force: expect.any(String) },
    });
    expect(
      await removeProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "tienda.example.com",
          confirm: "tienda.example.com",
        }),
      ),
    ).toEqual({ ok: true, host: "tienda.example.com", site: "not_live" });
    expect(
      await removeProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "kd-hello.fockus.dev",
          confirm: "kd-hello.fockus.dev",
          force: "on",
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "conflict",
      message: expect.stringContaining("último"),
    });
    // A second submit of the one already removed.
    expect(
      await removeProjectDomain(
        w.deps,
        raw({
          project: "kd_hello",
          host: "tienda.example.com",
          confirm: "tienda.example.com",
        }),
      ),
    ).toMatchObject({ ok: true });
  });

  test("redirect and check now", async () => {
    const w = actionWorld();
    w.domains.rows.push(
      domainRow("example.com", { project: "kd_hello" }),
      domainRow("www.example.com", { project: "kd_hello" }),
    );
    expect(
      await setProjectDomainRedirect(
        w.deps,
        raw({
          project: "kd_hello",
          host: "www.example.com",
          redirect: "to_apex",
        }),
      ),
    ).toEqual({
      ok: true,
      host: "www.example.com",
      redirectsTo: "example.com",
      site: "not_live",
    });
    expect(
      await setProjectDomainRedirect(
        w.deps,
        raw({
          project: "kd_hello",
          host: "nope.example.com",
          redirect: "none",
        }),
      ),
    ).toMatchObject({ ok: false, code: "not_found" });
    const check = await checkProjectDomainsNow(
      w.deps,
      raw({ project: "kd_hello" }),
    );
    expect(check).toMatchObject({ ok: true, checked: 2, failed: 0 });
  });
});

describe("panel actions: projects, tokens, databases", () => {
  test("a new project returns its deploy token once; only the hash is stored", async () => {
    const w = actionWorld();
    const r = await createProject(
      w.deps,
      raw({
        name: "maranatha",
        repo: "fockus26/maranatha",
        branch: "",
        memoryMb: "256",
      }),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r).toMatchObject({
      project: "maranatha",
      hosts: ["maranatha.fockus.dev"],
      ghCommand: "gh secret set KIT_DEPLOY_TOKEN -R fockus26/maranatha",
    });
    expect(r.token).toMatch(/^kdt_[A-Za-z0-9_-]{43}$/);
    expect(w.admin.added).toEqual([
      {
        name: "maranatha",
        repo: "fockus26/maranatha",
        memoryMb: 256,
        hosts: ["maranatha.fockus.dev"],
        productionBranch: "main",
      },
    ]);
    expect(w.admin.tokens).toEqual([
      expect.objectContaining({
        project: "maranatha",
        hash: hashToken(r.token),
      }),
    ]);
    expect(JSON.stringify(w.admin.tokens)).not.toContain(r.token);
    const again = await createProject(
      w.deps,
      raw({ name: "maranatha", repo: "fockus26/maranatha" }),
    );
    expect(again).toMatchObject({ ok: false, code: "conflict", status: 409 });
    expect(w.admin.tokens).toHaveLength(1);
  });

  test("project form: _preview suffix, bad repo and memory out of range", async () => {
    const w = actionWorld();
    const r = await createProject(
      w.deps,
      raw({ name: "shop_preview", repo: "not a repo", memoryMb: "4096" }),
    );
    expect(r).toMatchObject({
      ok: false,
      code: "invalid",
      fields: {
        name: expect.stringContaining("_preview"),
        repo: expect.any(String),
        memoryMb: expect.any(String),
      },
    });
  });

  test("token create → once; revoke needs its project's name and is idempotent", async () => {
    const w = actionWorld();
    const t = await createToken(
      w.deps,
      raw({ project: "kd_hello", label: "  ci  " }),
    );
    expect(t).toMatchObject({
      ok: true,
      project: "kd_hello",
      token: expect.stringMatching(/^kdt_/),
    });
    expect(w.admin.tokens[0]?.label).toBe("ci");
    const id = "11111111-1111-4111-8111-111111111111";
    w.tokens.rows.push({
      id,
      project: "kd_hello",
      label: "ci",
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(
      await revokeToken(w.deps, raw({ id, confirm: "maranatha" })),
    ).toMatchObject({ ok: false, code: "confirmation" });
    expect(w.tokens.rows[0]?.revokedAt).toBeNull();
    expect(await revokeToken(w.deps, raw({ id, confirm: "kd_hello" }))).toEqual(
      { ok: true, id, revoked: true },
    );
    expect(await revokeToken(w.deps, raw({ id, confirm: "kd_hello" }))).toEqual(
      { ok: true, id, revoked: false },
    );
    expect(
      await revokeToken(
        w.deps,
        raw({
          id: "22222222-2222-4222-8222-222222222222",
          confirm: "kd_hello",
        }),
      ),
    ).toMatchObject({ ok: false, code: "not_found" });
  });

  test("Crear base: never for a name that is not a project; kit-db's refusal in Spanish", async () => {
    const calls: OpName[] = [];
    const agent: AgentClient = {
      async call(op) {
        calls.push(op);
        return op === "db.create"
          ? ok([
              { database: "kd_hello", created: true },
              { database: "kd_hello_preview", created: false },
            ])
          : err("x");
      },
    };
    const w = actionWorld({ agent });
    expect(
      await createProjectDatabases(w.deps, raw({ project: "nope" })),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(calls).toEqual([]);
    expect(
      await createProjectDatabases(w.deps, raw({ project: "kd_hello" })),
    ).toEqual({
      ok: true,
      databases: [
        { database: "kd_hello", created: true },
        { database: "kd_hello_preview", created: false },
      ],
    });
    const failing = actionWorld({
      agent: { call: async () => err("kit-db: exit 1") },
    });
    expect(
      await createProjectDatabases(failing.deps, raw({ project: "kd_hello" })),
    ).toMatchObject({
      ok: false,
      code: "failed",
      message: expect.stringContaining("kit-db"),
    });
  });
});
