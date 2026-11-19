import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { Agent } from "../../agent/ops";
import type { ProjectRemoval } from "../../agent/project-remove";
import { fakeDeps } from "./agent-fakes";

const SITE = "/etc/caddy/sites/kd_hello.caddy";
const PREVIEW = "/etc/caddy/previews/kd_hello-pr-3.caddy";
const OTHER_SITE = "/etc/caddy/sites/shop.caddy";
const OTHER_PREVIEW = "/etc/caddy/previews/shop-pr-1.caddy";
const PIN = "/etc/kit-deploy/images/kd_hello";
const REPO = "ghcr.io/fockus26/kd-hello";

const siteFile = (name: string) =>
  `# Written by kit-deploy for ${name} — do not edit by hand: \`kit-deploy regenerate\` rewrites it.\nkd-hello.fockus.dev {\n}\n`;
const previewFile = (name: string) =>
  `# Written by kit-deploy for ${name} (running) — do not edit by hand.\n@${name} host x\n`;

/** `docker ps --all` as Agent.list formats it (names, state, image, then the labels). */
const listed = (
  rows: Array<[name: string, state: string, image: string, project: string]>,
) =>
  rows
    .map(([name, state, image, project]) =>
      [
        name,
        state,
        image,
        name,
        project,
        "production",
        "abc1234",
        "20001",
      ].join("\t"),
    )
    .join("\n");

const OURS = listed([
  ["kd_hello-prod-abc1234", "running", `${REPO}:abc1234`, "kd_hello"],
  ["kd_hello-pr-3-def5678", "exited", `${REPO}:def5678`, "kd_hello"],
]);

const IMAGES = [
  `sha256:aaa\t${REPO}\tabc1234\t2026-11-18 03:00:00 +0000 UTC`,
  `sha256:bbb\t${REPO}\tdef5678\t2026-11-17 03:00:00 +0000 UTC`,
  `sha256:ccc\t${REPO}\t0ld0000\t2026-11-10 03:00:00 +0000 UTC`,
].join("\n");

type Handlers = Parameters<typeof fakeDeps>[0];

function setup(handlers: Handlers = {}, removed = new Set<string>()) {
  const f = fakeDeps({
    // Agent.list: what Docker still has, minus what this test's `docker rm` took.
    "docker ps --all": () => ({
      stdout: OURS.split("\n")
        .filter((l) => !removed.has(l.split("\t")[0] ?? ""))
        .join("\n"),
    }),
    // Every container on the machine, any label (gaby uses its own image).
    "docker ps -a": () => ({
      stdout: [
        ...OURS.split("\n")
          .filter((l) => !removed.has(l.split("\t")[0] ?? ""))
          .map((l) => {
            const [name, , image] = l.split("\t");
            return `${name}\t${image}\tsha256:x${name}`;
          }),
        "gaby\tgaby:latest\tsha256:gaby",
      ].join("\n"),
    }),
    "docker image ls": () => ({ stdout: IMAGES }),
    "docker rm": (argv) => {
      removed.add(argv[2] ?? "");
      return {};
    },
    // kit-db knows kd_hello (kit-deploy's) but no kd_hello_preview.
    "kit-db url kd_hello_preview": () => ({ code: 1, stderr: "no such db" }),
    ...handlers,
  });
  f.files.set(SITE, siteFile("kd_hello"));
  f.files.set(PREVIEW, previewFile("kd_hello-pr-3"));
  f.files.set(OTHER_SITE, siteFile("shop"));
  f.files.set(OTHER_PREVIEW, previewFile("shop-pr-1"));
  f.files.set(PIN, `${REPO}\n`);
  f.files.set("/etc/kit-deploy/images/shop", "ghcr.io/fockus26/shop\n");
  f.files.set("/etc/kit-deploy/dbs/kd_hello", "created by kit-deploy x\n");
  const agent = new Agent(f.deps);
  const send = async (project: string, dryRun: boolean) =>
    dispatch(
      agent,
      f.deps,
      JSON.stringify({
        id: "r1",
        op: "project.remove",
        params: { project, dryRun },
      }),
    );
  const result = async (dryRun: boolean, project = "kd_hello") => {
    const res = await send(project, dryRun);
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    return res.result as ProjectRemoval;
  };
  return { ...f, send, result, removed };
}

const MUTATING = /^(docker (stop|rm|image rm)|caddy (validate|reload))/;

describe("project.remove — dry run", () => {
  test("lists only kit-deploy's things for the project and changes nothing", async () => {
    const { result, calls, files } = setup();
    const r = await result(true);
    expect(r).toEqual({
      project: "kd_hello",
      dryRun: true,
      sites: [SITE, PREVIEW],
      containers: [
        { name: "kd_hello-prod-abc1234", state: "running" },
        { name: "kd_hello-pr-3-def5678", state: "exited" },
      ],
      images: [`${REPO}:abc1234`, `${REPO}:def5678`, `${REPO}:0ld0000`],
      pin: PIN,
      databases: [
        { database: "kd_hello", exists: true, managed: true },
        { database: "kd_hello_preview", exists: false, managed: false },
      ],
      skipped: [],
      failed: [],
    });
    expect(calls.filter((c) => MUTATING.test(c.join(" ")))).toEqual([]);
    for (const p of [SITE, PREVIEW, PIN]) expect(files.has(p)).toBe(true);
  });
});

describe("project.remove — --yes", () => {
  test("Caddy first (one validate + reload), then containers, images and the pin last", async () => {
    const { result, calls, files } = setup();
    const r = await result(false);
    const order = calls
      .map((c) => c.join(" "))
      .filter((c) => MUTATING.test(c) || c.startsWith("docker image ls"));
    expect(order).toEqual([
      "caddy validate --config=/etc/caddy/Caddyfile --adapter=caddyfile",
      "caddy reload --config=/etc/caddy/Caddyfile --adapter=caddyfile",
      "docker stop --time=10 kd_hello-prod-abc1234",
      "docker rm kd_hello-prod-abc1234",
      "docker rm kd_hello-pr-3-def5678",
      `docker image ls ${REPO} --no-trunc --format {{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}`,
      `docker image rm ${REPO}:abc1234`,
      `docker image rm ${REPO}:def5678`,
      `docker image rm ${REPO}:0ld0000`,
    ]);
    // Never forced: Docker itself refuses what is still in use.
    expect(calls.some((c) => c.includes("-f") || c.includes("--force"))).toBe(
      false,
    );
    expect(r.sites).toEqual([SITE, PREVIEW]);
    expect(r.containers).toHaveLength(2);
    expect(r.images).toHaveLength(3);
    expect(r.pin).toBe(PIN);
    expect(r.failed).toEqual([]);
    for (const p of [SITE, PREVIEW, PIN]) expect(files.has(p)).toBe(false);
  });

  test("another project's files, pin and containers are left alone; the databases are never touched", async () => {
    const { result, calls, files } = setup();
    await result(false);
    expect(files.get(OTHER_SITE)).toBe(siteFile("shop"));
    expect(files.get(OTHER_PREVIEW)).toBe(previewFile("shop-pr-1"));
    expect(files.has("/etc/kit-deploy/images/shop")).toBe(true);
    expect(files.has("/etc/kit-deploy/dbs/kd_hello")).toBe(true);
    const all = calls.map((c) => c.join(" "));
    expect(all.some((c) => /gaby|shop/.test(c))).toBe(false);
    // kit-db is only asked whether the databases exist.
    expect(all.filter((c) => c.startsWith("kit-db"))).toEqual([
      "kit-db url kd_hello",
      "kit-db url kd_hello_preview",
    ]);
  });

  test("the container list is filtered by Docker's labels, and a row of another project is ignored", async () => {
    const { result, calls } = setup({
      "docker ps --all": () => ({
        stdout: listed([
          ["shop-prod-abc1234", "running", "ghcr.io/x/shop:abc1234", "shop"],
        ]),
      }),
    });
    const r = await result(false);
    expect(r.containers).toEqual([]);
    const ps = calls.find((c) => c.join(" ").startsWith("docker ps --all"));
    expect(ps).toContain("--filter=label=dev.fockus.kit-deploy=1");
    expect(ps).toContain(
      "--filter=label=dev.fockus.kit-deploy.project=kd_hello",
    );
    expect(calls.some((c) => c.join(" ").startsWith("docker stop"))).toBe(
      false,
    );
  });

  test("a Caddy file without kit-deploy's header is skipped, not removed", async () => {
    const { result, files } = setup();
    files.set(SITE, "kd-hello.fockus.dev { respond hi }\n");
    const r = await result(false);
    expect(r.sites).toEqual([PREVIEW]);
    expect(r.skipped).toEqual([
      `${SITE}: not written by kit-deploy, left as it is`,
    ]);
    expect(files.has(SITE)).toBe(true);
  });

  test("an image another container still uses is kept", async () => {
    const { result } = setup({
      "docker ps -a": () => ({
        stdout: `gaby\t${REPO}:0ld0000\tsha256:ccc`,
      }),
    });
    const r = await result(false);
    expect(r.images).toEqual([`${REPO}:abc1234`, `${REPO}:def5678`]);
    expect(r.skipped).toEqual([`${REPO}:0ld0000: used by a container, kept`]);
  });

  test("a repository another project also pins keeps its images", async () => {
    const { result, files, calls } = setup();
    files.set("/etc/kit-deploy/images/kd_hello2", `${REPO}\n`);
    const r = await result(false);
    expect(r.images).toEqual([]);
    expect(r.skipped).toEqual([
      `${REPO}: also pinned by another project, images kept`,
    ]);
    expect(calls.some((c) => c.join(" ").startsWith("docker image rm"))).toBe(
      false,
    );
  });

  test("Caddy refusing puts every file back and touches no container", async () => {
    const { send, files, calls } = setup({
      "caddy validate": () => ({ code: 1, stderr: "bad config" }),
    });
    const res = await send("kd_hello", false);
    expect(res).toMatchObject({ ok: false, error: { code: "invalid_config" } });
    expect(files.get(SITE)).toBe(siteFile("kd_hello"));
    expect(files.get(PREVIEW)).toBe(previewFile("kd_hello-pr-3"));
    expect(files.has(PIN)).toBe(true);
    expect(
      calls.some((c) => /^docker (stop|rm|image rm)/.test(c.join(" "))),
    ).toBe(false);
  });

  test("a failed docker rm is reported and the pin is kept for the next run", async () => {
    const { result, files } = setup({
      "docker rm kd_hello-pr-3": () => ({ code: 1, stderr: "device busy" }),
    });
    const r = await result(false);
    expect(r.failed).toEqual([
      "kd_hello-pr-3-def5678: docker rm failed: device busy",
    ]);
    expect(r.containers.map((c) => c.name)).toEqual(["kd_hello-prod-abc1234"]);
    // Its image is still used by the container left behind.
    expect(r.images).not.toContain(`${REPO}:def5678`);
    expect(r.pin).toBeNull();
    expect(files.has(PIN)).toBe(true);
  });

  test("twice: the second run finds nothing and is not an error", async () => {
    const { result, files } = setup();
    await result(false);
    const again = await setupAfter(files);
    expect(again.sites).toEqual([]);
    expect(again.containers).toEqual([]);
    expect(again.pin).toBeNull();
    expect(again.failed).toEqual([]);
  });
});

/** A second run over the files the first left, with Docker emptied of the project. */
async function setupAfter(files: Map<string, string>): Promise<ProjectRemoval> {
  const f = fakeDeps({ "docker image ls": () => ({ stdout: "" }) });
  for (const [k, v] of files) f.files.set(k, v);
  const res = await dispatch(
    new Agent(f.deps),
    f.deps,
    JSON.stringify({
      id: "r2",
      op: "project.remove",
      params: { project: "kd_hello", dryRun: false },
    }),
  );
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  expect(
    f.calls.some((c) => /^(caddy|docker (stop|rm))/.test(c.join(" "))),
  ).toBe(false);
  return res.result as ProjectRemoval;
}

describe("project.remove — protocol", () => {
  test("reserved names and a missing dryRun are refused before anything runs", async () => {
    const { send, calls } = setup();
    expect(await send("kit_deploy", true)).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    const f = fakeDeps();
    const res = await dispatch(
      new Agent(f.deps),
      f.deps,
      JSON.stringify({
        id: "r3",
        op: "project.remove",
        params: { project: "kd_hello" },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect(calls).toEqual([]);
    expect(f.calls).toEqual([]);
  });
});
