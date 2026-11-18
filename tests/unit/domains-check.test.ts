import { describe, expect, test } from "bun:test";
import { DOMAIN_ERROR_MAX } from "../../lib/db/schema";
import {
  checkDomains,
  EXPIRY_WARN_MS,
  ISSUE_TIMEOUT_MS,
  READY_RECHECK_MS,
} from "../../lib/domains/check";
import { domainRow, domainWorld, MIN, pointed, T0 } from "./domain-fakes";

const inDays = (d: number) => new Date(T0 + d * 24 * 60 * MIN).toISOString();

describe("domain check", () => {
  test("pending_dns stays while DNS points elsewhere, with the reason; nothing is rewritten", async () => {
    const w = domainWorld([domainRow("shop.example.com")], {
      dns: { "shop.example.com": { a: ["1.2.3.4"], aaaa: [] } },
    });
    const r = await checkDomains(w.deps);
    expect(w.rows[0]).toMatchObject({
      status: "pending_dns",
      dnsOkAt: null,
      lastError: "A resolves to 1.2.3.4, not 178.238.238.7",
      dnsCheckedAt: new Date(T0),
    });
    expect(w.regenerated).toEqual([]);
    expect(w.certCalls).toEqual([]);
    expect(r).toMatchObject({ checked: 1, failed: 0 });
    expect(r.changed).toEqual([
      {
        project: "shop",
        host: "shop.example.com",
        from: "pending_dns",
        to: "pending_dns",
        note: "A resolves to 1.2.3.4, not 178.238.238.7",
      },
    ]);
  });

  test("DNS points → issuing, the site is rewritten once per project, then the certificate makes it ready", async () => {
    const w = domainWorld(
      [domainRow("shop.example.com"), domainRow("www.shop.example.com")],
      {
        dns: { "shop.example.com": pointed, "www.shop.example.com": pointed },
      },
    );
    await checkDomains(w.deps);
    expect(w.regenerated).toEqual(["shop"]);
    expect(w.rows.map((r) => r.status)).toEqual(["issuing", "issuing"]);
    expect(w.rows[0]?.dnsOkAt).toEqual(new Date(T0));

    // Caddy got the certificate by the next minute.
    const certs: Record<string, string> = {
      "shop.example.com": inDays(90),
      "www.shop.example.com": inDays(90),
    };
    const w2 = domainWorld(w.rows, {
      dns: { "shop.example.com": pointed, "www.shop.example.com": pointed },
      certs,
    });
    w2.advance(MIN);
    await checkDomains(w2.deps);
    expect(w2.regenerated).toEqual([]);
    expect(w2.rows[0]).toMatchObject({
      status: "ready",
      lastError: null,
      certNotAfter: new Date(inDays(90)),
    });
  });

  test("a project not live yet: issuing with a note, no rewrite and no certificate asked", async () => {
    const w = domainWorld([domainRow("shop.example.com")], {
      dns: { "shop.example.com": pointed },
      live: [],
    });
    await checkDomains(w.deps);
    expect(w.regenerated).toEqual([]);
    expect(w.certCalls).toEqual([]);
    expect(w.rows[0]).toMatchObject({ status: "issuing" });
    expect(w.rows[0]?.lastError).toContain("not deployed yet");
  });

  test("a failed rewrite puts the host back to pending_dns, so the next run tries again", async () => {
    const w = domainWorld([domainRow("shop.example.com")], {
      dns: { "shop.example.com": pointed },
      regenerate: () => ({ ok: false, error: "caddy validate failed" }),
    });
    const r = await checkDomains(w.deps);
    expect(r.failed).toBe(1);
    expect(w.rows[0]).toMatchObject({
      status: "pending_dns",
      dnsOkAt: null,
      lastError: "site file not rewritten: caddy validate failed",
    });
    expect(w.certCalls).toEqual([]);
  });

  test("no certificate after the timeout → error pointing at Caddy's journal", async () => {
    const w = domainWorld([
      domainRow("shop.example.com", {
        status: "issuing",
        dnsOkAt: new Date(T0 - ISSUE_TIMEOUT_MS - MIN),
      }),
    ]);
    await checkDomains(w.deps);
    expect(w.rows[0]?.status).toBe("error");
    expect(w.rows[0]?.lastError).toContain("journalctl -u caddy");
  });

  test("still within the timeout: issuing, no error", async () => {
    const w = domainWorld(
      [
        domainRow("shop.example.com", {
          status: "issuing",
          dnsOkAt: new Date(T0 - 5 * MIN),
        }),
      ],
      { dns: { "shop.example.com": pointed } },
    );
    await checkDomains(w.deps);
    expect(w.rows[0]).toMatchObject({ status: "issuing", lastError: null });
  });

  test("ready hosts are looked at hourly; expiring or expired certificates are errors", async () => {
    const fresh = domainRow("fresh.example.com", {
      status: "ready",
      dnsOkAt: new Date(T0 - 100 * MIN),
      dnsCheckedAt: new Date(T0 - 10 * MIN),
    });
    const soon = domainRow("soon.example.com", {
      status: "ready",
      dnsOkAt: new Date(T0 - 100 * MIN),
      dnsCheckedAt: new Date(T0 - READY_RECHECK_MS),
    });
    const gone = domainRow("gone.example.com", {
      status: "ready",
      dnsOkAt: new Date(T0 - 100 * MIN),
      dnsCheckedAt: null,
    });
    const w = domainWorld([fresh, soon, gone], {
      dns: {
        "soon.example.com": pointed,
        "gone.example.com": pointed,
      },
      certs: {
        "soon.example.com": new Date(T0 + EXPIRY_WARN_MS - MIN).toISOString(),
        "gone.example.com": inDays(-1),
      },
    });
    const r = await checkDomains(w.deps);
    expect(r.checked).toBe(2);
    expect(w.certCalls.sort()).toEqual([
      "gone.example.com",
      "soon.example.com",
    ]);
    const by = (h: string) => w.rows.find((x) => x.host === h);
    expect(by("fresh.example.com")?.status).toBe("ready");
    expect(by("soon.example.com")).toMatchObject({ status: "error" });
    expect(by("soon.example.com")?.lastError).toContain("not renewed");
    expect(by("gone.example.com")?.lastError).toContain("expired on");
  });

  test("--project: all of its hosts now, ready ones included", async () => {
    const w = domainWorld(
      [
        domainRow("fresh.example.com", {
          status: "ready",
          dnsOkAt: new Date(T0 - 100 * MIN),
          dnsCheckedAt: new Date(T0 - MIN),
        }),
        domainRow("other.example.org", { project: "blog" }),
      ],
      {
        dns: { "fresh.example.com": pointed },
        certs: { "fresh.example.com": inDays(80) },
      },
    );
    const r = await checkDomains(w.deps, { project: "shop", force: true });
    expect(r.checked).toBe(1);
    expect(w.certCalls).toEqual(["fresh.example.com"]);
  });

  test("a served host whose DNS moved away is an error, and stays in the site", async () => {
    const w = domainWorld(
      [
        domainRow("shop.example.com", {
          status: "ready",
          dnsOkAt: new Date(T0 - 100 * MIN),
        }),
      ],
      {
        dns: { "shop.example.com": { a: ["9.9.9.9"], aaaa: [] } },
        certs: { "shop.example.com": inDays(60) },
      },
    );
    await checkDomains(w.deps);
    expect(w.rows[0]).toMatchObject({
      status: "error",
      dnsOkAt: new Date(T0 - 100 * MIN),
    });
    expect(w.rows[0]?.lastError).toContain("no longer points");
    expect(w.regenerated).toEqual([]);
  });

  test("one host failing never stops the others", async () => {
    const w = domainWorld(
      [
        domainRow("a.example.com", {
          status: "issuing",
          dnsOkAt: new Date(T0 - MIN),
        }),
        domainRow("b.example.com", {
          status: "issuing",
          dnsOkAt: new Date(T0 - MIN),
        }),
        domainRow("c.example.com"),
      ],
      {
        dns: {
          "a.example.com": pointed,
          "b.example.com": pointed,
          "c.example.com": new Error("queryA ETIMEOUT c.example.com"),
        },
        certs: {
          "a.example.com": new Error("socket closed"),
          "b.example.com": inDays(90),
        },
      },
    );
    const r = await checkDomains(w.deps);
    expect(r.failed).toBe(1);
    const by = (h: string) => w.rows.find((x) => x.host === h);
    expect(by("a.example.com")?.lastError).toContain(
      "kit-agent: command_failed",
    );
    expect(by("b.example.com")?.status).toBe("ready");
    expect(by("c.example.com")).toMatchObject({ status: "pending_dns" });
    expect(by("c.example.com")?.lastError).toContain("DNS lookup failed");
  });

  test("a long error is cut to the column's bound", async () => {
    const w = domainWorld([domainRow("shop.example.com")], {
      dns: { "shop.example.com": new Error("x".repeat(1000)) },
    });
    await checkDomains(w.deps);
    expect(w.rows[0]?.lastError?.length).toBeLessThanOrEqual(DOMAIN_ERROR_MAX);
  });

  test("a redirect waiting for its sibling says so", async () => {
    const w = domainWorld(
      [
        domainRow("example.com"),
        domainRow("www.example.com", { redirect: "to_apex" }),
      ],
      { dns: { "www.example.com": pointed } },
    );
    await checkDomains(w.deps);
    const www = w.rows.find((x) => x.host === "www.example.com");
    expect(www?.status).toBe("issuing");
    expect(www?.lastError).toContain("until example.com points");
  });
});
