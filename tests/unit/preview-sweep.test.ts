import { describe, expect, test } from "bun:test";
import { runCli } from "../../cli/commands";
import type { CommentUpsert } from "../../lib/deploy/pr-comment";
import { githubPullState, type PullState } from "../../lib/deploy/pr-state";
import {
  type SweepDeps,
  type SweepRepo,
  sweepPreviews,
} from "../../lib/deploy/sweep";
import {
  at,
  deps,
  err,
  fakeAgent,
  memoryRepo,
  name,
  ok,
  type Row,
  sha,
} from "./deploy-fakes";

const PROJECT = { id: "p1", name: "kd_hello", repo: "Fockus26/kd-hello" };
const prName = (pr: number, c: string) => `kd_hello-pr-${pr}-${c.repeat(12)}`;
const MUTATING = [
  "container.stop",
  "container.remove",
  "preview.remove",
  "preview.write",
  "container.run",
  "container.start",
  "site.write",
  "site.remove",
];

type Listed = {
  name: string;
  state: string;
  image: string;
  site: string;
  project: string;
  env: string;
  sha: string;
  port: number | null;
};

/** A container as kit-deploy's `container.list` reports it (labels included). */
const preview = (pr: number, c: string, state = "running"): Listed => ({
  name: prName(pr, c),
  state,
  image: "ghcr.io/fockus26/kd-hello:x",
  site: `kd_hello-pr-${pr}`,
  project: "kd_hello",
  env: "preview",
  sha: c.repeat(40),
  port: 29000 + pr,
});

const livePreview = (pr: number, c: string, minute = 1): Row => ({
  id: `d${pr}`,
  sha: sha(c),
  pr,
  status: "live",
  container: prName(pr, c),
  port: 29000 + pr,
  createdAt: at(minute),
});

/** The sweep's view of the in-memory rows (one project, kd_hello). */
function sweepRepo(rows: Row[]): SweepRepo {
  return {
    async projects() {
      return [PROJECT];
    },
    async previewPrs() {
      const prs = new Set<number>();
      for (const r of rows)
        if (
          r.pr !== undefined &&
          (["queued", "starting", "live", "asleep"].includes(r.status) ||
            r.container)
        )
          prs.add(r.pr);
      return [...prs].sort().map((pr) => ({ project: PROJECT, pr }));
    },
    async holds() {
      return {
        containers: rows.flatMap((r) => (r.container ? [r.container] : [])),
        prs: rows.flatMap((r) =>
          r.pr !== undefined && (r.status === "live" || r.status === "asleep")
            ? [r.pr]
            : [],
        ),
      };
    },
  };
}

/** Everything wired over fakes. `containers` is what Docker has with kit-deploy's label; the
 * agent's `container.list` filters it by project like the real one. */
function setup(opts: {
  rows?: Row[];
  containers?: Listed[];
  files?: Array<{ project: string; pr: number }>;
  ignored?: number;
  pulls?: Record<number, PullState> | null;
  dryRun?: boolean;
  overrides?: Parameters<typeof fakeAgent>[0];
}) {
  const rows = opts.rows ?? [];
  let containers = [...(opts.containers ?? [])];
  let files = [...(opts.files ?? [])];
  const f = fakeAgent({
    "container.list": (p) =>
      ok(containers.filter((c) => !p.project || c.project === p.project)),
    "preview.list": () => ok({ previews: files, ignored: opts.ignored ?? 0 }),
    // Like the machine: what was removed is not listed again.
    "container.remove": (p) => {
      containers = containers.filter((c) => c.name !== p.name);
      return ok({ name: p.name });
    },
    "preview.remove": (p) => {
      files = files.filter((x) => !(x.project === p.project && x.pr === p.pr));
      return ok({ removed: true });
    },
    ...opts.overrides,
  });
  const repo = memoryRepo(rows);
  const { d, logs } = deps(f.agent, repo);
  const comments: CommentUpsert[] = [];
  d.comments = async (c) => {
    comments.push(c);
    return "updated";
  };
  const asked: number[] = [];
  const pulls = opts.pulls === undefined ? {} : opts.pulls;
  const sd: SweepDeps = {
    switch: d,
    sweep: sweepRepo(rows),
    pullState:
      pulls === null
        ? null
        : async (_repo, pr) => {
            asked.push(pr);
            return pulls[pr] ?? "open";
          },
    dryRun: opts.dryRun,
  };
  const mutations = () =>
    f.calls.filter((c) => MUTATING.includes(c.op)).map((c) => c);
  return { ...f, rows, sd, comments, asked, logs, mutations };
}

describe("preview sweep: PRs closed on GitHub", () => {
  test("a closed PR's preview is closed like a normal close, and its comment updated", async () => {
    const s = setup({
      rows: [livePreview(7, "a"), livePreview(8, "b")],
      containers: [preview(7, "a"), preview(8, "b")],
      files: [
        { project: "kd_hello", pr: 7 },
        { project: "kd_hello", pr: 8 },
      ],
      pulls: { 7: "closed", 8: "open" },
    });
    const r = await sweepPreviews(s.sd);
    expect(s.asked).toEqual([7, 8]);
    expect(s.mutations()).toEqual([
      { op: "preview.remove", params: { project: "kd_hello", pr: 7 } },
      { op: "container.stop", params: { name: prName(7, "a"), timeoutS: 0 } },
      { op: "container.remove", params: { name: prName(7, "a") } },
    ]);
    expect(s.rows.find((x) => x.id === "d7")).toMatchObject({
      status: "superseded",
      container: null,
    });
    expect(s.rows.find((x) => x.id === "d8")?.status).toBe("live");
    expect(s.comments).toHaveLength(1);
    expect(s.comments[0]).toMatchObject({ pr: 7, create: false });
    expect(r).toMatchObject({ closed: 1, containers: 0, files: 0, failed: 0 });
    expect(r.lines[0]).toBe(
      `closed kd_hello pr-7: PR closed on GitHub; file removed, 1 container(s) removed (${prName(7, "a")})`,
    );
  });

  test("no token: the check is skipped and said, the rest of the sweep still runs", async () => {
    const s = setup({
      rows: [livePreview(7, "a")],
      containers: [preview(7, "a"), preview(9, "c")],
      pulls: null,
    });
    const r = await sweepPreviews(s.sd);
    expect(r.lines[0]).toStartWith("skip closed PRs: no GITHUB_STATUS_TOKEN");
    expect(r.failed).toBe(0);
    expect(r.containers).toBe(1);
  });

  test("a PR GitHub does not know (404) is left as it is", async () => {
    const s = setup({ rows: [livePreview(7, "a")], pulls: { 7: "missing" } });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations()).toEqual([]);
    expect(r.lines[0]).toBe(
      "skip kd_hello pr-7: Fockus26/kd-hello#7 not found on GitHub, left as it is",
    );
  });

  test("GitHub failing on one PR is a failure of that PR only", async () => {
    const s = setup({ rows: [livePreview(7, "a"), livePreview(8, "b")] });
    s.sd.pullState = async (_r, pr) => {
      if (pr === 7) throw new Error("github answered 502");
      return "closed";
    };
    const r = await sweepPreviews(s.sd);
    expect(r.failed).toBe(1);
    expect(r.closed).toBe(1);
    expect(r.lines).toContain(
      "failed closing kd_hello pr-7: github answered 502",
    );
  });
});

describe("preview sweep: containers no deployment holds", () => {
  test("stops and removes a pr-<n> container no row holds; leaves held ones and production", async () => {
    const prod: Listed = {
      ...preview(1, "f"),
      name: name("f"),
      site: "kd_hello",
      env: "production",
    };
    const s = setup({
      rows: [livePreview(7, "a")],
      containers: [
        preview(7, "a"),
        preview(9, "c"),
        preview(10, "d", "exited"),
        prod,
      ],
    });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations()).toEqual([
      { op: "container.stop", params: { name: prName(9, "c"), timeoutS: 0 } },
      { op: "container.remove", params: { name: prName(9, "c") } },
      // Already stopped: only removed.
      { op: "container.remove", params: { name: prName(10, "d") } },
    ]);
    expect(r.containers).toBe(2);
    expect(r.lines).toContain(
      `removed container ${prName(9, "c")} (running): no deployment holds it`,
    );
  });

  test("a container of someone else's (gaby, evolution_*) is never touched", async () => {
    // Even if one ever showed up in the list, without kit-deploy's preview labels it is skipped.
    const foreign = (n: string, labels: Partial<Listed> = {}): Listed => ({
      name: n,
      state: "running",
      image: "x",
      site: "",
      project: "",
      env: "",
      sha: "",
      port: null,
      ...labels,
    });
    const s = setup({
      containers: [
        foreign("gaby"),
        foreign("evolution_api"),
        foreign("evolution_postgres", { env: "preview", project: "evolution" }),
        // A name that looks like ours but whose labels disagree: left as well.
        { ...preview(3, "e"), site: "kd_hello-pr-4" },
        { ...preview(5, "e"), name: "gaby-pr-5-eeeeeeeeeeee" },
      ],
    });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations()).toEqual([]);
    for (const c of s.calls)
      expect(JSON.stringify(c.params)).not.toMatch(/gaby|evolution/);
    expect(r.failed).toBe(0);
    expect(r.skipped).toBeGreaterThanOrEqual(3);
  });

  test("a preview container of a project no longer in the database is removed", async () => {
    const old: Listed = {
      ...preview(2, "b"),
      name: "old_site-pr-2-bbbbbbbbbbbb",
      site: "old_site-pr-2",
      project: "old_site",
    };
    const s = setup({ containers: [old] });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations().map((c) => c.op)).toEqual([
      "container.stop",
      "container.remove",
    ]);
    expect(r.lines).toContain(
      "removed container old_site-pr-2-bbbbbbbbbbbb (running): project old_site is not in the database",
    );
  });

  test("a remove the agent refuses is a failure, and the sweep goes on", async () => {
    const s = setup({
      containers: [preview(9, "c"), preview(11, "e", "exited")],
      overrides: {
        "container.remove": (p) =>
          p.name === prName(9, "c") ? err("docker rm failed") : ok(p),
      },
    });
    const r = await sweepPreviews(s.sd);
    expect(r.failed).toBe(1);
    expect(r.containers).toBe(1);
    expect(r.lines.at(-1)).toContain("1 failed");
  });
});

describe("preview sweep: files with no preview", () => {
  test("removes the file of a PR with no live or asleep preview; keeps live and asleep ones", async () => {
    const s = setup({
      rows: [
        livePreview(7, "a"),
        { ...livePreview(8, "b"), status: "asleep", container: null },
        { ...livePreview(9, "c"), status: "superseded", container: null },
      ],
      files: [
        { project: "kd_hello", pr: 7 },
        { project: "kd_hello", pr: 8 },
        { project: "kd_hello", pr: 9 },
        { project: "gone", pr: 3 },
      ],
      ignored: 2,
    });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations()).toEqual([
      { op: "preview.remove", params: { project: "kd_hello", pr: 9 } },
      { op: "preview.remove", params: { project: "gone", pr: 3 } },
    ]);
    expect(r.files).toBe(2);
    expect(r.lines).toContain(
      "removed file /etc/caddy/previews/kd_hello-pr-9.caddy: no live or asleep preview in the database",
    );
    expect(r.lines).toContain(
      "skip 2 file(s) in /etc/caddy/previews/ that are not preview files, left as they are",
    );
  });
});

describe("preview sweep --dry-run", () => {
  test("reads and reports all three cases, changes nothing", async () => {
    const rows = [livePreview(7, "a")];
    const before = JSON.stringify(rows);
    const s = setup({
      rows,
      containers: [preview(7, "a"), preview(9, "c")],
      files: [
        { project: "kd_hello", pr: 7 },
        { project: "kd_hello", pr: 9 },
      ],
      pulls: { 7: "closed" },
      dryRun: true,
    });
    const r = await sweepPreviews(s.sd);
    expect(s.mutations()).toEqual([]);
    expect(new Set(s.ops())).toEqual(
      new Set(["container.list", "preview.list"]),
    );
    expect(JSON.stringify(rows)).toBe(before);
    expect(s.comments).toEqual([]);
    expect(r.lines).toEqual([
      "would close kd_hello pr-7: PR closed on GitHub",
      `would remove container ${prName(9, "c")} (running): no deployment holds it`,
      "would remove file /etc/caddy/previews/kd_hello-pr-9.caddy: no live or asleep preview in the database",
      "sweep (dry run): 1 closed PR(s) would be cleaned, would remove 1 container(s) and 1 file(s), 0 skipped, 0 failed",
    ]);
  });
});

describe("kit-deploy preview sweep", () => {
  test("one line per action and the summary; exit 0", async () => {
    const s = setup({ containers: [preview(9, "c")] });
    const res = await runCli(["preview", "sweep"], fakeAgent().agent, {
      sweep: () => s.sd,
    });
    expect(res.code).toBe(0);
    expect(res.out).toBe(
      `removed container ${prName(9, "c")} (running): no deployment holds it\nsweep: 0 closed PR(s) cleaned, removed 1 container(s) and 0 file(s), 0 skipped, 0 failed\n`,
    );
  });

  test("--dry-run reaches the sweep; a failure makes the exit code 1", async () => {
    const s = setup({
      containers: [preview(9, "c")],
      overrides: { "container.list": () => err("docker ps failed") },
    });
    const res = await runCli(
      ["preview", "sweep", "--dry-run"],
      fakeAgent().agent,
      {
        sweep: () => s.sd,
      },
    );
    expect(res.code).toBe(1);
    expect(res.out).toContain("failed sweeping kd_hello: container.list");
    expect(res.out).toContain("sweep (dry run):");
  });

  test("--json prints the report", async () => {
    const s = setup({});
    const res = await runCli(
      ["preview", "sweep", "--json"],
      fakeAgent().agent,
      {
        sweep: () => s.sd,
      },
    );
    expect(JSON.parse(res.out)).toMatchObject({ failed: 0, dryRun: false });
  });

  test("usage errors exit 2", async () => {
    const ctx = { sweep: () => setup({}).sd };
    const a = fakeAgent().agent;
    expect((await runCli(["preview"], a, ctx)).code).toBe(2);
    expect((await runCli(["preview", "sweep", "now"], a, ctx)).code).toBe(2);
    expect(
      (await runCli(["preview", "sweep", "--force"], a, ctx)).err,
    ).toStartWith("unknown option --force");
  });
});

describe("githubPullState", () => {
  const TOKEN = "github_pat_TEST_ONLY";
  const reader = (status: number, body: unknown) => {
    const seen: string[] = [];
    const read = githubPullState(TOKEN, {
      api: "https://gh.test",
      fetch: (async (url: string, init: RequestInit) => {
        seen.push(`${init.method} ${url}`);
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch,
    });
    return { read, seen };
  };

  test("open / closed from GET /repos/{o}/{r}/pulls/{n}", async () => {
    const a = reader(200, { state: "closed", body: "x" });
    expect(await a.read("Fockus26/kd-hello", 7)).toBe("closed");
    expect(a.seen).toEqual([
      "GET https://gh.test/repos/Fockus26/kd-hello/pulls/7",
    ]);
    expect(await reader(200, { state: "open" }).read("o/r", 1)).toBe("open");
  });

  test("404 is missing; other statuses and odd bodies are errors without the body", async () => {
    expect(await reader(404, {}).read("o/r", 1)).toBe("missing");
    await expect(reader(502, { secret: "x" }).read("o/r", 1)).rejects.toThrow(
      "github answered 502",
    );
    await expect(
      reader(200, { state: "merged" }).read("o/r", 1),
    ).rejects.toThrow("without a state");
  });

  test("a bad repo or PR never reaches a URL", async () => {
    const a = reader(200, { state: "open" });
    await expect(a.read("../x", 1)).rejects.toThrow("bad repo");
    await expect(a.read("o/r", 0)).rejects.toThrow("bad pr");
    expect(a.seen).toEqual([]);
  });
});
