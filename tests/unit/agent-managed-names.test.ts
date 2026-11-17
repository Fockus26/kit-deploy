import { expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { Agent, isPreviewsName } from "../../agent/ops";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { fakeDeps } from "./agent-fakes";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";

// Security review U5: `shop_preview` would collide with `shop`'s previews database.
test("a project named *_preview gets no database, and none is created for it", async () => {
  const f = fakeDeps({ "docker run": () => ({ stdout: "abc\n" }) });
  f.files.set("/etc/kit-deploy/images/shop_preview", "ghcr.io/cesar/shop\n");
  const agent = new Agent(f.deps);
  const send = (op: string, params: unknown) =>
    dispatch(agent, f.deps, JSON.stringify({ id: "1", op, params }));
  expect(
    await send("container.run", {
      target: { project: "shop_preview", env: "production" },
      sha: SHA,
      image: `ghcr.io/cesar/shop:${SHA}`,
      port: 20417,
      memoryMb: 512,
    }),
  ).toMatchObject({ ok: true });
  expect(await send("db.create", { project: "shop_preview" })).toMatchObject({
    ok: false,
    error: { code: "bad_request" },
  });
  expect(f.calls.filter((c) => c[0] === "kit-db")).toEqual([]);
  expect(isPreviewsName("shop")).toBe(false);
});

test("project add refuses a *_preview name", async () => {
  const client: AgentClient = {
    async call() {
      throw new Error("not used");
    },
  };
  const r = await runCli(
    ["project", "add", "shop_preview", "cesar/shop"],
    client,
  );
  expect(r.code).toBe(2);
  expect(r.err).toContain("_preview");
});
