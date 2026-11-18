/**
 * D047 (phase 05 security review, M1): a production stopped with Parar stays stopped. Domain
 * changes (panel and CLI) and the domain check's timer rewrite only its Caddy file; only root's
 * explicit `kit-deploy regenerate` (after a reboot) starts it again, and says so.
 */
import { describe, expect, test } from "bun:test";
import { regenerate, rewriteSiteFile } from "../../lib/deploy/switch";
import { checkDomains } from "../../lib/domains/check";
import { stopProduction } from "../../lib/ops/deploy";
import { removeDomain, setDomainRedirect } from "../../lib/ops/domains";
import {
  at,
  deps,
  fakeAgent,
  memoryRepo,
  name,
  ok,
  type Row,
  sha,
} from "./deploy-fakes";
import { domainRow, domainWorld, pointed } from "./domain-fakes";

/** kd_hello live on name("a"), whose state the fake agent keeps like Docker would. */
function world() {
  const rows: Row[] = [
    {
      id: "d1",
      sha: sha("a"),
      status: "live",
      container: name("a"),
      port: 20400,
      createdAt: at(1),
    },
  ];
  const state = new Map([[name("a"), "running"]]);
  const { agent, calls, ops } = fakeAgent({
    "container.list": () =>
      ok([...state].map(([n, s]) => ({ name: n, state: s }))),
    "container.stop": (p) => {
      state.set(p.name as string, "exited");
      return ok({ name: p.name });
    },
    "container.start": (p) => {
      state.set(p.name as string, "running");
      return ok({ name: p.name });
    },
    "cert.status": () => ok(null),
  });
  const repo = memoryRepo(rows, ["kd-hello.fockus.dev", "shop.example.com"]);
  const { d: sw } = deps(agent, repo);
  const domains = domainWorld(
    [
      domainRow("kd-hello.fockus.dev", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
      domainRow("shop.example.com", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
      domainRow("new.example.com", { project: "kd_hello" }),
      domainRow("example.com", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
      domainRow("www.example.com", {
        project: "kd_hello",
        status: "ready",
        dnsOkAt: new Date(),
      }),
    ],
    { dns: { "new.example.com": pointed }, projects: ["kd_hello"] },
  );
  // Wired as cli/main.ts and lib/panel/runtime.ts wire them.
  domains.deps.agent = agent;
  domains.deps.liveProjects = async () =>
    new Set((await repo.liveSites()).map((s) => s.project));
  domains.deps.regenerate = (project) => rewriteSiteFile(sw, project);
  return { sw, repo, agent, calls, ops, state, check: domains.deps };
}

describe("D047: Parar sticks", () => {
  test("stop → domain rm, redirect and the domain check: still stopped, site rewritten", async () => {
    const w = world();
    await stopProduction({ agent: w.agent, repo: w.repo }, "kd_hello");
    expect(w.state.get(name("a"))).toBe("exited");

    expect(
      await removeDomain(w.check, {
        project: "kd_hello",
        host: "shop.example.com",
      }),
    ).toMatchObject({ ok: true, site: "rewritten" });
    expect(
      await setDomainRedirect(w.check, {
        project: "kd_hello",
        host: "www.example.com",
        redirect: "to_apex",
      }),
    ).toMatchObject({ ok: true, site: "rewritten" });
    const writes = () => w.ops().filter((o) => o === "site.write").length;
    expect(writes()).toBe(2);
    // new.example.com now points to the VPS: the timer puts it in the site.
    const report = await checkDomains(w.check, { force: true });
    expect(report.failed).toBe(0);
    expect(writes()).toBe(3);

    expect(w.state.get(name("a"))).toBe("exited");
    expect(w.ops()).not.toContain("container.start");
  });

  test("rewriteSiteFile: the Caddy file only, not even container.list; ok when nothing is live", async () => {
    const w = world();
    await stopProduction({ agent: w.agent, repo: w.repo }, "kd_hello");
    w.calls.length = 0;
    expect(await rewriteSiteFile(w.sw, "kd_hello")).toEqual({ ok: true });
    expect(w.ops()).toEqual(["site.write"]);
    expect(await rewriteSiteFile(w.sw, "other")).toEqual({ ok: true });
  });

  test("root's explicit regenerate still starts it, and says it did", async () => {
    const w = world();
    await stopProduction({ agent: w.agent, repo: w.repo }, "kd_hello");
    expect(await regenerate(w.sw)).toEqual([
      { project: "kd_hello", ok: true, started: true },
    ]);
    expect(w.state.get(name("a"))).toBe("running");
    // Running now: a second one starts nothing.
    expect(await regenerate(w.sw)).toEqual([{ project: "kd_hello", ok: true }]);
  });

  test("regenerate with start: false leaves a stopped container stopped", async () => {
    const w = world();
    await stopProduction({ agent: w.agent, repo: w.repo }, "kd_hello");
    expect(await regenerate(w.sw, { start: false })).toEqual([
      { project: "kd_hello", ok: true },
    ]);
    expect(w.state.get(name("a"))).toBe("exited");
  });
});
