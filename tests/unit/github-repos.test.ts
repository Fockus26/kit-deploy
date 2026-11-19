import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  branchAfterPick,
  DEFAULT_BRANCH,
  filterRepos,
  freeTextRepo,
  type Repo,
} from "../../lib/github/repo-filter";
import {
  githubApiFromEnv,
  githubReadTokenFromEnv,
  listRepos,
  nextPath,
  REPOS_CACHE_MS,
  resetRepoCache,
} from "../../lib/github/repos";

// Not a real token: the shape only, to check it never leaves anywhere but the header.
const TOKEN = "github_pat_TEST_ONLY_read_token_not_real_0000";
const API = "https://api.github.com";

type Call = { url: string; init: RequestInit };
type Page = { status?: number; body?: unknown; link?: string };

function raw(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: n,
    full_name: `Fockus26/repo-${n}`,
    private: n % 2 === 0,
    pushed_at: "2026-11-17T10:00:00Z",
    default_branch: "main",
    owner: { login: "Fockus26" },
    description: "never passed on",
    ...extra,
  };
}

function fakeFetch(pages: Page[] | ((call: number) => Page)) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const p =
      typeof pages === "function"
        ? pages(calls.length - 1)
        : (pages[calls.length - 1] ?? { status: 500 });
    return new Response(JSON.stringify(p.body ?? []), {
      status: p.status ?? 200,
      headers: p.link ? { Link: p.link } : {},
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const next = (page: number) =>
  `<${API}/user/repos?per_page=100&sort=pushed&page=${page}>; rel="next", <${API}/user/repos?page=9>; rel="last"`;

beforeEach(() => resetRepoCache());

describe("listRepos", () => {
  test("no token: no-token, and GitHub is never called", async () => {
    const { f, calls } = fakeFetch([]);
    expect(await listRepos(null, { fetch: f })).toEqual({ kind: "no-token" });
    expect(await listRepos("", { fetch: f })).toEqual({ kind: "no-token" });
    expect(calls).toHaveLength(0);
  });

  test("first page: the right endpoint, the token only in the Authorization header", async () => {
    const { f, calls } = fakeFetch([{ body: [raw(1)] }]);
    await listRepos(TOKEN, { fetch: f });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `${API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
    );
    expect(calls[0].init.method).toBe("GET");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const elsewhere = JSON.stringify({ ...calls[0].init, headers: {} });
    expect(elsewhere).not.toContain(TOKEN);
    expect(calls[0].url).not.toContain(TOKEN);
  });

  test("only the picker's fields leave, in GitHub's order", async () => {
    const { f } = fakeFetch([
      { body: [raw(2), raw(1, { default_branch: "develop" })] },
    ]);
    const list = await listRepos(TOKEN, { fetch: f });
    expect(list).toEqual({
      kind: "ok",
      truncated: false,
      repos: [
        {
          fullName: "Fockus26/repo-2",
          private: true,
          pushedAt: "2026-11-17T10:00:00Z",
          defaultBranch: "main",
        },
        {
          fullName: "Fockus26/repo-1",
          private: false,
          pushedAt: "2026-11-17T10:00:00Z",
          defaultBranch: "develop",
        },
      ],
    });
  });

  test("a malformed item is skipped, not passed on", async () => {
    const { f } = fakeFetch([
      {
        body: [
          raw(1),
          { full_name: "no-slash" },
          { full_name: "a/b;rm" },
          null,
          "x",
          { full_name: "Fockus26/empty", pushed_at: null },
        ],
      },
    ]);
    const list = await listRepos(TOKEN, { fetch: f });
    if (list.kind !== "ok") throw new Error("expected ok");
    expect(list.repos.map((r) => r.fullName)).toEqual([
      "Fockus26/repo-1",
      "Fockus26/empty",
    ]);
    expect(list.repos[1]).toEqual({
      fullName: "Fockus26/empty",
      private: false,
      pushedAt: null,
      defaultBranch: "main",
    });
  });

  test("follows Link rel=next", async () => {
    const { f, calls } = fakeFetch([
      { body: [raw(1)], link: next(2) },
      { body: [raw(2)], link: next(3) },
      { body: [raw(3)] },
    ]);
    const list = await listRepos(TOKEN, { fetch: f });
    expect(calls.map((c) => c.url)).toEqual([
      expect.stringContaining("/user/repos?per_page=100"),
      `${API}/user/repos?per_page=100&sort=pushed&page=2`,
      `${API}/user/repos?per_page=100&sort=pushed&page=3`,
    ]);
    expect(list).toMatchObject({ kind: "ok", truncated: false });
    if (list.kind === "ok") expect(list.repos).toHaveLength(3);
  });

  test("stops at 5 pages and says the list is cut", async () => {
    const { f, calls } = fakeFetch((i) => ({
      body: Array.from({ length: 100 }, (_, k) => raw(i * 100 + k)),
      link: next(i + 2),
    }));
    const list = await listRepos(TOKEN, { fetch: f });
    expect(calls).toHaveLength(5);
    expect(list).toMatchObject({ kind: "ok", truncated: true });
    if (list.kind === "ok") expect(list.repos).toHaveLength(500);
  });

  test("a next link to another host is not followed", async () => {
    const { f, calls } = fakeFetch([
      {
        body: [raw(1)],
        link: '<https://evil.example/user/repos?page=2>; rel="next"',
      },
    ]);
    const list = await listRepos(TOKEN, { fetch: f });
    expect(calls).toHaveLength(1);
    expect(list).toMatchObject({ kind: "ok", truncated: false });
  });

  test("401 / 403: error with the status, nothing of the body", async () => {
    for (const status of [401, 403]) {
      resetRepoCache();
      const { f } = fakeFetch([
        { status, body: { message: `Bad credentials ${TOKEN}` } },
      ]);
      const list = await listRepos(TOKEN, { fetch: f });
      expect(list).toEqual({ kind: "error", status });
      expect(JSON.stringify(list)).not.toContain(TOKEN);
    }
  });

  test("timeout / unreachable: error without a status, never throws", async () => {
    const f = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await listRepos(TOKEN, { fetch: f })).toEqual({
      kind: "error",
      status: null,
    });
  });

  test("a body that is not a list is an error", async () => {
    const { f } = fakeFetch([{ body: { message: "?" } }]);
    expect(await listRepos(TOKEN, { fetch: f })).toEqual({
      kind: "error",
      status: 200,
    });
  });

  test("a failure on a later page is an error, not half a list", async () => {
    const { f } = fakeFetch([
      { body: [raw(1)], link: next(2) },
      { status: 502 },
    ]);
    expect(await listRepos(TOKEN, { fetch: f })).toEqual({
      kind: "error",
      status: 502,
    });
  });

  test("cached for 5 minutes, then asked again", async () => {
    let t = 1_000_000;
    const now = () => t;
    const { f, calls } = fakeFetch(() => ({ body: [raw(1)] }));
    const first = await listRepos(TOKEN, { fetch: f, now });
    t += REPOS_CACHE_MS - 1;
    expect(await listRepos(TOKEN, { fetch: f, now })).toBe(first);
    expect(calls).toHaveLength(1);
    t += 1;
    await listRepos(TOKEN, { fetch: f, now });
    expect(calls).toHaveLength(2);
  });

  test("another token does not get the cached list", async () => {
    const { f, calls } = fakeFetch(() => ({ body: [raw(1)] }));
    await listRepos(TOKEN, { fetch: f });
    await listRepos(`${TOKEN}x`, { fetch: f });
    expect(calls).toHaveLength(2);
  });

  test("a failure is not cached", async () => {
    const { f, calls } = fakeFetch([{ status: 500 }, { body: [raw(1)] }]);
    expect(await listRepos(TOKEN, { fetch: f })).toEqual({
      kind: "error",
      status: 500,
    });
    expect(await listRepos(TOKEN, { fetch: f })).toMatchObject({
      kind: "ok",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("nextPath", () => {
  test("none, or no rel=next", () => {
    expect(nextPath(null)).toBeNull();
    expect(nextPath(`<${API}/user/repos?page=1>; rel="prev"`)).toBeNull();
  });
  test("the path of rel=next on the same API", () => {
    expect(nextPath(next(4))).toBe(
      "/user/repos?per_page=100&sort=pushed&page=4",
    );
  });
  test("a look-alike host is refused", () => {
    expect(
      nextPath('<https://api.github.com.evil.example/x>; rel="next"'),
    ).toBeNull();
  });
});

describe("githubReadTokenFromEnv", () => {
  test("only GITHUB_READ_TOKEN, never the status token", () => {
    expect(githubReadTokenFromEnv({})).toBeNull();
    expect(githubReadTokenFromEnv({ GITHUB_STATUS_TOKEN: TOKEN })).toBeNull();
    expect(githubReadTokenFromEnv({ GITHUB_READ_TOKEN: TOKEN })).toBe(TOKEN);
  });
});

const REPOS: Repo[] = [
  {
    fullName: "Fockus26/kd-hello",
    private: false,
    pushedAt: null,
    defaultBranch: "main",
  },
  {
    fullName: "Fockus26/Maranatha",
    private: true,
    pushedAt: null,
    defaultBranch: "master",
  },
  {
    fullName: "otra-org/landing",
    private: true,
    pushedAt: null,
    defaultBranch: "main",
  },
];

describe("filterRepos", () => {
  test("empty query: all, in order", () => {
    expect(filterRepos(REPOS, "  ")).toEqual(REPOS);
  });
  test("by owner/name, any case", () => {
    expect(filterRepos(REPOS, "maran").map((r) => r.fullName)).toEqual([
      "Fockus26/Maranatha",
    ]);
    expect(filterRepos(REPOS, "fockus26/").map((r) => r.fullName)).toEqual([
      "Fockus26/kd-hello",
      "Fockus26/Maranatha",
    ]);
    expect(filterRepos(REPOS, "org/l").map((r) => r.fullName)).toEqual([
      "otra-org/landing",
    ]);
  });
  test("no match: empty", () => {
    expect(filterRepos(REPOS, "nada")).toEqual([]);
  });
});

describe("freeTextRepo", () => {
  test("a valid owner/repo not in the list is offered, trimmed", () => {
    expect(freeTextRepo(REPOS, " alguien/otro-repo ")).toBe(
      "alguien/otro-repo",
    );
  });
  test("one already in the list (any case) is not", () => {
    expect(freeTextRepo(REPOS, "fockus26/kd-hello")).toBeNull();
  });
  test("an invalid value is not", () => {
    expect(freeTextRepo(REPOS, "")).toBeNull();
    expect(freeTextRepo(REPOS, "solo-nombre")).toBeNull();
    expect(freeTextRepo(REPOS, "a/b/c")).toBeNull();
    expect(freeTextRepo(REPOS, "a/b c")).toBeNull();
  });
});

describe("branchAfterPick", () => {
  const develop = { ...REPOS[0], defaultBranch: "develop" };
  test("a listed repo brings its default branch", () => {
    expect(branchAfterPick("main", develop, false)).toBe("develop");
  });
  test("a typed repo after a listed one goes back to main, not the old branch", () => {
    const afterListed = branchAfterPick("main", develop, false);
    expect(branchAfterPick(afterListed, null, false)).toBe(DEFAULT_BRANCH);
    expect(DEFAULT_BRANCH).toBe("main");
  });
  test("a branch the user typed is kept, whatever is picked", () => {
    expect(branchAfterPick("release", develop, true)).toBe("release");
    expect(branchAfterPick("release", null, true)).toBe("release");
  });
});

describe("githubApiFromEnv (D065)", () => {
  const QA = { QA_LOCAL: "1" };
  test("unset or empty: GitHub", () => {
    expect(githubApiFromEnv({})).toBe(API);
    expect(githubApiFromEnv({ ...QA, GITHUB_API_BASE: "" })).toBe(API);
  });
  test("outside qa:local even a loopback base is ignored (the VPS previews listen there)", () => {
    expect(githubApiFromEnv({ GITHUB_API_BASE: "http://127.0.0.1:4310" })).toBe(
      API,
    );
    expect(
      githubApiFromEnv({
        QA_LOCAL: "true",
        GITHUB_API_BASE: "http://127.0.0.1:4310",
      }),
    ).toBe(API);
  });
  test("a leading-zero port is normalised, so the fake's Link still matches", () => {
    expect(
      githubApiFromEnv({ ...QA, GITHUB_API_BASE: "http://127.0.0.1:04310" }),
    ).toBe("http://127.0.0.1:4310");
  });
  test("a loopback http base with a port is accepted, without a trailing slash", () => {
    expect(
      githubApiFromEnv({ ...QA, GITHUB_API_BASE: "http://127.0.0.1:4310" }),
    ).toBe("http://127.0.0.1:4310");
    expect(
      githubApiFromEnv({ ...QA, GITHUB_API_BASE: "http://localhost:4310/" }),
    ).toBe("http://localhost:4310");
    expect(
      githubApiFromEnv({ ...QA, GITHUB_API_BASE: "http://[::1]:65535" }),
    ).toBe("http://[::1]:65535");
  });
  test("anything else is ignored, so the token never goes elsewhere", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example:4310",
      "http://10.0.0.1:4310",
      "http://127.0.0.1.evil.com:4310",
      "http://127.0.0.1:4310.evil.com",
      "http://127.0.0.1:4310@evil.com",
      "http://user@127.0.0.1:4310",
      "http://127.0.0.1",
      "http://127.0.0.1:0",
      "http://127.0.0.1:70000",
      "http://127.0.0.1:4310/api",
      "http://127.0.0.1:4310?x=1",
      "https://127.0.0.1:4310",
      " http://127.0.0.1:4310",
      "not a url",
    ]) {
      expect(githubApiFromEnv({ ...QA, GITHUB_API_BASE: bad })).toBe(API);
    }
  });
  test("a refused value is logged once and never echoed", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      githubApiFromEnv({
        ...QA,
        GITHUB_API_BASE: "https://secret-host.example",
      });
      githubApiFromEnv({
        ...QA,
        GITHUB_API_BASE: "https://secret-host.example",
      });
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain("secret-host");
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      warn.mockRestore();
    }
  });
  test("listRepos on the fake: its URL, Link only within that base, token only in the header", async () => {
    const base = githubApiFromEnv({
      ...QA,
      GITHUB_API_BASE: "http://127.0.0.1:4310",
    });
    const { f, calls } = fakeFetch([
      {
        body: [raw(1)],
        link: `<${base}/user/repos?per_page=100&page=2>; rel="next"`,
      },
      {
        body: [raw(2)],
        link: '<http://127.0.0.1:43100/user/repos?page=3>; rel="next"',
      },
    ]);
    const list = await listRepos(TOKEN, { fetch: f, api: base });
    expect(calls.map((c) => c.url)).toEqual([
      `${base}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
      `${base}/user/repos?per_page=100&page=2`,
    ]);
    expect(list).toMatchObject({ kind: "ok", truncated: false });
    for (const c of calls) {
      expect(c.url).not.toContain(TOKEN);
      expect((c.init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
    }
  });
  test("the cache is per API: a list from GitHub is not served for the fake", async () => {
    const { f, calls } = fakeFetch(() => ({ body: [raw(1)] }));
    await listRepos(TOKEN, { fetch: f, api: API });
    await listRepos(TOKEN, { fetch: f, api: "http://127.0.0.1:4310" });
    expect(calls).toHaveLength(2);
  });
});
