import { describe, expect, test } from "bun:test";
import {
  handleClosePreview,
  handleDeploy,
  imageFor,
  MAX_BODY_BYTES,
} from "../../lib/api/deploy";
import type {
  DeploymentRef,
  DeployStore,
  NewDeployment,
} from "../../lib/db/store";
import { bearerToken, generateDeployToken, hashToken } from "../../lib/tokens";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const { token: TOKEN, hash: HASH } = generateDeployToken();
/** Another project's token (kd_other): it only ever reaches kd_other's deployments. */
const { token: OTHER, hash: OTHER_HASH } = generateDeployToken();

function memoryStore(opts: { revoked?: boolean; fail?: boolean } = {}) {
  const created: NewDeployment[] = [];
  const touched: string[] = [];
  const open = new Map<string, DeploymentRef>();
  const store: DeployStore = {
    async findTokenProject(hash) {
      if (opts.fail) throw new Error("connection refused");
      if (opts.revoked) return null;
      if (hash === HASH)
        return {
          tokenId: "t1",
          project: { id: "p1", name: "kd_hello", repo: "Fockus26/KD-Hello" },
        };
      if (hash === OTHER_HASH)
        return {
          tokenId: "t2",
          project: { id: "p2", name: "kd_other", repo: "Fockus26/kd-other" },
        };
      return null;
    },
    async touchToken(id) {
      touched.push(id);
    },
    async findOpenDeployment(projectId, scope, sha) {
      return open.get(`${projectId}:${scope.pr ?? "prod"}:${sha}`) ?? null;
    },
    async createDeployment(d) {
      created.push(d);
      const ref: DeploymentRef = {
        id: `d${created.length}`,
        status: "queued",
        image: d.image,
      };
      const scope = d.environment === "preview" ? d.pr : "prod";
      open.set(`${d.projectId}:${scope}:${d.sha}`, ref);
      return ref;
    },
  };
  return { store, created, touched };
}

const post = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  new Request("http://localhost/api/v1/deploy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("tokens", () => {
  test("format, uniqueness and hash", () => {
    const a = generateDeployToken();
    const b = generateDeployToken();
    expect(a.token).toMatch(/^kdt_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test.each([
    [null],
    [""],
    ["Basic abc"],
    ["Bearer"],
    ["Bearer kdt_short"],
    [`bearer ${TOKEN}`],
    [`Bearer ${TOKEN} extra`],
  ])("bearerToken rejects %p", (h) => {
    expect(bearerToken(h)).toBeNull();
  });
});

describe("POST /api/v1/deploy", () => {
  test("starts the switch for a new deployment, and again for a retry still queued", async () => {
    const { store } = memoryStore();
    const kicked: string[] = [];
    const hooks = { onQueued: (p: string) => kicked.push(p) };
    expect((await handleDeploy(post({ sha: SHA }), store, hooks)).status).toBe(
      202,
    );
    expect((await handleDeploy(post({ sha: SHA }), store, hooks)).status).toBe(
      200,
    );
    expect(kicked).toEqual(["p1", "p1"]);
  });

  test("a retry of a commit already live does not start a switch", async () => {
    const { store } = memoryStore();
    store.findOpenDeployment = async () => ({
      id: "d1",
      status: "live",
      image: "x",
    });
    const kicked: string[] = [];
    await handleDeploy(post({ sha: SHA }), store, {
      onQueued: (p) => kicked.push(p),
    });
    expect(kicked).toEqual([]);
  });

  test("an unauthorized request never starts a switch", async () => {
    const { store } = memoryStore();
    const kicked: string[] = [];
    await handleDeploy(post({ sha: SHA }, null), store, {
      onQueued: (p) => kicked.push(p),
    });
    expect(kicked).toEqual([]);
  });

  test("queues a production deployment of the token's own repo", async () => {
    const { store, created, touched } = memoryStore();
    const res = await handleDeploy(post({ sha: SHA }), store);
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      deployment: {
        id: "d1",
        status: "queued",
        image: `ghcr.io/fockus26/kd-hello:${SHA}`,
      },
    });
    expect(created).toEqual([
      {
        projectId: "p1",
        environment: "production",
        sha: SHA,
        image: `ghcr.io/fockus26/kd-hello:${SHA}`,
      },
    ]);
    expect(touched).toEqual(["t1"]);
  });

  test("a retry of the same commit gets the same deployment, 200", async () => {
    const { store, created } = memoryStore();
    await handleDeploy(post({ sha: SHA }), store);
    const again = await handleDeploy(post({ sha: SHA }), store);
    expect(again.status).toBe(200);
    expect(
      ((await again.json()) as { deployment: { id: string } }).deployment.id,
    ).toBe("d1");
    expect(created).toHaveLength(1);
  });

  test.each([
    ["no header", null],
    ["a malformed header", "Bearer nope"],
    ["an unknown token", `Bearer ${generateDeployToken().token}`],
  ])("401 with %s", async (_, auth) => {
    const { store, created } = memoryStore();
    const res = await handleDeploy(post({ sha: SHA }, auth), store);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(created).toEqual([]);
  });

  test("a concurrent twin created between lookup and insert: 200 with the twin", async () => {
    const { store, created } = memoryStore();
    const twin: DeploymentRef = { id: "twin", status: "queued", image: "x" };
    let lookups = 0;
    store.findOpenDeployment = async () => (lookups++ === 0 ? null : twin);
    store.createDeployment = async (d) => {
      created.push(d);
      return null;
    };
    const res = await handleDeploy(post({ sha: SHA }), store);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deployment: twin });
  });

  test("401 with a revoked token", async () => {
    const { store } = memoryStore({ revoked: true });
    expect((await handleDeploy(post({ sha: SHA }), store)).status).toBe(401);
  });

  test.each([
    ["not JSON", "{nope"],
    ["a short sha", { sha: "abc1234" }],
    ["an uppercase sha", { sha: SHA.toUpperCase() }],
    ["an image chosen by the caller", { sha: SHA, image: "evil.dev/x:1" }],
    ["no sha", {}],
  ])("400 with %s, nothing created", async (_, body) => {
    const { store, created } = memoryStore();
    expect((await handleDeploy(post(body), store)).status).toBe(400);
    expect(created).toEqual([]);
  });

  test("413 over the size limit", async () => {
    const { store } = memoryStore();
    const res = await handleDeploy(
      post({ sha: SHA, pad: "x".repeat(MAX_BODY_BYTES) }),
      store,
    );
    expect(res.status).toBe(413);
  });

  test("a database error is a 500 that leaks nothing", async () => {
    const { store } = memoryStore({ fail: true });
    const res = await handleDeploy(post({ sha: SHA }), store);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("connection refused");
    expect(text).not.toContain(TOKEN);
  });

  test("imageFor lowercases the repo and validates the result", () => {
    expect(imageFor("Fockus26/KD-Hello", SHA)).toBe(
      `ghcr.io/fockus26/kd-hello:${SHA}`,
    );
    expect(() => imageFor("a b/c", SHA)).toThrow();
  });
});

describe("POST /api/v1/deploy with a PR (preview)", () => {
  test("queues a preview of that PR, with its URL, and starts the switch", async () => {
    const { store, created } = memoryStore();
    const kicked: string[] = [];
    const res = await handleDeploy(post({ sha: SHA, pr: 7 }), store, {
      onQueued: (p) => kicked.push(p),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      deployment: {
        id: "d1",
        status: "queued",
        image: `ghcr.io/fockus26/kd-hello:${SHA}`,
      },
      preview: { pr: 7, url: "https://kd-hello-pr-7.preview.fockus.dev" },
    });
    expect(created).toEqual([
      {
        projectId: "p1",
        environment: "preview",
        pr: 7,
        sha: SHA,
        image: `ghcr.io/fockus26/kd-hello:${SHA}`,
      },
    ]);
    expect(kicked).toEqual(["p1"]);
  });

  test("the same commit in production, PR 7 and PR 8 are three deployments; a retry is not", async () => {
    const { store, created } = memoryStore();
    expect((await handleDeploy(post({ sha: SHA }), store)).status).toBe(202);
    expect((await handleDeploy(post({ sha: SHA, pr: 7 }), store)).status).toBe(
      202,
    );
    expect((await handleDeploy(post({ sha: SHA, pr: 8 }), store)).status).toBe(
      202,
    );
    const retry = await handleDeploy(post({ sha: SHA, pr: 7 }), store);
    expect(retry.status).toBe(200);
    expect(
      ((await retry.json()) as { deployment: { id: string } }).deployment.id,
    ).toBe("d2");
    expect(created.map((d) => d.environment)).toEqual([
      "production",
      "preview",
      "preview",
    ]);
  });

  test.each([
    ["0", 0],
    ["negative", -3],
    ["a fraction", 1.5],
    ["a string", "7"],
    ["too big", 1_000_000],
    ["null", null],
    ["an object", { n: 7 }],
  ])("400 with a PR that is %s, nothing created", async (_, pr) => {
    const { store, created } = memoryStore();
    const kicked: string[] = [];
    const res = await handleDeploy(post({ sha: SHA, pr }), store, {
      onQueued: (p) => kicked.push(p),
    });
    expect(res.status).toBe(400);
    expect(created).toEqual([]);
    expect(kicked).toEqual([]);
  });

  test("another project's token deploys only its own repo's image, under its own host", async () => {
    const { store, created } = memoryStore();
    const res = await handleDeploy(
      post({ sha: SHA, pr: 7 }, `Bearer ${OTHER}`),
      store,
    );
    expect(res.status).toBe(202);
    expect(
      ((await res.json()) as { preview: { url: string } }).preview.url,
    ).toBe("https://kd-other-pr-7.preview.fockus.dev");
    expect(created).toEqual([
      {
        projectId: "p2",
        environment: "preview",
        pr: 7,
        sha: SHA,
        image: `ghcr.io/fockus26/kd-other:${SHA}`,
      },
    ]);
  });

  test("a body cannot name the project or the image", async () => {
    const { store, created } = memoryStore();
    for (const extra of [{ project: "kd_hello" }, { image: "ghcr.io/x/y:1" }]) {
      const res = await handleDeploy(
        post({ sha: SHA, pr: 7, ...extra }, `Bearer ${OTHER}`),
        store,
      );
      expect(res.status).toBe(400);
    }
    expect(created).toEqual([]);
  });
});

const del = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  new Request("http://localhost/api/v1/preview", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("DELETE /api/v1/preview", () => {
  const closing = () => {
    const closed: Array<[string, string, number]> = [];
    return {
      closed,
      hooks: {
        onClosed: (p: { id: string; name: string }, pr: number) =>
          closed.push([p.id, p.name, pr]),
      },
    };
  };

  test("202 and removes the token's project's preview of that PR", async () => {
    const { store, touched } = memoryStore();
    const { closed, hooks } = closing();
    const res = await handleClosePreview(del({ pr: 7 }), store, hooks);
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      preview: { pr: 7, url: "https://kd-hello-pr-7.preview.fockus.dev" },
    });
    expect(closed).toEqual([["p1", "kd_hello", 7]]);
    expect(touched).toEqual(["t1"]);
  });

  test("another project's token closes its own PR 7, never kd_hello's", async () => {
    const { store } = memoryStore();
    const { closed, hooks } = closing();
    await handleClosePreview(del({ pr: 7 }, `Bearer ${OTHER}`), store, hooks);
    expect(closed).toEqual([["p2", "kd_other", 7]]);
  });

  test.each([
    ["no header", null],
    ["a malformed header", "Bearer nope"],
    ["an unknown token", `Bearer ${generateDeployToken().token}`],
  ])("401 with %s, nothing removed", async (_, auth) => {
    const { store } = memoryStore();
    const { closed, hooks } = closing();
    const res = await handleClosePreview(del({ pr: 7 }, auth), store, hooks);
    expect(res.status).toBe(401);
    expect(closed).toEqual([]);
  });

  test("401 with a revoked token", async () => {
    const { store } = memoryStore({ revoked: true });
    const { closed, hooks } = closing();
    expect(
      (await handleClosePreview(del({ pr: 7 }), store, hooks)).status,
    ).toBe(401);
    expect(closed).toEqual([]);
  });

  test.each([
    ["not JSON", "{nope"],
    ["no PR", {}],
    ["PR 0", { pr: 0 }],
    ["a string PR", { pr: "7" }],
    ["a project named by the caller", { pr: 7, project: "kd_hello" }],
  ])("400 with %s, nothing removed", async (_, body) => {
    const { store } = memoryStore();
    const { closed, hooks } = closing();
    expect((await handleClosePreview(del(body), store, hooks)).status).toBe(
      400,
    );
    expect(closed).toEqual([]);
  });

  test("413 over the size limit", async () => {
    const { store } = memoryStore();
    const res = await handleClosePreview(
      del({ pr: 7, pad: "x".repeat(MAX_BODY_BYTES) }),
      store,
    );
    expect(res.status).toBe(413);
  });

  test("a database error is a 500 that leaks nothing", async () => {
    const { store } = memoryStore({ fail: true });
    const res = await handleClosePreview(del({ pr: 7 }), store);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("connection refused");
    expect(text).not.toContain(TOKEN);
  });
});
