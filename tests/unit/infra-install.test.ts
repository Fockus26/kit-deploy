import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const scripts = [
  "infra/install.sh",
  "infra/update.sh",
  "infra/test/install.test.sh",
  "infra/test/install-in-container.sh",
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

  test("the web never gets the Docker socket and listens on loopback only", () => {
    const update = readFileSync("infra/update.sh", "utf8");
    expect(update).not.toContain("docker.sock");
    expect(update).toContain("HOSTNAME=127.0.0.1");
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
