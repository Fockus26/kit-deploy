/**
 * QA only (phase 05 W6): demo rows in the local QA database so every state of the panel's pages
 * can be seen and screenshotted — maranatha with 5 production deployments (live, kept, an older
 * one, a failed one, one starting), 3 previews (live, asleep, queued), variable names in the three
 * environments, 5 domains (one per status, plus one whose certificate is near expiry), 24 h of
 * metrics, deploy tokens and audit rows; kd_hello with one live deployment. Refuses any database
 * that is not this machine's `qa_<port>`, exactly like scripts/qa-session.ts.
 *
 *   bun run qa:local -- --port 4301                 # wait for "QA ready"
 *   bun scripts/qa-session.ts --port 4301 --demo    # the account, its session, the projects
 *   bun scripts/qa-seed.ts --port 4301              # these rows (once; a second run skips them)
 *
 * Variables are seeded as names only: their sealed blobs are random bytes no key opens. Locally
 * there is no kit-agent either, so the Variables page shows the names, "••••••••" for secrets and
 * the "No se pudo hablar con kit-agent" notice where plain values would be; Logs and Bases show
 * that notice too. That is the agent-down state, on purpose.
 */
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Environment } from "../lib/core/env";
import {
  auditLog,
  type DeploymentStatus,
  type DomainRedirect,
  type DomainStatus,
  deployments,
  deployTokens,
  domains,
  envVars,
  metricSamples,
  projects,
} from "../lib/db/schema";
import { db } from "../lib/db/store";
import { containerUrl, DEMO_PROJECTS, isLocalQaDatabase } from "./qa-session";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SEED_ACTOR = "ssh:qa-seed";

/** A commit per letter, so the 7-character SHAs on screen differ at a glance. */
const commit = (seed: string) =>
  seed.repeat(Math.ceil(40 / seed.length)).slice(0, 40);

export type SeedDeployment = {
  project: string;
  environment: "production" | "preview";
  pr: number | null;
  sha: string;
  status: DeploymentStatus;
  container: string | null;
  port: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type SeedDomain = {
  project: string;
  host: string;
  redirect: DomainRedirect;
  status: DomainStatus;
  dnsOkAt: Date | null;
  dnsCheckedAt: Date | null;
  certNotAfter: Date | null;
  lastError: string | null;
};

export type SeedVar = {
  project: string;
  environment: Environment;
  name: string;
  secret: boolean;
  updatedAt: Date;
};

function container(project: string, env: string, sha: string) {
  return `${project}-${env}-${sha.slice(0, 12)}`;
}

export function seedRows(now: number) {
  const at = (msAgo: number) => new Date(now - msAgo);
  const d = (
    over: Omit<SeedDeployment, "container" | "port" | "error" | "finishedAt"> &
      Partial<SeedDeployment>,
  ): SeedDeployment => ({
    container: null,
    port: null,
    error: null,
    finishedAt: null,
    ...over,
  });
  const live = commit("a3f9c21");
  const kept = commit("9b1e7d4");
  const deps: SeedDeployment[] = [
    d({
      project: "maranatha",
      environment: "production",
      pr: null,
      sha: commit("c4d2e8f"),
      status: "starting",
      createdAt: at(2 * MINUTE),
    }),
    d({
      project: "maranatha",
      environment: "production",
      pr: null,
      sha: live,
      status: "live",
      container: container("maranatha", "prod", live),
      port: 20101,
      createdAt: at(3 * HOUR),
      finishedAt: at(3 * HOUR - 48_000),
    }),
    d({
      project: "maranatha",
      environment: "production",
      pr: null,
      sha: commit("e7a0b35"),
      status: "failed",
      error: "el contenedor no respondió /api/health en 60 s",
      createdAt: at(5 * HOUR),
      finishedAt: at(5 * HOUR - 75_000),
    }),
    d({
      project: "maranatha",
      environment: "production",
      pr: null,
      sha: kept,
      status: "superseded",
      container: container("maranatha", "prod", kept),
      port: 20102,
      createdAt: at(DAY),
      finishedAt: at(DAY - 52_000),
    }),
    d({
      project: "maranatha",
      environment: "production",
      pr: null,
      sha: commit("1d6f0aa"),
      status: "superseded",
      createdAt: at(3 * DAY),
      finishedAt: at(3 * DAY - 61_000),
    }),
    // Previews: one live, one asleep (D017), one on its way.
    d({
      project: "maranatha",
      environment: "preview",
      pr: 42,
      sha: commit("5e2c9b0"),
      status: "live",
      container: container("maranatha", "pr-42", commit("5e2c9b0")),
      port: 20142,
      createdAt: at(40 * MINUTE),
      finishedAt: at(40 * MINUTE - 39_000),
    }),
    d({
      project: "maranatha",
      environment: "preview",
      pr: 38,
      sha: commit("b81f4c6"),
      status: "asleep",
      createdAt: at(2 * DAY),
      finishedAt: at(2 * DAY - 44_000),
    }),
    d({
      project: "maranatha",
      environment: "preview",
      pr: 45,
      sha: commit("07ad3e1"),
      status: "queued",
      createdAt: at(MINUTE),
    }),
    d({
      project: "kd_hello",
      environment: "production",
      pr: null,
      sha: commit("f00dcafe"),
      status: "live",
      container: container("kd_hello", "prod", commit("f00dcafe")),
      port: 20201,
      createdAt: at(6 * DAY),
      finishedAt: at(6 * DAY - 30_000),
    }),
  ];

  const dom = (
    host: string,
    status: DomainStatus,
    over: Partial<SeedDomain> = {},
  ): SeedDomain => ({
    project: "maranatha",
    host,
    redirect: "none",
    status,
    dnsOkAt: status === "pending_dns" ? null : at(10 * DAY),
    dnsCheckedAt: at(MINUTE),
    certNotAfter: null,
    lastError: null,
    ...over,
  });
  const doms: SeedDomain[] = [
    dom("maranatha.fockus.dev", "ready", { certNotAfter: at(-62 * DAY) }),
    // Certificate within 14 days: the page shows it in --warning.
    dom("iglesiamaranatha.org", "ready", { certNotAfter: at(-9 * DAY) }),
    dom("www.iglesiamaranatha.org", "issuing", {
      redirect: "to_apex",
      dnsOkAt: at(3 * MINUTE),
    }),
    dom("eventos.iglesiamaranatha.org", "pending_dns", {
      lastError: "todavía no resuelve a 178.238.238.7",
    }),
    dom("donaciones.iglesiamaranatha.org", "error", {
      lastError: "el DNS apunta a otro servidor (104.21.3.9)",
    }),
    dom("kd-hello.fockus.dev", "ready", {
      project: "kd_hello",
      certNotAfter: at(-80 * DAY),
    }),
  ];

  const v = (
    environment: Environment,
    name: string,
    secret: boolean,
    ago: number,
  ): SeedVar => ({
    project: "maranatha",
    environment,
    name,
    secret,
    updatedAt: at(ago),
  });
  const vars: SeedVar[] = [
    v("production", "RESEND_API_KEY", true, 2 * DAY),
    v("production", "STRIPE_SECRET_KEY", true, 9 * DAY),
    v("production", "NEXT_PUBLIC_SITE_URL", false, 9 * DAY),
    v("production", "EVENTOS_POR_PAGINA", false, 4 * HOUR),
    v("preview", "RESEND_API_KEY", true, 2 * DAY),
    v("preview", "NEXT_PUBLIC_SITE_URL", false, 9 * DAY),
    v("development", "DEBUG_EVENTOS", false, DAY),
  ];

  const audit = [
    {
      action: "env.set" as const,
      environment: "production" as const,
      name: "EVENTOS_POR_PAGINA",
      at: at(4 * HOUR),
    },
    {
      action: "env.set" as const,
      environment: "production" as const,
      name: "RESEND_API_KEY",
      at: at(2 * DAY),
    },
    {
      action: "env.set" as const,
      environment: "preview" as const,
      name: "RESEND_API_KEY",
      at: at(2 * DAY),
    },
    {
      action: "env.remove" as const,
      environment: "production" as const,
      name: "MAILGUN_API_KEY",
      at: at(2 * DAY + MINUTE),
    },
    {
      action: "env.set" as const,
      environment: "development" as const,
      name: "DEBUG_EVENTOS",
      at: at(DAY),
    },
  ];

  const tokens = [
    {
      project: "maranatha",
      label: "GitHub Actions",
      createdAt: at(30 * DAY),
      lastUsedAt: at(3 * HOUR),
      revokedAt: null,
    },
    {
      project: "maranatha",
      label: "token anterior",
      createdAt: at(60 * DAY),
      lastUsedAt: at(31 * DAY),
      revokedAt: at(30 * DAY),
    },
    {
      project: "kd_hello",
      label: "GitHub Actions",
      createdAt: at(7 * DAY),
      lastUsedAt: at(6 * DAY),
      revokedAt: null,
    },
  ];

  return { deployments: deps, domains: doms, vars, audit, tokens };
}

/** 24 h of 1-minute rows: the VPS, maranatha's live container and its requests. */
export function seedMetrics(now: number, liveContainer: string) {
  const start = Math.floor(now / MINUTE) * MINUTE - DAY;
  const rows: (typeof metricSamples.$inferInsert)[] = [];
  for (let i = 0; i < 24 * 60; i++) {
    const bucket = new Date(start + i * MINUTE);
    const wave = (Math.sin(i / 90) + 1) / 2;
    rows.push(
      {
        scope: "vps",
        subject: "vps",
        resolution: "1m",
        bucket,
        memBytes: Math.round((4.1 + wave * 1.3) * 1024 ** 3),
        memLimitBytes: 8 * 1024 ** 3,
        diskBytes: 41 * 1024 ** 3,
        diskTotalBytes: 160 * 1024 ** 3,
        load1: 0.35 + wave * 0.9,
        cpus: 4,
      },
      {
        scope: "container",
        subject: liveContainer,
        project: "maranatha",
        environment: "production",
        resolution: "1m",
        bucket,
        cpuPct: 2 + wave * 14,
        memBytes: Math.round((150 + wave * 90) * 1024 ** 2),
        memLimitBytes: 512 * 1024 ** 2,
      },
      {
        scope: "requests",
        subject: "maranatha/production",
        project: "maranatha",
        environment: "production",
        resolution: "1m",
        bucket,
        requests: Math.round(4 + wave * 30),
        requests5xx: i % 97 === 0 ? 1 : 0,
      },
    );
  }
  return rows;
}

/** Random bytes in the shape `env_vars` checks: no key opens them (names only). */
function fakeSealed() {
  return {
    ciphertext: randomBytes(24).toString("base64"),
    iv: randomBytes(12).toString("base64"),
    tag: randomBytes(16).toString("base64"),
    keyVersion: 1,
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const port = args[args.indexOf("--port") + 1] ?? "";
  if (!args.includes("--port") || !/^\d{2,5}$/.test(port))
    fail("usage: bun scripts/qa-seed.ts --port <qa port>");
  const url = process.env.DATABASE_URL || containerUrl(port);
  if (!isLocalQaDatabase(url, port))
    fail(`refused: DATABASE_URL is not this machine's qa_${port} database`);
  process.env.DATABASE_URL = url;

  const database = db();
  const now = Date.now();
  const seed = seedRows(now);

  await database
    .insert(projects)
    .values(DEMO_PROJECTS.map((p) => ({ ...p })))
    .onConflictDoNothing();
  const ids = new Map(
    (
      await database
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.name, ["maranatha", "kd_hello"]))
    ).map((p) => [p.name, p.id]),
  );
  const id = (name: string) => {
    const v = ids.get(name);
    if (!v) throw new Error(`no project ${name}`);
    return v;
  };

  const [already] = await database
    .select({ id: deployments.id })
    .from(deployments)
    .where(eq(deployments.projectId, id("maranatha")))
    .limit(1);
  if (already) {
    console.log(
      "demo rows already there: nothing added (reset qa:local to start over)",
    );
    await database.$client.end();
    return;
  }

  await database.transaction(async (tx) => {
    await tx.insert(deployments).values(
      seed.deployments.map(({ project, ...d }) => ({
        ...d,
        projectId: id(project),
        image: `ghcr.io/demo-qa/${project.replace(/_/g, "-")}:${d.sha}`,
      })),
    );
    await tx
      .insert(domains)
      .values(
        seed.domains.map(({ project, ...d }) => ({
          ...d,
          projectId: id(project),
        })),
      )
      .onConflictDoNothing();
    await tx.insert(envVars).values(
      seed.vars.map(({ project, ...v }) => ({
        ...v,
        ...fakeSealed(),
        projectId: id(project),
        updatedBy: SEED_ACTOR,
      })),
    );
    await tx.insert(auditLog).values(
      seed.audit.map((a) => ({
        ...a,
        actor: SEED_ACTOR,
        project: "maranatha",
      })),
    );
    await tx.insert(deployTokens).values(
      seed.tokens.map(({ project, ...t }) => ({
        ...t,
        projectId: id(project),
        // A hash of nothing anyone holds: these tokens cannot be used.
        tokenHash: randomBytes(32).toString("hex"),
      })),
    );
  });

  const liveContainer = seed.deployments.find(
    (d) => d.project === "maranatha" && d.status === "live",
  )?.container;
  if (!liveContainer) throw new Error("no live container in the seed");
  const metrics = seedMetrics(now, liveContainer);
  for (let i = 0; i < metrics.length; i += 500)
    await database
      .insert(metricSamples)
      .values(metrics.slice(i, i + 500))
      .onConflictDoNothing();

  console.log(
    `demo rows added: ${seed.deployments.length} deployments, ${seed.domains.length} domains, ${seed.vars.length} variable names, ${seed.tokens.length} tokens, ${metrics.length} metric samples`,
  );
  await database.$client.end();
}

if (import.meta.main) await main();
