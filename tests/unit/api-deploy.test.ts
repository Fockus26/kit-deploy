import { describe, expect, test } from "bun:test";
import { handleDeploy, imageFor, MAX_BODY_BYTES } from "../../lib/api/deploy";
import type {
  DeploymentRef,
  DeployStore,
  NewDeployment,
} from "../../lib/db/store";
import { bearerToken, generateDeployToken, hashToken } from "../../lib/tokens";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const { token: TOKEN, hash: HASH } = generateDeployToken();

function memoryStore(opts: { revoked?: boolean; fail?: boolean } = {}) {
  const created: NewDeployment[] = [];
  const touched: string[] = [];
  const open = new Map<string, DeploymentRef>();
  const store: DeployStore = {
    async findTokenProject(hash) {
      if (opts.fail) throw new Error("connection refused");
      return hash === HASH && !opts.revoked
        ? {
            tokenId: "t1",
            project: { id: "p1", name: "kd_hello", repo: "Fockus26/KD-Hello" },
          }
        : null;
    },
    async touchToken(id) {
      touched.push(id);
    },
    async findOpenDeployment(projectId, sha) {
      return open.get(`${projectId}:${sha}`) ?? null;
    },
    async createDeployment(d) {
      created.push(d);
      const ref: DeploymentRef = {
        id: `d${created.length}`,
        status: "queued",
        image: d.image,
      };
      open.set(`${d.projectId}:${d.sha}`, ref);
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
