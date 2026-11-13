import { describe, expect, test } from "bun:test";
import {
  DESCRIPTION_MAX,
  githubStatusPublisher,
  STATUS_CONTEXT,
  StatusError,
  statusPublisherFromEnv,
  statusRequest,
} from "../../lib/deploy/commit-status";
import { processProject } from "../../lib/deploy/switch";
import {
  at,
  deps,
  err,
  fakeAgent,
  memoryRepo,
  type Row,
  sha,
} from "./deploy-fakes";

// Not a real token: the shape only, to check it never leaves in an error or a log.
const TOKEN = "github_pat_TEST_ONLY_not_a_real_token_0000";

type Call = { url: string; init: RequestInit };
function fakeFetch(status = 201) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 201 ? "{}" : '{"message":"nope"}', {
      status,
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const success = {
  repo: "Fockus26/kd-hello",
  sha: sha("b"),
  state: "success" as const,
  description: "Live at kd-hello.fockus.dev",
  targetUrl: "https://kd-hello.fockus.dev",
};

describe("statusRequest", () => {
  test("path and body", () => {
    const r = statusRequest(success);
    expect(r.path).toBe(`/repos/Fockus26/kd-hello/statuses/${sha("b")}`);
    expect(JSON.parse(r.body)).toEqual({
      state: "success",
      context: STATUS_CONTEXT,
      description: "Live at kd-hello.fockus.dev",
      target_url: "https://kd-hello.fockus.dev",
    });
  });

  test("description is cut to GitHub's 140", () => {
    const r = statusRequest({
      ...success,
      state: "failure",
      description: "x".repeat(500),
      targetUrl: undefined,
    });
    const body = JSON.parse(r.body);
    expect(body.description).toHaveLength(DESCRIPTION_MAX);
    expect(body.target_url).toBeUndefined();
  });

  test("refuses a bad repo, sha or URL", () => {
    expect(() => statusRequest({ ...success, repo: "../x" })).toThrow(
      StatusError,
    );
    expect(() => statusRequest({ ...success, repo: "a/b/c" })).toThrow(
      StatusError,
    );
    expect(() => statusRequest({ ...success, sha: "HEAD" })).toThrow(
      StatusError,
    );
    expect(() =>
      statusRequest({ ...success, targetUrl: "http://kd-hello.fockus.dev" }),
    ).toThrow(StatusError);
  });
});

describe("githubStatusPublisher", () => {
  test("POSTs to the statuses API with the token as Bearer", async () => {
    const { f, calls } = fakeFetch();
    await githubStatusPublisher(TOKEN, { fetch: f })(success);
    expect(calls).toHaveLength(1);
    const c = calls[0] as Call;
    expect(c.url).toBe(
      `https://api.github.com/repos/Fockus26/kd-hello/statuses/${sha("b")}`,
    );
    expect(c.init.method).toBe("POST");
    const h = c.init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(h["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  test("a non-201 throws with the status only, never the token", async () => {
    const { f } = fakeFetch(403);
    const e = await githubStatusPublisher(TOKEN, { fetch: f })(success).catch(
      (x: Error) => x,
    );
    expect(e).toBeInstanceOf(StatusError);
    expect((e as Error).message).toBe("github answered 403");
  });

  test("unreachable: the error names it, without the token", async () => {
    const f = (async () => {
      throw new TypeError(`fetch failed for ${TOKEN}`);
    }) as unknown as typeof fetch;
    const e = await githubStatusPublisher(TOKEN, { fetch: f })(success).catch(
      (x: Error) => x,
    );
    expect((e as Error).message).toBe("github unreachable: TypeError");
  });

  test("from the environment: none without GITHUB_STATUS_TOKEN", () => {
    expect(statusPublisherFromEnv({})).toBeNull();
    expect(
      statusPublisherFromEnv({ GITHUB_STATUS_TOKEN: TOKEN }),
    ).toBeFunction();
  });
});

describe("the switch publishes the commit status", () => {
  const queued = (): Row[] => [
    {
      id: "new",
      sha: sha("b"),
      status: "queued",
      container: null,
      port: null,
      createdAt: at(2),
    },
  ];

  test("live → success with the site's URL", async () => {
    const sent: unknown[] = [];
    const { agent } = fakeAgent();
    const { d, logs } = deps(
      agent,
      memoryRepo(queued(), ["kd-hello.fockus.dev"]),
    );
    d.status = async (s) => {
      sent.push(s);
    };
    expect(await processProject(d, "p1")).toEqual([
      { id: "new", result: "live" },
    ]);
    expect(sent).toEqual([
      {
        repo: "Fockus26/kd-hello",
        sha: sha("b"),
        state: "success",
        description: "Live at kd-hello.fockus.dev",
        targetUrl: "https://kd-hello.fockus.dev",
      },
    ]);
    expect(logs).toContainEqual({
      event: "switch.status",
      deployment: "new",
      state: "success",
    });
  });

  test("failed → failure with the reason", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const { agent } = fakeAgent({
      "image.pull": () => err("manifest unknown"),
    });
    const { d } = deps(agent, memoryRepo(queued()));
    d.status = async (s) => {
      sent.push(s);
    };
    const [r] = await processProject(d, "p1");
    expect(r?.result).toBe("failed");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ state: "failure", sha: sha("b") });
    expect(sent[0]?.description).toStartWith("Deploy failed: image.pull:");
    expect(sent[0]?.targetUrl).toBeUndefined();
  });

  test("GitHub failing never changes the outcome", async () => {
    const { agent } = fakeAgent();
    const rows = queued();
    const { d, logs } = deps(agent, memoryRepo(rows));
    d.status = async () => {
      throw new StatusError("github answered 500");
    };
    expect(await processProject(d, "p1")).toEqual([
      { id: "new", result: "live" },
    ]);
    expect(rows[0]?.status).toBe("live");
    expect(logs).toContainEqual({
      event: "switch.status_failed",
      deployment: "new",
      error: "github answered 500",
    });
  });

  test("no token: skipped, and said so", async () => {
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo(queued()));
    await processProject(d, "p1");
    expect(logs).toContainEqual({
      event: "switch.status_skipped",
      deployment: "new",
      reason: "no GITHUB_STATUS_TOKEN",
    });
  });

  test("the status goes out after the switch, not before", async () => {
    const order: string[] = [];
    const { agent } = fakeAgent({
      "site.write": () => {
        order.push("site.write");
        return {
          id: "x",
          ok: true,
          result: { path: "/etc/caddy/sites/kd_hello.caddy", changed: true },
        };
      },
    });
    const { d } = deps(agent, memoryRepo(queued()));
    d.status = async () => {
      order.push("status");
    };
    await processProject(d, "p1");
    expect(order).toEqual(["site.write", "status"]);
  });
});
