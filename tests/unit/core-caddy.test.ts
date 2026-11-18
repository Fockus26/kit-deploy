import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderPreviewSite, renderSite } from "../../lib/core/caddy";
import { UPSTREAM_KEEPALIVE } from "../../lib/core/constants";
import { CoreInputError } from "../../lib/core/validate";

const prod = { project: "kd_hello", env: "production" } as const;

describe("renderSite", () => {
  test("renders the production site file", () => {
    const site = renderSite({
      target: prod,
      hosts: ["hello.fockus.dev"],
      port: 20417,
    });
    expect(site.path).toBe("/etc/caddy/sites/kd_hello.caddy");
    expect(site.content).toBe(
      [
        "# Written by kit-deploy for kd_hello — do not edit by hand: `kit-deploy regenerate` rewrites it.",
        "hello.fockus.dev {",
        "\timport kit_access_log",
        "\treverse_proxy 127.0.0.1:20417 {",
        "\t\ttransport http {",
        "\t\t\tkeepalive 4s",
        "\t\t}",
        "\t}",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("a preview never gets a site block of its own (it would skip the login)", () => {
    expect(() =>
      renderSite({
        target: { project: "kd_hello", env: "preview", pr: 12 },
        hosts: ["kd-hello-pr-12.preview.fockus.dev"],
        port: 21000,
      }),
    ).toThrow(CoreInputError);
  });

  test.each([
    "kd-hello-pr-12.preview.fockus.dev",
    "Preview.Fockus.dev",
    "a.b.preview.fockus.dev",
  ])("a production site cannot take preview host %p", (host) => {
    expect(() =>
      renderSite({ target: prod, hosts: ["ok.dev", host], port: 20000 }),
    ).toThrow(CoreInputError);
  });

  test("a host that only ends like the preview domain is fine", () => {
    expect(
      renderSite({ target: prod, hosts: ["mypreview.fockus.dev"], port: 20000 })
        .content,
    ).toContain("mypreview.fockus.dev {");
  });

  test("several hosts, lowercased and deduplicated, in order", () => {
    const site = renderSite({
      target: prod,
      hosts: ["Hello.fockus.dev", "www.hello.fockus.dev", "hello.fockus.dev"],
      port: 20000,
    });
    expect(site.content).toContain(
      "hello.fockus.dev, www.hello.fockus.dev {\n",
    );
  });

  test("is deterministic", () => {
    const input = { target: prod, hosts: ["hello.fockus.dev"], port: 29999 };
    expect(renderSite(input)).toEqual(renderSite(input));
  });

  test.each([
    ["no hosts", { hosts: [], port: 20000 }],
    ["a host with a brace", { hosts: ["evil.dev {"], port: 20000 }],
    [
      "a host with a newline",
      { hosts: ["a.dev\n\treverse_proxy 0.0.0.0:22"], port: 20000 },
    ],
    ["a host with a space", { hosts: ["a.dev b.dev"], port: 20000 }],
    ["a single-label host", { hosts: ["localhost"], port: 20000 }],
    ["a wildcard host", { hosts: ["*.fockus.dev"], port: 20000 }],
    ["an IP address", { hosts: ["127.0.0.1"], port: 20000 }],
    ["a port below D016's range", { hosts: ["a.dev"], port: 3000 }],
    ["a port above D016's range", { hosts: ["a.dev"], port: 30000 }],
    ["a fractional port", { hosts: ["a.dev"], port: 20000.5 }],
  ])("rejects %s", (_, partial) => {
    expect(() => renderSite({ target: prod, ...partial })).toThrow(
      CoreInputError,
    );
  });

  test.each([
    "../etc",
    "KD",
    "_x",
    "a-b",
    "a b",
    "",
  ])("rejects project name %p", (project) => {
    expect(() =>
      renderSite({
        target: { project, env: "production" },
        hosts: ["a.dev"],
        port: 20000,
      }),
    ).toThrow(CoreInputError);
  });
});

describe("renderPreviewSite", () => {
  test("running: a host matcher and the kit_preview gate to its port", () => {
    const site = renderPreviewSite({
      project: "kd_hello",
      pr: 7,
      state: "running",
      port: 29007,
    });
    expect(site.path).toBe("/etc/caddy/previews/kd_hello-pr-7.caddy");
    expect(site.content).toBe(
      [
        "# Written by kit-deploy for kd_hello-pr-7 (running) — do not edit by hand.",
        "@kd_hello-pr-7 host kd-hello-pr-7.preview.fockus.dev",
        "handle @kd_hello-pr-7 {",
        "\timport kit_preview 127.0.0.1:29007",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("asleep (D017): the same gate, then the page, no proxy and no port", () => {
    const site = renderPreviewSite({
      project: "kd_hello",
      pr: 7,
      state: "asleep",
    });
    expect(site.path).toBe("/etc/caddy/previews/kd_hello-pr-7.caddy");
    expect(site.content).toBe(
      [
        "# Written by kit-deploy for kd_hello-pr-7 (asleep) — do not edit by hand.",
        "@kd_hello-pr-7 host kd-hello-pr-7.preview.fockus.dev",
        "handle @kd_hello-pr-7 {",
        "\timport kit_preview_asleep kd_hello 7",
        "}",
        "",
      ].join("\n"),
    );
    expect(site.content).not.toContain("reverse_proxy");
    expect(site.content).not.toContain("127.0.0.1");
  });

  test("the handle is only ever an import of the gated snippets", () => {
    for (const site of [
      renderPreviewSite({ project: "a", pr: 1, state: "running", port: 20000 }),
      renderPreviewSite({ project: "a", pr: 1, state: "asleep" }),
    ]) {
      expect(site.content).not.toContain("reverse_proxy");
      expect(
        site.content.match(/\timport kit_preview(_asleep)? /g),
      ).toHaveLength(1);
    }
  });

  test("is deterministic", () => {
    const input = {
      project: "kd_hello",
      pr: 3,
      state: "running",
      port: 20001,
    } as const;
    expect(renderPreviewSite(input)).toEqual(renderPreviewSite(input));
  });

  test.each([
    ["a traversal project", { project: "../etc", pr: 1 }],
    ["a project with a slash", { project: "a/b", pr: 1 }],
    ["a project with a brace", { project: "a{", pr: 1 }],
    ["a project with a newline", { project: "a\nb", pr: 1 }],
    ["a project with a space", { project: "a b", pr: 1 }],
    ["an uppercase project", { project: "KD", pr: 1 }],
    ["an empty project", { project: "", pr: 1 }],
    ["PR 0", { project: "a", pr: 0 }],
    ["a negative PR", { project: "a", pr: -1 }],
    ["a fractional PR", { project: "a", pr: 1.5 }],
    ["a PR too big", { project: "a", pr: 1_000_000 }],
  ])("rejects %s", (_, partial) => {
    expect(() => renderPreviewSite({ ...partial, state: "asleep" })).toThrow(
      CoreInputError,
    );
    expect(() =>
      renderPreviewSite({ ...partial, state: "running", port: 20000 }),
    ).toThrow(CoreInputError);
  });

  test("underscores become hyphens in the host; the longest name still fits one label", () => {
    expect(
      renderPreviewSite({ project: "a_", pr: 1, state: "asleep" }).content,
    ).toContain("@a_-pr-1 host a--pr-1.preview.fockus.dev\n");
    // 40 + "-pr-999999" = 50 characters, under DNS's 63 per label.
    expect(() =>
      renderPreviewSite({
        project: "a".repeat(40),
        pr: 999_999,
        state: "asleep",
      }),
    ).not.toThrow();
  });

  test.each([
    3000,
    19999,
    30000,
    20000.5,
    Number.NaN,
  ])("rejects port %p", (port) => {
    expect(() =>
      renderPreviewSite({ project: "a", pr: 1, state: "running", port }),
    ).toThrow(CoreInputError);
  });

  test("rejects an unknown state", () => {
    expect(() =>
      renderPreviewSite({
        project: "a",
        pr: 1,
        state: "public",
      } as unknown as Parameters<typeof renderPreviewSite>[0]),
    ).toThrow(CoreInputError);
  });
});

describe("renderSite with redirects (D028)", () => {
  const base = { target: prod, port: 20417 };

  test("to the apex: www gets its own block with a 308, after the site", () => {
    const site = renderSite({
      ...base,
      hosts: ["example.com", "kd-hello.fockus.dev"],
      redirects: [{ from: "WWW.example.com", to: "example.com" }],
    });
    expect(site.content).toBe(
      [
        "# Written by kit-deploy for kd_hello — do not edit by hand: `kit-deploy regenerate` rewrites it.",
        "example.com, kd-hello.fockus.dev {",
        "\timport kit_access_log",
        "\treverse_proxy 127.0.0.1:20417 {",
        "\t\ttransport http {",
        "\t\t\tkeepalive 4s",
        "\t\t}",
        "\t}",
        "}",
        "",
        "www.example.com {",
        "\tredir https://example.com{uri} 308",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("to www, and the same set in any order renders the same bytes", () => {
    const a = renderSite({
      ...base,
      hosts: ["www.a.com", "www.b.com"],
      redirects: [
        { from: "b.com", to: "www.b.com" },
        { from: "a.com", to: "www.a.com" },
      ],
    });
    const b = renderSite({
      ...base,
      hosts: ["www.a.com", "www.b.com"],
      redirects: [
        { from: "a.com", to: "www.a.com" },
        { from: "b.com", to: "www.b.com" },
      ],
    });
    expect(a.content).toBe(b.content);
    expect(a.content).toContain(
      "\na.com {\n\tredir https://www.a.com{uri} 308\n}\n\nb.com {\n\tredir https://www.b.com{uri} 308\n}\n",
    );
  });

  test("caddy fmt form: tabs only, no trailing spaces, one blank line between blocks", () => {
    const { content } = renderSite({
      ...base,
      hosts: ["example.com"],
      redirects: [{ from: "www.example.com", to: "example.com" }],
    });
    expect(content).not.toMatch(/ +\n|^ +/m);
    expect(content).not.toContain("\n\n\n");
    expect(content.endsWith("}\n")).toBe(true);
  });

  test.each([
    [{ from: "www.example.com", to: "elsewhere.com" }, "does not serve"],
    [{ from: "example.com", to: "example.com" }, "listed twice"],
    [{ from: "x.preview.fockus.dev", to: "example.com" }, "preview"],
    [{ from: "bad host", to: "example.com" }, "invalid hostname"],
  ])("refuses %j", (r, message) => {
    expect(() =>
      renderSite({ ...base, hosts: ["example.com"], redirects: [r] }),
    ).toThrow(message);
  });

  test("the same source twice is refused", () => {
    expect(() =>
      renderSite({
        ...base,
        hosts: ["example.com"],
        redirects: [
          { from: "www.example.com", to: "example.com" },
          { from: "www.example.com", to: "example.com" },
        ],
      }),
    ).toThrow("listed twice");
  });
});

describe("upstream keepalive (Caddy closes idle app sockets before Node's 5 s)", () => {
  test("is below Node's default keepAliveTimeout", () => {
    const m = /^(\d+)s$/.exec(UPSTREAM_KEEPALIVE);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeLessThan(5);
  });

  test("the previews' snippet and the dashboard site use the same value", () => {
    const previews = readFileSync("infra/caddy/kit-previews.caddy", "utf8");
    expect(previews).toContain(`\t\tkeepalive ${UPSTREAM_KEEPALIVE}\n`);
    // Every proxy in the previews file imports it: the exchange, forward_auth and the app.
    expect(previews.match(/^\t*import kit_upstream$/gm)?.length).toBe(3);
    // update.sh writes the dashboard site with printf: its tabs are literal `\t`.
    const update = readFileSync("infra/update.sh", "utf8");
    expect(update).toContain(
      String.raw`\t\t\tkeepalive ${UPSTREAM_KEEPALIVE}\n`,
    );
  });
});
