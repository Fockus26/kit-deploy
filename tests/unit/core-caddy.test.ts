import { describe, expect, test } from "bun:test";
import { renderSite } from "../../lib/core/caddy";
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
        "\treverse_proxy 127.0.0.1:20417",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("a preview gets its own file", () => {
    const site = renderSite({
      target: { project: "kd_hello", env: "preview", pr: 12 },
      hosts: ["kd-hello-pr-12.preview.fockus.dev"],
      port: 21000,
    });
    expect(site.path).toBe("/etc/caddy/sites/kd_hello-pr-12.caddy");
    expect(site.content).toContain("kd-hello-pr-12.preview.fockus.dev {");
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
