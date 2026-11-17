import { describe, expect, test } from "bun:test";
import type { AgentClient } from "../../cli/client";
import { type CliContext, runCli } from "../../cli/commands";
import { defaultHost } from "../../lib/core/target";
import {
  AdminError,
  type AdminStore,
  type NewProject,
} from "../../lib/db/admin";
import { hashToken } from "../../lib/tokens";

const agent: AgentClient = {
  async call() {
    throw new Error("the agent is not used here");
  },
};

function memoryAdmin() {
  const projects: NewProject[] = [];
  const domains: Array<{ project: string; host: string }> = [];
  const tokens: Array<{ project: string; hash: string; label: string }> = [];
  const store: AdminStore = {
    async addProject(p) {
      if (projects.some((x) => x.name === p.name))
        throw new AdminError(`a project named ${p.name} already exists`);
      projects.push(p);
      return { id: `p${projects.length}` };
    },
    async addDomain(project, host) {
      if (!projects.some((p) => p.name === project))
        throw new AdminError(`no project ${project}`);
      domains.push({ project, host });
    },
    async projectRepo(project) {
      return projects.find((p) => p.name === project)?.repo ?? null;
    },
    async addToken(project, hash, label) {
      if (!projects.some((p) => p.name === project))
        throw new AdminError(`no project ${project}`);
      tokens.push({ project, hash, label });
      return { id: `t${tokens.length}` };
    },
  };
  return { store, projects, domains, tokens };
}

function cli(stdoutIsTTY = false, isRoot = true) {
  const m = memoryAdmin();
  const pins = new Map<string, string>();
  const ctx: CliContext = {
    admin: () => m.store,
    stdoutIsTTY,
    pins: {
      isRoot,
      async write(project, pin) {
        pins.set(project, pin);
      },
    },
  };
  return { ...m, pins, run: (argv: string[]) => runCli(argv, agent, ctx) };
}

describe("defaultHost", () => {
  test("<project>.fockus.dev with _ as -", () => {
    expect(defaultHost("kd_hello")).toBe("kd-hello.fockus.dev");
    expect(defaultHost("maranatha")).toBe("maranatha.fockus.dev");
  });
  test.each(["deploy", "db", "preview", "www", "a_"])("none for %p", (p) => {
    expect(defaultHost(p)).toBeNull();
  });
});

describe("kit-deploy project add", () => {
  test("registers the project with its default domain", async () => {
    const c = cli();
    expect(
      await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]),
    ).toEqual({
      code: 0,
      out: "added kd_hello (Fockus26/kd-hello), 512 MB, domains: kd-hello.fockus.dev\n",
      err: "",
    });
    expect(c.projects).toEqual([
      {
        name: "kd_hello",
        repo: "Fockus26/kd-hello",
        memoryMb: 512,
        hosts: ["kd-hello.fockus.dev"],
      },
    ]);
  });

  test("own domains, memory, and no default domain", async () => {
    const c = cli();
    const r = await c.run([
      "project",
      "add",
      "maranatha",
      "Fockus26/maranatha",
      "--memory",
      "384",
      "--domain",
      "Maranatha.org",
      "--domain",
      "www.maranatha.org",
      "--no-default-domain",
    ]);
    expect(r.code).toBe(0);
    expect(c.projects[0]).toEqual({
      name: "maranatha",
      repo: "Fockus26/maranatha",
      memoryMb: 384,
      hosts: ["maranatha.org", "www.maranatha.org"],
    });
  });

  test.each([
    [["project", "add"]],
    [["project", "add", "KD", "a/b"]],
    [["project", "add", "kd", "not-a-repo"]],
    [["project", "add", "kd", "a/../b"]],
    [["project", "add", "kd", "a/b", "--memory", "64"]],
    [["project", "add", "kd", "a/b", "--memory"]],
    [["project", "add", "kd", "a/b", "--domain", "db.fockus.dev"]],
    [["project", "add", "kd", "a/b", "--domain", "a b.dev"]],
    [["project", "add", "kd", "a/b", "--bogus"]],
    [["project", "add", "deploy", "a/b"]],
    [["project", "list"]],
  ])("usage errors exit 2 and store nothing: %p", async (argv) => {
    const c = cli();
    expect((await c.run(argv)).code).toBe(2);
    expect(c.projects).toEqual([]);
  });

  test("a duplicate is an error with the reason", async () => {
    const c = cli();
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    expect(
      await c.run(["project", "add", "kd_hello", "Fockus26/other"]),
    ).toMatchObject({
      code: 1,
      err: "a project named kd_hello already exists\n",
    });
  });
});

describe("kit-deploy domain add", () => {
  test("adds a host; an unknown project fails", async () => {
    const c = cli();
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    expect(
      (await c.run(["domain", "add", "kd_hello", "Hola.Example.com"])).code,
    ).toBe(0);
    expect(c.domains).toEqual([
      { project: "kd_hello", host: "hola.example.com" },
    ]);
    expect((await c.run(["domain", "add", "nope", "x.example.com"])).code).toBe(
      1,
    );
  });
});

describe("kit-deploy token create", () => {
  test("stdout is the token and nothing else; only its hash is stored", async () => {
    const c = cli();
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    const r = await c.run([
      "token",
      "create",
      "kd_hello",
      "--label",
      "github actions",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^kdt_[A-Za-z0-9_-]{43}\n$/);
    const token = r.out.trim();
    expect(r.err).not.toContain(token);
    expect(c.tokens).toEqual([
      { project: "kd_hello", hash: hashToken(token), label: "github actions" },
    ]);
    expect(JSON.stringify(c.tokens)).not.toContain(token);
  });

  test("never to a terminal without --show", async () => {
    const c = cli(true);
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    const r = await c.run(["token", "create", "kd_hello"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toContain("gh secret set KIT_DEPLOY_TOKEN");
    expect(c.tokens).toEqual([]);
    expect(
      (await c.run(["token", "create", "kd_hello", "--show"])).out,
    ).toMatch(/^kdt_/);
  });

  test("an unknown project creates nothing", async () => {
    const c = cli();
    const r = await c.run(["token", "create", "nope"]);
    expect(r).toMatchObject({ code: 1, out: "", err: "no project nope\n" });
  });
});

describe("image pins (project add / project pin)", () => {
  test("project add as root pins the typed repository", async () => {
    const c = cli();
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    expect([...c.pins]).toEqual([["kd_hello", "ghcr.io/fockus26/kd-hello"]]);
  });

  test("project add not as root: registered, not pinned, and told how", async () => {
    const c = cli(false, false);
    const r = await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    expect(r.code).toBe(0);
    expect(r.err).toContain(
      "kit-deploy project pin kd_hello Fockus26/kd-hello",
    );
    expect(c.pins.size).toBe(0);
  });

  test("project pin: typed repo, must match the database", async () => {
    const c = cli();
    await c.run(["project", "add", "kd_hello", "Fockus26/kd-hello"]);
    c.pins.clear();
    expect(
      (await c.run(["project", "pin", "kd_hello", "Fockus26/kd-hello"])).code,
    ).toBe(0);
    expect(c.pins.get("kd_hello")).toBe("ghcr.io/fockus26/kd-hello");
    c.pins.clear();
    const other = await c.run(["project", "pin", "kd_hello", "attacker/dump"]);
    expect(other.code).toBe(1);
    expect(other.err).toContain("deploys Fockus26/kd-hello in the database");
    expect(c.pins.size).toBe(0);
  });

  test("project pin refuses without root, unknown projects and bad input", async () => {
    const notRoot = cli(false, false);
    expect(
      (await notRoot.run(["project", "pin", "kd_hello", "Fockus26/kd-hello"]))
        .err,
    ).toContain("needs root");
    const c = cli();
    expect(
      (await c.run(["project", "pin", "nope", "Fockus26/kd-hello"])).err,
    ).toBe("no project nope\n");
    expect((await c.run(["project", "pin", "kd_hello"])).code).toBe(2);
    expect((await c.run(["project", "pin", "kd_hello", "a/b/c"])).code).toBe(2);
    expect(c.pins.size).toBe(0);
  });
});
