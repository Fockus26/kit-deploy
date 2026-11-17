import { describe, expect, test } from "bun:test";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { handleDeploy } from "../../lib/api/deploy";
import type { AdminStore } from "../../lib/db/admin";
import type { DeploymentRef, DeployStore } from "../../lib/db/store";
import { GitHubError, type GitHubRequest } from "../../lib/deploy/github";
import { dispatchRebuild } from "../../lib/deploy/rebuild";
import { generateDeployToken } from "../../lib/tokens";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const { token: TOKEN, hash: HASH } = generateDeployToken();

function fakeGitHub(status = 204) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const request: GitHubRequest = async (method, path, expect, body) => {
    calls.push({ method, path, body });
    if (!expect.includes(status))
      throw new GitHubError(`github answered ${status}`);
    return new Response(null, { status });
  };
  return { request, calls };
}

describe("dispatchRebuild", () => {
  test("runs deploy-vps.yml on the production branch with rebuild", async () => {
    const g = fakeGitHub();
    await dispatchRebuild(g.request, "Fockus26/kd-hello", "main");
    expect(g.calls).toEqual([
      {
        method: "POST",
        path: "/repos/Fockus26/kd-hello/actions/workflows/deploy-vps.yml/dispatches",
        body: { ref: "main", inputs: { rebuild: "true" } },
      },
    ]);
  });

  test("refuses a bad repo or branch before calling GitHub", async () => {
    const g = fakeGitHub();
    await expect(dispatchRebuild(g.request, "a/b/c", "main")).rejects.toThrow();
    await expect(dispatchRebuild(g.request, "a/b", "x..y")).rejects.toThrow();
    await expect(dispatchRebuild(g.request, "a/b", "a b")).rejects.toThrow();
    expect(g.calls).toEqual([]);
  });
});

describe("kit-deploy rebuild", () => {
  const agent: AgentClient = {
    async call() {
      throw new Error("not used");
    },
  };
  const admin = {
    async projectRepo(p: string) {
      return p === "kd_hello" ? "Fockus26/kd-hello" : null;
    },
    async productionBranch(p: string) {
      return p === "kd_hello" ? "main" : null;
    },
  } as unknown as AdminStore;

  test("starts the Action", async () => {
    const g = fakeGitHub();
    const r = await runCli(["rebuild", "kd_hello"], agent, {
      admin: () => admin,
      github: () => g.request,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "rebuild of kd_hello started on Fockus26/kd-hello@main",
    );
    expect(g.calls).toHaveLength(1);
  });

  test("without the token (not root): says how", async () => {
    const r = await runCli(["rebuild", "kd_hello"], agent, {
      admin: () => admin,
      github: () => null,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("ssh kit-vps kit-deploy rebuild kd_hello");
  });

  test("a token without Actions: write gets the hint", async () => {
    const g = fakeGitHub(403);
    const r = await runCli(["rebuild", "kd_hello"], agent, {
      admin: () => admin,
      github: () => g.request,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("Actions: Read and write");
  });

  test("usage and unknown project", async () => {
    const ctx = { admin: () => admin, github: () => fakeGitHub().request };
    expect((await runCli(["rebuild"], agent, ctx)).code).toBe(2);
    expect((await runCli(["rebuild", "Bad"], agent, ctx)).code).toBe(2);
    expect((await runCli(["rebuild", "nope"], agent, ctx)).err).toBe(
      "no project nope\n",
    );
  });
});

describe("POST /api/v1/deploy with rebuild", () => {
  function setup(existing: DeploymentRef | null) {
    const queued: string[] = [];
    const redeploys: string[] = [];
    const store = {
      async findTokenProject(hash: string) {
        return hash === HASH
          ? {
              tokenId: "t1",
              project: {
                id: "p1",
                name: "kd_hello",
                repo: "Fockus26/kd-hello",
              },
            }
          : null;
      },
      async touchToken() {},
      async findOpenDeployment() {
        return existing;
      },
      async createDeployment() {
        return { id: "new", status: "queued", image: "x" };
      },
    } as unknown as DeployStore;
    const call = (body: unknown) =>
      handleDeploy(
        new Request("https://deploy.fockus.dev/api/v1/deploy", {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify(body),
        }),
        store,
        {
          onQueued: (id) => queued.push(id),
          redeploy: async (id) => {
            redeploys.push(id);
            return { id: "gen2" };
          },
        },
      );
    return { call, queued, redeploys };
  }
  const live: DeploymentRef = {
    id: "live",
    status: "live",
    image: `ghcr.io/fockus26/kd-hello:${SHA}`,
  };

  test("the live commit, rebuilt: its next generation is queued and switched", async () => {
    const s = setup(live);
    const res = await s.call({ sha: SHA, rebuild: true });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({
      deployment: { id: "gen2", status: "queued" },
      rebuilt: true,
    });
    expect(s.redeploys).toEqual(["p1"]);
    expect(s.queued).toEqual(["p1"]);
  });

  test("without rebuild, the live commit is still 'already live'", async () => {
    const s = setup(live);
    const res = await s.call({ sha: SHA });
    expect(res.status).toBe(200);
    expect(s.redeploys).toEqual([]);
  });

  test("a rebuild of a commit that is not live deploys it as usual", async () => {
    const s = setup(null);
    expect((await s.call({ sha: SHA, rebuild: true })).status).toBe(202);
    expect(s.redeploys).toEqual([]);
  });

  test("a rebuild is production's only, and must be exactly true", async () => {
    const s = setup(live);
    expect((await s.call({ sha: SHA, pr: 7, rebuild: true })).status).toBe(400);
    expect((await s.call({ sha: SHA, rebuild: false })).status).toBe(400);
    expect((await s.call({ sha: SHA, rebuild: "yes" })).status).toBe(400);
    expect(s.redeploys).toEqual([]);
  });
});
