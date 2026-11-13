import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CADDY_PREVIEWS_DIR, PREVIEW_DOMAIN } from "@/lib/core/constants";

const scripts = [
  "infra/install.sh",
  "infra/update.sh",
  "infra/test/install.test.sh",
  "infra/test/install-in-container.sh",
  "infra/test/previews.test.sh",
  "infra/test/previews-in-container.sh",
  "scripts/release.sh",
  "scripts/ship.sh",
];

describe("infra/install.sh and update.sh", () => {
  for (const file of scripts) {
    test(`${file} parses (bash -n)`, () => {
      const r = spawnSync("bash", ["-n", file], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
    });
  }

  test("the agent's unit matches what the CLI and the web expect", () => {
    const unit = readFileSync("infra/kit-agent.service", "utf8");
    expect(unit).toContain(
      "Environment=KIT_AGENT_SOCKET=/run/kit-deploy/agent.sock",
    );
    expect(unit).toContain("Environment=KIT_AGENT_GROUP=kit-deploy");
    // The web container bind-mounts /run/kit-deploy: it must survive an agent restart.
    expect(unit).toContain("RuntimeDirectoryPreserve=yes");
  });

  test("the web: no Docker socket, no host network, published on loopback only", () => {
    const update = readFileSync("infra/update.sh", "utf8");
    expect(update).not.toContain("docker.sock");
    // Host networking would hand it Caddy's admin API on the host's loopback (no auth).
    expect(update).not.toMatch(/^\s*--network host/m);
    expect(update).toContain('-p "127.0.0.1:$WEB_PORT:3000"');
  });

  test("the previews' wildcard site names the platform's preview domain", () => {
    const site = readFileSync("infra/caddy/kit-previews.caddy", "utf8");
    const update = readFileSync("infra/update.sh", "utf8");
    expect(site).toMatch(
      new RegExp(`^\\*\\.${PREVIEW_DOMAIN.replace(/\./g, "\\.")} \\{$`, "m"),
    );
    expect(update).toContain(
      `PREVIEW_DOMAIN="\${PREVIEW_DOMAIN:-${PREVIEW_DOMAIN}}"`,
    );
    // DNS-01 with the token read by Caddy at runtime, never a literal in the file.
    expect(site).toContain("dns cloudflare {env.CLOUDFLARE_API_TOKEN}");
    expect(site).toContain(`import ${CADDY_PREVIEWS_DIR}/*.caddy`);
    expect(site).toMatch(/^\theader >X-Robots-Tag "noindex, nofollow"$/m);
  });

  test("the 404 page is Spanish, noindex and self-contained", () => {
    const page = readFileSync(
      "infra/caddy/pages/preview-missing.html",
      "utf8",
    );
    expect(page).toContain('<html lang="es">');
    expect(page).toContain('content="noindex, nofollow"');
    expect(page).not.toMatch(/<(script|link)\b/);
  });

  test("update.sh never sources or prints the Cloudflare token file", () => {
    const update = readFileSync("infra/update.sh", "utf8");
    expect(update).not.toMatch(/^\s*(\.|source) .*cloudflare\.env/m);
    expect(update).not.toMatch(/echo[^\n]*\$CF_TOKEN/);
  });

  // Builds a release and runs the whole install in Docker (minutes): opt-in, like server-ready.
  test.if(process.env.KIT_INFRA_DOCKER === "1")(
    "install --test in Docker passes",
    () => {
      const r = spawnSync("bash", ["infra/test/install.test.sh"], {
        encoding: "utf8",
      });
      expect(r.stdout).toContain("ALL PASS");
      expect(r.status).toBe(0);
    },
    1_800_000,
  );
});
