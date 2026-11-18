import { describe, expect, test } from "bun:test";
import { projectMissing, projectOfPath } from "../../lib/panel/project-gate";

const known = (name: string) => Promise.resolve(name === "maranatha");

describe("project gate: /p/<unknown> is a 404 before streaming", () => {
  test("which paths name a project", () => {
    expect(projectOfPath("/p/maranatha")).toBe("maranatha");
    expect(projectOfPath("/p/maranatha/deployments")).toBe("maranatha");
    expect(projectOfPath("/p/%E0%A4%A")).toBe("%E0%A4%A");
    expect(projectOfPath("/")).toBeNull();
    expect(projectOfPath("/p")).toBeNull();
    expect(projectOfPath("/new")).toBeNull();
    expect(projectOfPath("/pp/maranatha")).toBeNull();
  });

  test("a known project passes, an unknown one is missing", async () => {
    expect(await projectMissing("/p/maranatha", known)).toBe(false);
    expect(await projectMissing("/p/maranatha/env", known)).toBe(false);
    expect(await projectMissing("/p/nope", known)).toBe(true);
  });

  test("a malformed name never reaches the database", async () => {
    const boom = () => Promise.reject(new Error("must not be asked"));
    expect(await projectMissing("/p/Nope", boom)).toBe(true);
    expect(await projectMissing("/p/a-b", boom)).toBe(true);
    expect(await projectMissing(`/p/${"a".repeat(41)}`, boom)).toBe(true);
  });

  test("other pages are not its business", async () => {
    expect(await projectMissing("/", known)).toBe(false);
    expect(await projectMissing("/settings", known)).toBe(false);
  });

  test("a database that does not answer fails open", async () => {
    const down = () => Promise.reject(new Error("ECONNREFUSED"));
    expect(await projectMissing("/p/maranatha", down)).toBe(false);
  });
});
