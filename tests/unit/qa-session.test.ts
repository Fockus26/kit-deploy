import { describe, expect, test } from "bun:test";
import { PROJECT_NAME } from "../../lib/panel/projects";
import { DEMO_PROJECTS, isLocalQaDatabase } from "../../scripts/qa-session";

describe("qa-session: only this machine's qa_<port> database", () => {
  test("accepts the qa-local URL for the same port", () => {
    expect(
      isLocalQaDatabase(
        "postgresql://qa_app:qa_app@127.0.0.1:55432/qa_4301",
        "4301",
      ),
    ).toBe(true);
    expect(
      isLocalQaDatabase(
        "postgres://qa_app:qa_app@localhost:55432/qa_4301",
        "4301",
      ),
    ).toBe(true);
  });

  test.each([
    ["another host", "postgresql://u:p@db.fockus.dev:5432/qa_4301"],
    [
      "the migrations tunnel's real database",
      "postgresql://u:p@127.0.0.1:5433/kit_deploy",
    ],
    ["another slot's database", "postgresql://u:p@127.0.0.1:55432/qa_4302"],
    ["a longer name", "postgresql://u:p@127.0.0.1:55432/qa_43010"],
    [
      "a host hidden in userinfo",
      "postgresql://127.0.0.1@evil.example:5432/qa_4301",
    ],
    [
      "query options",
      "postgresql://u:p@127.0.0.1:55432/qa_4301?host=evil.example",
    ],
    ["not a URL", "qa_4301"],
    ["another protocol", "mysql://u:p@127.0.0.1:3306/qa_4301"],
  ])("refuses %s", (_, url) => {
    expect(isLocalQaDatabase(url, "4301")).toBe(false);
  });
});

test("the demo projects pass the projects_name_format check", () => {
  for (const p of DEMO_PROJECTS) expect(PROJECT_NAME.test(p.name)).toBe(true);
  expect(DEMO_PROJECTS.some((p) => p.name.length === 40)).toBe(true);
});
