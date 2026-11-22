/**
 * Eliminar proyecto from the panel (D069, D070): the action over fakes — the session, the typed
 * name, the TOTP checks and the shared guard, then D059's order (kit-agent answers a dry run, the
 * rows, then the machine) — and Inicio's notice.
 */
import { describe, expect, test } from "bun:test";
import type { ProjectRemoval } from "../../agent/project-remove";
import type { AgentClient } from "../../cli/client";
import { AgentUnreachable } from "../../cli/client";
import { failedLine } from "../../lib/auth/handler";
import { memoryTotpGuard, type TotpVerdict } from "../../lib/auth/totp-check";
import type { AuditEntry } from "../../lib/db/audit";
import type {
  ProjectFootprint,
  ProjectRemovalStore,
} from "../../lib/db/project-remove";
import {
  PROJECT_REMOVE_COPY,
  PROJECT_REMOVE_PATH,
  type ProjectRemoveDeps,
  projectRemovalFootprint,
  removeProjectFromPanel,
} from "../../lib/panel/actions/project-remove";
import {
  removedNotice,
  removedNoticeHref,
} from "../../lib/panel/removed-notice";
import { projectRemoveSchema } from "../../lib/panel/schemas";

const CESAR = { userId: "user-cesar", email: "cesar@example.com" };
const GOOD = "123456";
const P = "kd_hello";

const ROWS: ProjectFootprint = {
  repo: "Fockus26/kd-hello",
  deployments: 4,
  previews: 1,
  hosts: ["kd-hello.fockus.dev"],
  variables: 2,
  tokens: 1,
  cronJobs: 0,
  openAlerts: 1,
};

const machine = (over: Partial<ProjectRemoval> = {}): ProjectRemoval => ({
  project: P,
  dryRun: false,
  sites: ["/etc/caddy/sites/kd_hello.caddy"],
  containers: [{ name: "kd_hello-prod-abc1234", state: "running" }],
  images: ["ghcr.io/fockus26/kd-hello:abc1234"],
  pin: "/etc/kit-deploy/images/kd_hello",
  databases: [
    { database: P, exists: true, managed: true },
    { database: `${P}_preview`, exists: false, managed: false },
  ],
  skipped: [],
  failed: [],
  ...over,
});

const EMPTY = machine({ sites: [], containers: [], images: [], pin: null });

function fakes(
  opts: {
    session?: boolean;
    totp?: boolean;
    verdict?: (code: string) => TotpVerdict;
    rows?: ProjectFootprint | null;
    /** What kit-agent answers to each call (dry run first). */
    agent?: (dryRun: boolean) => ProjectRemoval | Error;
  } = {},
) {
  let rows = opts.rows === undefined ? ROWS : opts.rows;
  const events: string[] = [];
  const audits: AuditEntry[] = [];
  const logs: string[] = [];
  const verified: string[] = [];
  const revalidated: string[] = [];
  const removal: ProjectRemovalStore = {
    async footprint() {
      return rows;
    },
    async remove(_p, audit) {
      events.push("rows");
      if (!rows) return false;
      rows = null;
      audits.push(audit);
      return true;
    },
    async record(audit) {
      events.push("record");
      audits.push(audit);
    },
  };
  const agent: AgentClient = {
    async call(op, params) {
      const { dryRun } = params as { dryRun: boolean };
      events.push(`${op}${dryRun ? " (dry run)" : ""}`);
      const r = (opts.agent ?? ((d) => machine({ dryRun: d })))(dryRun);
      if (r instanceof Error) throw r;
      return { id: "x", ok: true, result: r };
    },
  };
  const deps: ProjectRemoveDeps = {
    user: async () => (opts.session === false ? null : CESAR),
    agent,
    removal,
    totpEnabled: async () => opts.totp ?? true,
    verifyTotp: async (_u, code) => {
      verified.push(code);
      return (opts.verdict ?? ((c) => (c === GOOD ? "ok" : "invalid")))(code);
    },
    guard: memoryTotpGuard(),
    clientIp: async () => "203.0.113.7",
    log: (l) => logs.push(l),
    revalidate: (path, type) =>
      revalidated.push(`${path}${type ? ` ${type}` : ""}`),
  };
  return { deps, events, audits, logs, verified, revalidated };
}

const form = (over: Record<string, unknown> = {}) => ({
  project: P,
  confirm: P,
  code: GOOD,
  ...over,
});

describe("removeProjectFromPanel", () => {
  test("success: dry run, then the rows, then the machine; audited as the panel user", async () => {
    const f = fakes();
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r).toEqual({ ok: true, project: P, already: false, partial: false });
    expect(f.events).toEqual([
      "project.remove (dry run)",
      "rows",
      "project.remove",
    ]);
    expect(f.audits).toEqual([
      {
        actor: `web:${CESAR.userId}`,
        action: "project.remove",
        project: P,
        environment: null,
        name: ROWS.repo,
      },
    ]);
    expect(f.revalidated).toEqual(["/", `/p/${P} layout`]);
    expect(f.logs).toEqual([]);
  });

  test("no session: refused before anything", async () => {
    const f = fakes({ session: false });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unauthorized");
    expect(f.events).toEqual([]);
    expect(f.verified).toEqual([]);
  });

  test("wrong name: refused on its field, no code checked or spent", async () => {
    const f = fakes();
    const r = await removeProjectFromPanel(
      f.deps,
      form({ confirm: "kd_hell" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("confirmation");
      expect(r.fields?.confirm).toBeDefined();
    }
    expect(f.verified).toEqual([]);
    expect(f.events).toEqual([]);
    // The same code still works once the name is right.
    expect((await removeProjectFromPanel(f.deps, form())).ok).toBe(true);
  });

  test("a code that is not 6 digits is refused by the form; spaces are dropped", async () => {
    const f = fakes();
    for (const code of ["12345", "1234567", "abcdef", "", "   "]) {
      const r = await removeProjectFromPanel(f.deps, form({ code }));
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(r.fields?.code).toBe("Escribe los 6 dígitos de tu app.");
    }
    expect(f.verified).toEqual([]);
    const parsed = projectRemoveSchema.safeParse(form({ code: " 123 456 " }));
    expect(parsed.success && parsed.data.code).toBe(GOOD);
  });

  test("reserved and _preview names: refused server-side before any TOTP check", async () => {
    for (const project of ["kit_deploy", "postgres", "kd_hello_preview"]) {
      const f = fakes();
      const r = await removeProjectFromPanel(
        f.deps,
        form({ project, confirm: project }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("invalid");
        expect(r.message).toBe(PROJECT_REMOVE_COPY.reserved);
      }
      expect(f.verified).toEqual([]);
      expect(f.events).toEqual([]);
    }
  });

  test("TOTP off: refused, nothing touched", async () => {
    const f = fakes({ totp: false });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("conflict");
      expect(r.message).toBe(PROJECT_REMOVE_COPY.noTotp);
    }
    expect(f.verified).toEqual([]);
    expect(f.events).toEqual([]);
  });

  test("wrong code: refused on its field, the failed line logged, nothing touched", async () => {
    const f = fakes();
    const r = await removeProjectFromPanel(f.deps, form({ code: "654321" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("confirmation");
      expect(r.fields?.code).toBe(PROJECT_REMOVE_COPY.wrongCodeField);
      expect(JSON.stringify(r)).not.toContain("654321");
    }
    expect(f.logs).toEqual([
      failedLine("203.0.113.7", PROJECT_REMOVE_PATH, 401),
    ]);
    expect(f.events).toEqual([]);
  });

  test("blocked after 5 wrong codes: 429 and its line, even with the right one", async () => {
    const f = fakes();
    for (let i = 0; i < 5; i++)
      await removeProjectFromPanel(f.deps, form({ code: `00000${i}` }));
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("too_many");
    expect(f.logs.at(-1)).toBe(
      failedLine("203.0.113.7", PROJECT_REMOVE_PATH, 429),
    );
    expect(f.events).toEqual([]);
  });

  test("a code that already confirmed an action is refused (the guard is shared)", async () => {
    const f = fakes();
    // The same guard confirmed something else with GOOD (another panel action).
    expect(f.deps.guard.attempt(CESAR.userId, GOOD)).toBe("go");
    f.deps.guard.succeeded(CESAR.userId);
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("confirmation");
      expect(r.fields?.code).toBe(PROJECT_REMOVE_COPY.reusedField);
    }
    expect(f.verified).toEqual([]);
    expect(f.events).toEqual([]);
  });

  test("Better Auth says TOTP is off: refused as off", async () => {
    const f = fakes({ verdict: () => "not_enabled" });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(PROJECT_REMOVE_COPY.noTotp);
    expect(f.events).toEqual([]);
  });

  test("kit-agent down before the rows: nothing removed", async () => {
    const f = fakes({
      agent: () => new AgentUnreachable("kit-agent did not answer in time"),
    });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("agent");
      expect(r.message).toBe(PROJECT_REMOVE_COPY.agentDown);
    }
    expect(f.events).toEqual(["project.remove (dry run)"]);
    expect(f.audits).toEqual([]);
  });

  test("kit-agent stops answering after the rows: partial, rows gone", async () => {
    const f = fakes({
      agent: (dryRun) =>
        dryRun ? machine({ dryRun }) : new AgentUnreachable("kit-agent gone"),
    });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r).toEqual({ ok: true, project: P, already: false, partial: true });
    expect(f.events).toEqual([
      "project.remove (dry run)",
      "rows",
      "project.remove",
    ]);
    expect(f.audits).toHaveLength(1);
    expect(f.logs).toEqual([
      `panel action project.remove: ${P}: kit-agent gone`,
    ]);
  });

  test("kit-agent refuses after the rows: partial", async () => {
    const f = fakes();
    f.deps.agent = {
      async call(_op, params) {
        const { dryRun } = params as { dryRun: boolean };
        f.events.push(`project.remove${dryRun ? " (dry run)" : ""}`);
        return dryRun
          ? { id: "x", ok: true, result: machine({ dryRun }) }
          : {
              id: "x",
              ok: false,
              error: { code: "command_failed", message: "caddy reload failed" },
            };
      },
    };
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r.ok && r.partial).toBe(true);
    expect(f.events).toEqual([
      "project.remove (dry run)",
      "rows",
      "project.remove",
    ]);
  });

  test("a step fails on the machine: partial, the failure logged", async () => {
    const f = fakes({
      agent: (dryRun) =>
        machine({ dryRun, failed: dryRun ? [] : ["image x: in use"] }),
    });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r).toEqual({ ok: true, project: P, already: false, partial: true });
    expect(f.logs).toEqual([
      `panel action project.remove: ${P}: failed: image x: in use`,
    ]);
  });

  test("a second submit with a new code: already gone, no second audit row", async () => {
    const f = fakes({
      agent: (dryRun) => ({ ...EMPTY, dryRun }),
      verdict: () => "ok",
    });
    expect((await removeProjectFromPanel(f.deps, form())).ok).toBe(true);
    const r = await removeProjectFromPanel(f.deps, form({ code: "111111" }));
    expect(r).toEqual({ ok: true, project: P, already: true, partial: false });
    expect(f.audits).toHaveLength(1);
  });

  test("only machine leftovers (no rows): removed, and its audit row still written", async () => {
    const f = fakes({ rows: null });
    const r = await removeProjectFromPanel(f.deps, form());
    expect(r).toEqual({ ok: true, project: P, already: false, partial: false });
    expect(f.events).toEqual([
      "project.remove (dry run)",
      "project.remove",
      "record",
    ]);
    expect(f.audits[0]?.name).toBeNull();
  });
});

describe("projectRemovalFootprint", () => {
  test("names and counts for the dialog", async () => {
    const r = await projectRemovalFootprint(fakes().deps, { project: P });
    expect(r).toEqual({ ok: true, project: P, footprint: ROWS });
  });

  test("unknown project: not found; no session: unauthorized", async () => {
    const gone = await projectRemovalFootprint(fakes({ rows: null }).deps, {
      project: P,
    });
    expect(gone.ok === false && gone.code).toBe("not_found");
    const anon = await projectRemovalFootprint(fakes({ session: false }).deps, {
      project: P,
    });
    expect(anon.ok === false && anon.code).toBe("unauthorized");
  });
});

describe("Inicio's notice", () => {
  test("href per outcome", () => {
    const base = { project: P, partial: false, already: false };
    expect(removedNoticeHref(base)).toBe(`/?eliminado=${P}`);
    expect(removedNoticeHref({ ...base, partial: true })).toBe(
      `/?eliminado=${P}&estado=pendiente`,
    );
    expect(removedNoticeHref({ ...base, already: true })).toBe(
      `/?eliminado=${P}&estado=ya`,
    );
  });

  test("worded per outcome; the databases are said to stay", () => {
    const done = removedNotice({ eliminado: P }, []);
    expect(done?.tone).toBe("info");
    expect(done?.title).toBe(`${P} eliminado`);
    expect(done?.body).toContain(`${P}_preview`);
    const partial = removedNotice({ eliminado: P, estado: "pendiente" }, []);
    expect(partial?.tone).toBe("warning");
    expect(partial?.command).toBe(`kit-deploy project rm ${P} --yes`);
  });

  test("never for a project still listed, or a name that is not one", () => {
    expect(removedNotice({ eliminado: P }, [P])).toBeNull();
    expect(removedNotice({ eliminado: "<script>" }, [])).toBeNull();
    expect(removedNotice({}, [])).toBeNull();
  });
});
