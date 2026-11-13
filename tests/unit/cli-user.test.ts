import { describe, expect, test } from "bun:test";
import type { AgentClient } from "../../cli/client";
import { type CliContext, runCli } from "../../cli/commands";
import { ENROL_LINK_TTL_MS } from "../../lib/auth/enrolment";
import { AdminError } from "../../lib/db/admin";
import type { UserStore } from "../../lib/db/users";
import { hashToken } from "../../lib/tokens";

const agent: AgentClient = {
  async call() {
    throw new Error("the agent is not used here");
  },
};

const NOW = Date.parse("2026-11-13T12:00:00Z");

function memoryUsers() {
  const users: string[] = [];
  const links: Array<{ email: string; hash: string; expiresAt: Date }> = [];
  const store: UserStore = {
    async createUser(email, hash, expiresAt) {
      if (users.length) throw new AdminError("an account already exists");
      users.push(email);
      links.push({ email, hash, expiresAt });
      return { id: `u${users.length}` };
    },
    async issueEnrolment(email, hash, expiresAt) {
      if (!users.includes(email)) throw new AdminError(`no account ${email}`);
      links.push({ email, hash, expiresAt });
      return { id: "u1" };
    },
  };
  return { store, users, links };
}

function cli(stdoutIsTTY = true) {
  const m = memoryUsers();
  const ctx: CliContext = { users: () => m.store, stdoutIsTTY, now: () => NOW };
  return { ...m, run: (argv: string[]) => runCli(argv, agent, ctx) };
}

const LINK = /https:\/\/deploy\.fockus\.dev\/enrol#(kde_[A-Za-z0-9_-]{43})/;

describe("kit-deploy user create", () => {
  test("creates the account and prints a one-time link; only its hash is stored", async () => {
    const c = cli();
    const r = await c.run(["user", "create", "Cesar@Example.com"]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    const token = LINK.exec(r.out)?.[1] ?? "";
    expect(token).not.toBe("");
    expect(r.out).toContain("within 15 minutes");
    expect(c.users).toEqual(["cesar@example.com"]);
    expect(c.links).toEqual([
      {
        email: "cesar@example.com",
        hash: hashToken(token),
        expiresAt: new Date(NOW + ENROL_LINK_TTL_MS),
      },
    ]);
    expect(JSON.stringify(c.links)).not.toContain(token);
  });

  test("never to a pipe: the link is a credential", async () => {
    const c = cli(false);
    const r = await c.run(["user", "create", "cesar@example.com"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toContain(
      "ssh -t kit-vps kit-deploy user create cesar@example.com",
    );
    expect(c.users).toEqual([]);
  });

  test("one account in v1", async () => {
    const c = cli();
    await c.run(["user", "create", "cesar@example.com"]);
    const r = await c.run(["user", "create", "otro@example.com"]);
    expect(r).toEqual({ code: 1, out: "", err: "an account already exists\n" });
  });

  test.each([
    [["user"]],
    [["user", "create"]],
    [["user", "create", "a@b.co", "extra"]],
    [["user", "delete", "a@b.co"]],
  ])("usage errors: %p", async (argv) => {
    expect((await cli().run(argv)).code).toBe(2);
  });

  test.each([
    "nope",
    "a@b",
    "a b@c.dev",
    `${"a".repeat(250)}@b.co`,
  ])("invalid email %p", async (email) => {
    const r = await cli().run(["user", "create", email]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("invalid email");
  });
});

describe("kit-deploy user enrol", () => {
  test("a new link for an existing account", async () => {
    const c = cli();
    await c.run(["user", "create", "cesar@example.com"]);
    const r = await c.run(["user", "enrol", "cesar@example.com"]);
    expect(r.code).toBe(0);
    expect(r.out).toStartWith("new link for cesar@example.com.");
    expect(c.links).toHaveLength(2);
    expect(c.links[1]?.hash).toBe(hashToken(LINK.exec(r.out)?.[1] ?? ""));
    expect(c.links[1]?.hash).not.toBe(c.links[0]?.hash);
  });

  test("no such account", async () => {
    const r = await cli().run(["user", "enrol", "x@example.com"]);
    expect(r).toEqual({ code: 1, out: "", err: "no account x@example.com\n" });
  });
});
