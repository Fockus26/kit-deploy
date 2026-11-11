import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

const scripts = [
  "infra/server-ready.sh",
  "infra/test/server-ready.test.sh",
  "infra/test/in-container.sh",
  "infra/test/fake-certbot.sh",
];

describe("infra/server-ready.sh", () => {
  for (const file of scripts) {
    test(`${file} parses (bash -n)`, () => {
      const r = spawnSync("bash", ["-n", file], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
    });
  }

  // The Docker test takes minutes (it builds Caddy once and installs Postgres): opt-in with
  // KIT_INFRA_DOCKER=1, or run it directly with `bun run test:infra`.
  test.if(process.env.KIT_INFRA_DOCKER === "1")(
    "--test in Docker passes",
    () => {
      const r = spawnSync("bash", ["infra/test/server-ready.test.sh"], {
        encoding: "utf8",
      });
      expect(r.stdout).toContain("ALL PASS");
      expect(r.status).toBe(0);
    },
    1_800_000,
  );
});
