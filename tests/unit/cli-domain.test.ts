import { describe, expect, test } from "bun:test";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { VPS_IPV4 } from "../../lib/core/constants";
import { AdminError, type AdminStore } from "../../lib/db/admin";
import type { DomainRow } from "../../lib/domains/store";
import { domainRow, domainWorld, MIN, pointed, T0 } from "./domain-fakes";

const unused: AgentClient = {
  async call() {
    throw new Error("the CLI's own client is not used by domain commands");
  },
};

function cli(rows: DomainRow[], opts: Parameters<typeof domainWorld>[1] = {}) {
  const w = domainWorld(rows, opts);
  const admin = {
    async addDomain(project: string, host: string, redirect = "none") {
      if (project !== "shop") throw new AdminError(`no project ${project}`);
      if (rows.some((r) => r.host === host))
        throw new AdminError(`${host} already belongs to a project`);
      rows.push(domainRow(host, { project, redirect: redirect as "none" }));
    },
  } as unknown as AdminStore;
  const run = (argv: string[]) =>
    runCli(argv, unused, { admin: () => admin, domains: () => w.deps });
  return { ...w, run };
}

const served = (host: string, over: Partial<DomainRow> = {}) =>
  domainRow(host, {
    status: "ready",
    dnsOkAt: new Date(T0 - 60 * MIN),
    ...over,
  });

describe("kit-deploy domain add", () => {
  test("pending until DNS points; prints the record to create", async () => {
    const c = cli([]);
    const r = await c.run(["domain", "add", "shop", "Tienda.Example.com"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      `A tienda ${VPS_IPV4} (DNS only) in example.com; no AAAA record`,
    );
    expect(c.rows[0]).toMatchObject({
      host: "tienda.example.com",
      status: "pending_dns",
    });
  });

  test("--redirect to-apex needs the apex to be a domain of the project first", async () => {
    const c = cli([]);
    const r = await c.run([
      "domain",
      "add",
      "shop",
      "www.example.com",
      "--redirect",
      "to-apex",
    ]);
    expect(r).toMatchObject({ code: 2 });
    expect(r.err).toContain("add it first");
    await c.run(["domain", "add", "shop", "example.com"]);
    expect(
      (
        await c.run([
          "domain",
          "add",
          "shop",
          "www.example.com",
          "--redirect",
          "to-apex",
        ])
      ).code,
    ).toBe(0);
    expect(c.rows.find((x) => x.host === "www.example.com")?.redirect).toBe(
      "to_apex",
    );
  });

  test.each([
    "db.fockus.dev",
    "deploy.fockus.dev",
    "x-pr-1.preview.fockus.dev",
    "not a host",
  ])("refuses %s", async (host) => {
    const c = cli([]);
    expect((await c.run(["domain", "add", "shop", host])).code).toBe(2);
    expect(c.rows).toEqual([]);
  });
});

describe("kit-deploy domain ls", () => {
  test("status, redirect, expiry and DNS per host; --json has the instructions as data", async () => {
    const c = cli([
      served("shop.fockus.dev", {
        certNotAfter: new Date("2027-02-01T00:00:00Z"),
      }),
      domainRow("www.example.com", {
        redirect: "to_apex",
        lastError: "no A record (expected 178.238.238.7)",
      }),
    ]);
    const r = await c.run(["domain", "ls", "shop"]);
    expect(r.out).toContain(
      "shop.fockus.dev  ready  serves  cert until 2027-02-01  DNS: covered by *.fockus.dev",
    );
    expect(r.out).toContain(
      "www.example.com  pending_dns  → example.com  no cert",
    );
    const j = JSON.parse((await c.run(["domain", "ls", "shop", "--json"])).out);
    expect(j[1]).toMatchObject({
      host: "www.example.com",
      redirectsTo: "example.com",
      dns: { zone: "example.com", records: [{ name: "www", value: VPS_IPV4 }] },
    });
  });

  test("an unknown project fails", async () => {
    expect((await cli([]).run(["domain", "ls", "nope"])).code).toBe(1);
  });
});

describe("kit-deploy domain rm", () => {
  test("removes a host and rewrites the site", async () => {
    const c = cli([served("shop.fockus.dev"), served("shop.example.com")]);
    const r = await c.run(["domain", "rm", "shop", "shop.example.com"]);
    expect(r.code).toBe(0);
    expect(c.rows.map((x) => x.host)).toEqual(["shop.fockus.dev"]);
    expect(c.regenerated).toEqual(["shop"]);
  });

  test("the default host needs --force; never the site's last host", async () => {
    const c = cli([served("shop.fockus.dev"), served("shop.example.com")]);
    expect(
      (await c.run(["domain", "rm", "shop", "shop.fockus.dev"])).code,
    ).toBe(2);
    expect(
      (await c.run(["domain", "rm", "shop", "shop.fockus.dev", "--force"]))
        .code,
    ).toBe(0);
    const last = await c.run(["domain", "rm", "shop", "shop.example.com"]);
    expect(last.code).toBe(1);
    expect(last.err).toContain("last host");
    expect(c.rows.map((x) => x.host)).toEqual(["shop.example.com"]);
  });

  test("a host not pointed yet is not counted as serving", async () => {
    const c = cli([served("shop.example.com"), domainRow("new.example.com")]);
    expect(
      (await c.run(["domain", "rm", "shop", "shop.example.com"])).code,
    ).toBe(1);
    expect(
      (await c.run(["domain", "rm", "shop", "new.example.com"])).code,
    ).toBe(0);
  });

  test("not live: removed, and the next deploy writes the site", async () => {
    const c = cli([served("shop.fockus.dev"), served("a.example.com")], {
      live: [],
    });
    const r = await c.run(["domain", "rm", "shop", "a.example.com"]);
    expect(r.out).toContain("not live");
    expect(c.regenerated).toEqual([]);
  });
});

describe("kit-deploy domain redirect", () => {
  test("sets it and rewrites; a redirect that does not fit the host is refused", async () => {
    const c = cli([served("example.com"), served("www.example.com")]);
    expect(
      (await c.run(["domain", "redirect", "shop", "example.com", "to-www"]))
        .out,
    ).toContain("redirects to www.example.com");
    expect(c.regenerated).toEqual(["shop"]);
    expect(
      (await c.run(["domain", "redirect", "shop", "example.com", "to-apex"]))
        .code,
    ).toBe(2);
    expect(
      (await c.run(["domain", "redirect", "shop", "example.com", "sideways"]))
        .code,
    ).toBe(2);
  });
});

describe("kit-deploy domain check", () => {
  test("one line per change and a summary; exit 1 when something failed", async () => {
    const c = cli([domainRow("shop.example.com")], {
      dns: { "shop.example.com": pointed },
      certs: { "shop.example.com": new Error("boom") },
    });
    const r = await c.run(["domain", "check"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("shop shop.example.com: pending_dns → issuing");
    expect(r.out).toContain("checked 1, changed 1, failed 1");
  });

  test("usage errors", async () => {
    const c = cli([]);
    expect((await c.run(["domain", "check", "--project"])).code).toBe(2);
    expect((await c.run(["domain", "check", "shop"])).code).toBe(2);
    expect((await c.run(["domain"])).code).toBe(2);
  });
});
