import { describe, expect, test } from "bun:test";
import {
  githubStatusPublisher,
  StatusError,
  type StatusPublisher,
} from "../../lib/deploy/commit-status";
import {
  closedCommentBody,
  commenterFromEnv,
  githubCommenter,
  liveCommentBody,
  type PreviewCommenter,
  previewMarker,
} from "../../lib/deploy/pr-comment";
import { closePreview, processProject } from "../../lib/deploy/switch";
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
const API = "https://api.github.com";
const REPO = "Fockus26/kd-hello";
const MARKER = previewMarker("kd_hello");
const URL7 = "https://kd-hello-pr-7.preview.fockus.dev";
const PROJECT = { id: "p1", name: "kd_hello", repo: REPO };

type Call = { method: string; url: string; body: unknown; auth: string };
type Route = (c: Call) => Response;

/** A GitHub that answers by `METHOD url-prefix`; anything else is a 404. */
function fakeGitHub(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const c: Call = {
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: h.Authorization ?? "",
    };
    calls.push(c);
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === c.method && url.startsWith(`${API}${p}`);
    });
    return key
      ? (routes[key] as Route)(c)
      : new Response('{"message":"Not Found"}', { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });
const comment = (id: number, body: string, assoc = "OWNER") => ({
  id,
  body,
  author_association: assoc,
});
const LIST = `GET /repos/${REPO}/issues/7/comments`;
const POST = `POST /repos/${REPO}/issues/7/comments`;

describe("the comment's text", () => {
  test("live: the hidden marker first, the URL, the short commit, the login note", () => {
    const body = liveCommentBody({ project: "kd_hello", pr: 7, sha: sha("a") });
    expect(body.split("\n")[0]).toBe("<!-- kit-deploy:preview kd_hello -->");
    expect(body).toContain(URL7);
    expect(body).toContain("`aaaaaaa`");
    expect(body).not.toContain(sha("a"));
    expect(body).toContain("Pide iniciar sesión");
  });

  test("closed: the same marker, and that the preview is gone", () => {
    const body = closedCommentBody({ project: "kd_hello", pr: 7 });
    expect(body).toStartWith(MARKER);
    expect(body).toContain("eliminada");
    expect(body).not.toContain(URL7);
  });
});

describe("githubCommenter", () => {
  const live = {
    repo: REPO,
    pr: 7,
    marker: MARKER,
    body: liveCommentBody({ project: "kd_hello", pr: 7, sha: sha("a") }),
    create: true,
  };

  test("no comment yet: lists, then POSTs a new one with the token as Bearer", async () => {
    const { f, calls } = fakeGitHub({
      [LIST]: () => json(200, [comment(1, "LGTM")]),
      [POST]: () => json(201, { id: 99 }),
    });
    expect(await githubCommenter(TOKEN, { fetch: f })(live)).toBe("created");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${API}/repos/${REPO}/issues/7/comments?per_page=100&page=1`,
      `POST ${API}/repos/${REPO}/issues/7/comments`,
    ]);
    expect(calls[1]?.body).toEqual({ body: live.body });
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  test("ours is there: PATCHed in place, nothing new", async () => {
    const { f, calls } = fakeGitHub({
      [LIST]: () =>
        json(200, [comment(1, "LGTM"), comment(42, `${MARKER}\nold`)]),
      [`PATCH /repos/${REPO}/issues/comments/42`]: () => json(200, {}),
    });
    expect(await githubCommenter(TOKEN, { fetch: f })(live)).toBe("updated");
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
    expect(calls[1]?.url).toBe(`${API}/repos/${REPO}/issues/comments/42`);
    expect(calls[1]?.body).toEqual({ body: live.body });
  });

  test("the marker pasted by someone without write access is not ours", async () => {
    const { f, calls } = fakeGitHub({
      [LIST]: () => json(200, [comment(5, `${MARKER}\nhi`, "NONE")]),
      [POST]: () => json(201, { id: 6 }),
    });
    expect(await githubCommenter(TOKEN, { fetch: f })(live)).toBe("created");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  test("another project's marker in the same repo is not ours", async () => {
    const other = previewMarker("kd_other");
    const { f, calls } = fakeGitHub({
      [LIST]: () => json(200, [comment(5, `${other}\nx`)]),
      [POST]: () => json(201, { id: 6 }),
    });
    expect(await githubCommenter(TOKEN, { fetch: f })(live)).toBe("created");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  test("a full first page: the next one is read too", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => comment(i + 1, "x"));
    const { f, calls } = fakeGitHub({
      [LIST]: (c) =>
        c.url.endsWith("page=1")
          ? json(200, page1)
          : json(200, [comment(500, `${MARKER}\nold`)]),
      [`PATCH /repos/${REPO}/issues/comments/500`]: () => json(200, {}),
    });
    expect(await githubCommenter(TOKEN, { fetch: f })(live)).toBe("updated");
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "PATCH"]);
  });

  test("create: false and none there → missing, nothing written", async () => {
    const { f, calls } = fakeGitHub({ [LIST]: () => json(200, []) });
    expect(
      await githubCommenter(TOKEN, { fetch: f })({ ...live, create: false }),
    ).toBe("missing");
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });

  test("an error says the status only: never the token nor GitHub's body", async () => {
    const { f } = fakeGitHub({
      [LIST]: () =>
        new Response(`{"message":"Bad credentials ${TOKEN}"}`, { status: 401 }),
    });
    const e = await githubCommenter(TOKEN, { fetch: f })(live).catch(
      (x: Error) => x,
    );
    expect(e).toBeInstanceOf(StatusError);
    expect((e as Error).message).toBe("github answered 401");
  });

  test("an unreadable list is an error that does not echo it", async () => {
    const { f } = fakeGitHub({
      [LIST]: () => new Response(`<html>${TOKEN}`, { status: 200 }),
    });
    const e = await githubCommenter(TOKEN, { fetch: f })(live).catch(
      (x: Error) => x,
    );
    expect((e as Error).message).toBe("github sent an unreadable comment list");
  });

  test("unreachable: the error names it, without the token", async () => {
    const f = (async () => {
      throw new TypeError(`fetch failed for ${TOKEN}`);
    }) as unknown as typeof fetch;
    const e = await githubCommenter(TOKEN, { fetch: f })(live).catch(
      (x: Error) => x,
    );
    expect((e as Error).message).toBe("github unreachable: TypeError");
  });

  test("refuses a bad repo, a bad PR or a body without its marker, before any request", async () => {
    const { f, calls } = fakeGitHub({});
    const c = githubCommenter(TOKEN, { fetch: f });
    await expect(c({ ...live, repo: "../x" })).rejects.toThrow(StatusError);
    await expect(c({ ...live, pr: 0 })).rejects.toThrow(StatusError);
    await expect(c({ ...live, body: "no marker" })).rejects.toThrow(
      StatusError,
    );
    expect(calls).toEqual([]);
  });

  test("from the environment: none without GITHUB_STATUS_TOKEN", () => {
    expect(commenterFromEnv({})).toBeNull();
    expect(commenterFromEnv({ GITHUB_STATUS_TOKEN: TOKEN })).toBeFunction();
  });
});

describe("the preview's status and comment after the switch", () => {
  const queued = (): Row[] => [
    {
      id: "p7",
      sha: sha("a"),
      pr: 7,
      status: "queued",
      container: null,
      port: null,
      createdAt: at(1),
    },
  ];

  function recorders() {
    const statuses: Array<Record<string, unknown>> = [];
    const comments: Array<Record<string, unknown>> = [];
    const status: StatusPublisher = async (s) => {
      statuses.push(s);
    };
    const commenter: PreviewCommenter = async (c) => {
      comments.push(c);
      return "created";
    };
    return { statuses, comments, status, commenter };
  }

  test("live → kit-deploy/preview success with its URL, and the PR's comment", async () => {
    const r = recorders();
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo(queued()));
    expect(
      await processProject(
        { ...d, status: r.status, comments: r.commenter },
        "p1",
      ),
    ).toEqual([{ id: "p7", result: "live" }]);
    expect(r.statuses).toEqual([
      {
        repo: REPO,
        sha: sha("a"),
        context: "kit-deploy/preview",
        state: "success",
        description: "Preview at kd-hello-pr-7.preview.fockus.dev",
        targetUrl: URL7,
      },
    ]);
    expect(r.comments).toEqual([
      {
        repo: REPO,
        pr: 7,
        marker: MARKER,
        body: liveCommentBody({ project: "kd_hello", pr: 7, sha: sha("a") }),
        create: true,
      },
    ]);
    expect(logs).toContainEqual({
      event: "preview.comment",
      deployment: "p7",
      project: "kd_hello",
      pr: 7,
      result: "created",
    });
  });

  test("failed → kit-deploy/preview failure with the reason; the comment is left alone", async () => {
    const r = recorders();
    const { agent } = fakeAgent({
      "image.pull": () => err("manifest unknown"),
    });
    const { d } = deps(agent, memoryRepo(queued()));
    const [out] = await processProject(
      { ...d, status: r.status, comments: r.commenter },
      "p1",
    );
    expect(out?.result).toBe("failed");
    expect(r.statuses).toHaveLength(1);
    expect(r.statuses[0]).toMatchObject({
      context: "kit-deploy/preview",
      state: "failure",
    });
    expect(r.statuses[0]?.description).toStartWith(
      "Deploy failed: image.pull:",
    );
    expect(r.statuses[0]?.targetUrl).toBeUndefined();
    expect(r.comments).toEqual([]);
  });

  test("GitHub down never changes the result: the preview is live, both failures logged", async () => {
    const { f } = fakeGitHub({});
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const rows = queued();
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo(rows));
    expect(
      await processProject(
        {
          ...d,
          status: githubStatusPublisher(TOKEN, { fetch: f }),
          comments: githubCommenter(TOKEN, { fetch: down }),
        },
        "p1",
      ),
    ).toEqual([{ id: "p7", result: "live" }]);
    expect(rows[0]?.status).toBe("live");
    expect(logs).toContainEqual({
      event: "switch.status_failed",
      deployment: "p7",
      context: "kit-deploy/preview",
      error: "github answered 404",
    });
    expect(logs).toContainEqual({
      event: "preview.comment_failed",
      deployment: "p7",
      project: "kd_hello",
      pr: 7,
      error: "github unreachable: TypeError",
    });
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });

  test("no token: status and comment skipped, and said so", async () => {
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo(queued()));
    expect(await processProject(d, "p1")).toEqual([
      { id: "p7", result: "live" },
    ]);
    expect(logs).toContainEqual({
      event: "switch.status_skipped",
      deployment: "p7",
      reason: "no GITHUB_STATUS_TOKEN",
    });
    expect(logs).toContainEqual({
      event: "preview.comment_skipped",
      deployment: "p7",
      project: "kd_hello",
      pr: 7,
      reason: "no GITHUB_STATUS_TOKEN",
    });
  });

  test("production gets no PR comment", async () => {
    const r = recorders();
    const { agent } = fakeAgent();
    const rows: Row[] = [
      {
        id: "prod",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(1),
      },
    ];
    const { d } = deps(agent, memoryRepo(rows));
    await processProject(
      { ...d, status: r.status, comments: r.commenter },
      "p1",
    );
    expect(r.statuses[0]?.context).toBe("kit-deploy/production");
    expect(r.comments).toEqual([]);
  });
});

describe("closing the PR edits the comment", () => {
  test("the comment says the preview was removed; never created if it was not there", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo([]));
    await closePreview(
      {
        ...d,
        comments: async (c) => {
          seen.push(c);
          return "updated";
        },
      },
      PROJECT,
      7,
    );
    expect(seen).toEqual([
      {
        repo: REPO,
        pr: 7,
        marker: MARKER,
        body: closedCommentBody({ project: "kd_hello", pr: 7 }),
        create: false,
      },
    ]);
    expect(logs).toContainEqual({
      event: "preview.comment",
      project: "kd_hello",
      pr: 7,
      result: "updated",
    });
  });

  test("a PR without a comment: skipped", async () => {
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo([]));
    await closePreview({ ...d, comments: async () => "missing" }, PROJECT, 7);
    expect(logs).toContainEqual({
      event: "preview.comment_skipped",
      project: "kd_hello",
      pr: 7,
      reason: "no comment",
    });
  });

  test("GitHub failing does not fail the close", async () => {
    const { agent } = fakeAgent();
    const { d, logs } = deps(agent, memoryRepo([]));
    expect(
      await closePreview(
        {
          ...d,
          comments: async () => {
            throw new StatusError("github answered 502");
          },
        },
        PROJECT,
        7,
      ),
    ).toEqual({ removed: [] });
    expect(logs).toContainEqual({
      event: "preview.comment_failed",
      project: "kd_hello",
      pr: 7,
      error: "github answered 502",
    });
  });

  test("Caddy refusing the removal: the comment is not touched", async () => {
    const seen: unknown[] = [];
    const { agent } = fakeAgent({
      "preview.remove": () => err("caddy reload failed"),
    });
    const { d } = deps(agent, memoryRepo([]));
    await expect(
      closePreview(
        {
          ...d,
          comments: async (c) => {
            seen.push(c);
            return "updated";
          },
        },
        PROJECT,
        7,
      ),
    ).rejects.toThrow("preview.remove");
    expect(seen).toEqual([]);
  });
});
