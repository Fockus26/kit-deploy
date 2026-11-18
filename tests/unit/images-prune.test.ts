import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dispatch } from "../../agent/dispatch";
import { Agent } from "../../agent/ops";
import { Request, type Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { IMAGE_PINS_DIR } from "../../lib/core/image-pin";
import { fakeDeps } from "./agent-fakes";

const PIN = "ghcr.io/fockus26/shop";
const id = (n: number) => `sha256:${String(n).padStart(64, "0")}`;
/** Seven images of shop, newest first: tag t7 (day 7) … t1 (day 1). */
const LS = [7, 6, 5, 4, 3, 2, 1]
  .map((d) => `${id(d)}\t${PIN}\tt${d}\t2026-11-0${d} 03:00:00 +0000 UTC`)
  .join("\n");

function setup(opts: { ps?: string; rmFails?: string } = {}) {
  const f = fakeDeps({
    "docker ps -a": () => ({ stdout: opts.ps ?? "" }),
    [`docker image ls ${PIN}`]: () => ({ stdout: LS }),
    "docker image ls ghcr.io/fockus26/blog": () => ({ stdout: "" }),
    "docker image rm": (argv) =>
      argv[3] === opts.rmFails
        ? {
            code: 1,
            stderr:
              "Error response from daemon: conflict: unable to remove repository reference",
          }
        : {},
  });
  f.files.set(`${IMAGE_PINS_DIR}/shop`, `${PIN}\n`);
  f.files.set(`${IMAGE_PINS_DIR}/blog`, "ghcr.io/fockus26/blog\n");
  f.files.set(`${IMAGE_PINS_DIR}/junk.tmp`, "ghcr.io/evil/x\n");
  const agent = new Agent(f.deps);
  const client: AgentClient = {
    call: (op, params) =>
      dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "1", op, params }),
      ) as Promise<Response>,
  };
  const removed = () => f.calls.filter((c) => c[2] === "rm").map((c) => c[3]);
  return { ...f, client, removed };
}

describe("images.prune", () => {
  test("keeps the 5 newest per pinned repository, removes the rest without -f", async () => {
    const s = setup();
    const r = (await s.client.call("images.prune", { keep: 5 })) as Response;
    expect(r.ok && r.result).toEqual({
      removed: [`${PIN}:t2`, `${PIN}:t1`],
      kept: 5,
      failed: [],
    });
    expect(s.removed()).toEqual([`${PIN}:t2`, `${PIN}:t1`]);
    expect(s.calls.some((c) => c.includes("-f") || c.includes("--force"))).toBe(
      false,
    );
    // Only pinned repositories: the bad file name is not read as a pin.
    expect(s.calls.some((c) => c.join(" ").includes("ghcr.io/evil"))).toBe(
      false,
    );
  });

  test("an image a container uses is kept, by tag or by id (a stopped rollback target too)", async () => {
    const s = setup({
      ps: `${PIN}:t1\t${id(1)}\nsomething@sha256:abc\t${id(2)}\n`,
    });
    const r = (await s.client.call("images.prune", { keep: 5 })) as Response;
    expect(r.ok && r.result).toEqual({ removed: [], kept: 7, failed: [] });
  });

  test("dry run removes nothing; Docker's refusal is a warning, not an error", async () => {
    const dry = setup();
    const r = (await dry.client.call("images.prune", {
      keep: 5,
      dryRun: true,
    })) as Response;
    expect(r.ok && (r.result as { removed: string[] }).removed).toHaveLength(2);
    expect(dry.removed()).toEqual([]);
    const s = setup({ rmFails: `${PIN}:t1` });
    const out = await runCli(["images", "prune"], s.client, {});
    expect(out.code).toBe(0);
    expect(out.out).toBe(`removed ${PIN}:t2\nremoved 1, kept 5\n`);
    expect(out.err).toContain(
      `warning: ${PIN}:t1: Error response from daemon: conflict`,
    );
  });

  test("schema and CLI bounds", async () => {
    expect(
      Request.safeParse({ id: "1", op: "images.prune", params: { keep: 0 } })
        .success,
    ).toBe(false);
    expect(
      Request.safeParse({ id: "1", op: "images.prune", params: { keep: 5 } })
        .success,
    ).toBe(true);
    expect(
      (await runCli(["images", "prune", "--keep", "0"], setup().client, {}))
        .code,
    ).toBe(2);
    expect((await runCli(["images"], setup().client, {})).code).toBe(2);
  });
});

describe("kit-deploy-images-prune.{service,timer}", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  test("nightly after the sweep, shipped and installed", () => {
    expect(read("infra/kit-deploy-images-prune.timer")).toMatch(
      /^OnCalendar=\*-\*-\* 04:45:00$/m,
    );
    expect(read("infra/kit-deploy-images-prune.service")).toMatch(
      /^ExecStart=\/usr\/local\/bin\/kit-deploy images prune$/m,
    );
    for (const u of [
      "kit-deploy-images-prune.service",
      "kit-deploy-images-prune.timer",
    ])
      expect(read("scripts/release.sh")).toContain(`infra/${u}`);
    expect(read("infra/update.sh")).toContain(
      "install_timer kit-deploy-images-prune",
    );
  });
});
