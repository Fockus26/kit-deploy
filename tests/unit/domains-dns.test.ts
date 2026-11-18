import { describe, expect, test } from "bun:test";
import { VPS_IPV4 } from "../../lib/core/constants";
import { CoreInputError } from "../../lib/core/validate";
import {
  describeInstructions,
  dnsInstructions,
  dnsProblem,
  redirectTarget,
  zoneOf,
} from "../../lib/domains/dns";
import { siteHosts } from "../../lib/domains/site";

describe("DNS instructions", () => {
  test("an apex: A @ → the VPS, DNS only, and no AAAA", () => {
    expect(dnsInstructions("Example.com")).toEqual({
      host: "example.com",
      zone: "example.com",
      records: [{ type: "A", name: "@", value: VPS_IPV4, proxied: false }],
      mustNotExist: ["AAAA"],
      coveredBy: null,
      redirectsTo: null,
    });
  });

  test("a subdomain: A <labels> in its zone, also under a .com.mx", () => {
    expect(dnsInstructions("app.eu.example.com").records[0]?.name).toBe(
      "app.eu",
    );
    const mx = dnsInstructions("www.tienda.com.mx", "to_apex");
    expect(mx).toMatchObject({
      zone: "tienda.com.mx",
      records: [{ name: "www" }],
      redirectsTo: "tienda.com.mx",
    });
    expect(describeInstructions(mx)).toBe(
      `A www ${VPS_IPV4} (DNS only) in tienda.com.mx; no AAAA record`,
    );
  });

  test("<project>.fockus.dev is covered by the wildcard: nothing to create", () => {
    const i = dnsInstructions("kd-hello.fockus.dev");
    expect(i).toMatchObject({ records: [], coveredBy: "*.fockus.dev" });
    expect(describeInstructions(i)).toBe("covered by *.fockus.dev");
    // Two levels down is not under the one-level wildcard.
    expect(dnsInstructions("a.b.fockus.dev").coveredBy).toBeNull();
  });

  test("zones", () => {
    expect(zoneOf("www.example.co.uk")).toBe("example.co.uk");
    expect(zoneOf("example.com")).toBe("example.com");
  });
});

describe("redirect targets", () => {
  test("to_apex on www.<apex>, to_www on an apex", () => {
    expect(redirectTarget("www.example.com", "to_apex")).toBe("example.com");
    expect(redirectTarget("example.com", "to_www")).toBe("www.example.com");
    expect(redirectTarget("example.com", "none")).toBeNull();
  });

  test.each([
    ["example.com", "to_apex"],
    ["app.example.com", "to_apex"],
    ["www.app.example.com", "to_apex"],
    ["www.example.com", "to_www"],
    ["app.example.com", "to_www"],
  ] as const)("%s %s is refused", (host, r) => {
    expect(() => redirectTarget(host, r)).toThrow(CoreInputError);
  });
});

describe("pointed at the VPS", () => {
  test("every A is the VPS and there is no AAAA", () => {
    expect(dnsProblem({ a: [VPS_IPV4], aaaa: [] })).toBeNull();
  });

  test.each([
    [{ a: [], aaaa: [] }, "no A record"],
    [{ a: ["1.2.3.4"], aaaa: [] }, "A resolves to 1.2.3.4"],
    [{ a: [VPS_IPV4, "1.2.3.4"], aaaa: [] }, "A resolves to 1.2.3.4"],
    [{ a: [VPS_IPV4], aaaa: ["2606:4700::1"] }, "AAAA 2606:4700::1"],
  ])("%j is not", (r, message) => {
    expect(dnsProblem(r)).toContain(message);
  });
});

describe("siteHosts", () => {
  const at = new Date("2026-11-17T10:00:00Z");
  const d = (
    host: string,
    pointed: boolean,
    redirect: "none" | "to_apex" | "to_www" = "none",
  ) => ({ host, redirect, dnsOkAt: pointed ? at : null });

  test("only hosts whose DNS pointed, plus the default host always", () => {
    expect(
      siteHosts("kd_hello", [
        d("kd-hello.fockus.dev", false),
        d("shop.example.com", true),
        d("later.example.com", false),
      ]),
    ).toEqual({
      hosts: ["kd-hello.fockus.dev", "shop.example.com"],
      redirects: [],
    });
  });

  test("a redirect to a served sibling; until the sibling points, it serves the site", () => {
    const rows = [
      d("example.com", true),
      d("www.example.com", true, "to_apex"),
    ];
    expect(siteHosts("shop", rows)).toEqual({
      hosts: ["example.com"],
      redirects: [{ from: "www.example.com", to: "example.com" }],
    });
    expect(
      siteHosts("shop", [
        d("example.com", false),
        d("www.example.com", true, "to_apex"),
      ]),
    ).toEqual({ hosts: ["www.example.com"], redirects: [] });
  });

  test("a redirect loop serves both instead", () => {
    expect(
      siteHosts("shop", [
        d("example.com", true, "to_www"),
        d("www.example.com", true, "to_apex"),
      ]),
    ).toEqual({ hosts: ["example.com", "www.example.com"], redirects: [] });
  });
});
