import { describe, expect, test } from "bun:test";
import {
  isPublicPath,
  loginPathFor,
  safeNextPath,
} from "../../lib/auth/next-path";

describe("safeNextPath", () => {
  test("keeps a same-origin path with its query and fragment", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/projects/kd-hello")).toBe("/projects/kd-hello");
    expect(
      safeNextPath(
        "/preview-access?to=https%3A%2F%2Fkd-hello-pr-7.preview.fockus.dev%2F",
      ),
    ).toBe(
      "/preview-access?to=https%3A%2F%2Fkd-hello-pr-7.preview.fockus.dev%2F",
    );
    expect(safeNextPath("/logs#tail")).toBe("/logs#tail");
  });

  test("normalizes dot segments without leaving the origin", () => {
    expect(safeNextPath("/a/../b")).toBe("/b");
    expect(safeNextPath("/../../etc")).toBe("/etc");
  });

  test.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example/"],
    ["http://deploy.fockus.dev/"],
    ["//evil.example"],
    ["//evil.example/path"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/.//evil.example"],
    ["/a/..//evil.example"],
    ["/%2e//evil.example"],
    ["/%2E%2E//evil.example/x"],
    ["javascript:alert(1)"],
    ["evil.example"],
    ["projects"],
    ["?next=/x"],
    [" /x"],
    [`/${"a".repeat(2048)}`],
  ])("refuses %p → /", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  test.each([
    ["/%2F%2Fevil.example"],
    ["/%2f%2fevil.example"],
    ["/%5Cevil.example"],
    ["/%5c%5cevil.example"],
    ["/%09/evil.example"],
    ["/%0a//evil.example"],
    ["/%0D%0A/evil.example"],
    ["/%7f/evil.example"],
    ["/./%2F/evil.example"],
  ])("refuses the encoded variant %p → /", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  test("the result is never protocol-relative, for any dot-segment mix", () => {
    for (const prefix of [
      "/.",
      "/./.",
      "/a/..",
      "/a/b/../..",
      "/%2e",
      "/%2E%2E",
      "/.%2e",
    ]) {
      for (const rest of [
        "//evil.example",
        "///evil.example",
        "/evil.example",
      ]) {
        const out = safeNextPath(prefix + rest);
        expect(out.startsWith("//") || out.includes("\\")).toBe(false);
      }
    }
  });

  test("a query or fragment may hold anything: it never becomes the host", () => {
    expect(safeNextPath("/x?u=//evil.example")).toBe("/x?u=//evil.example");
    expect(safeNextPath("/x#//evil.example")).toBe("/x#//evil.example");
  });

  test("never sends a fresh session back to the sign-in pages", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath("/enrol")).toBe("/");
    expect(safeNextPath("/enrol/")).toBe("/");
  });
});

describe("isPublicPath / loginPathFor", () => {
  test("only /login and /enrol are public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/enrol")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/login-x")).toBe(false);
    expect(isPublicPath("/enrolment")).toBe(false);
  });

  test("carries where the visitor was going", () => {
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor("/projects/kd-hello", "?tab=logs")).toBe(
      "/login?next=%2Fprojects%2Fkd-hello%3Ftab%3Dlogs",
    );
    expect(loginPathFor("//evil.example")).toBe("/login");
  });
});
