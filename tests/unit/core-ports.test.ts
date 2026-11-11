import { describe, expect, test } from "bun:test";
import { allocatePort } from "../../lib/core/ports";
import { CoreInputError } from "../../lib/core/validate";

describe("allocatePort", () => {
  test("is deterministic and inside D016's range", () => {
    const a = allocatePort("kd_hello-prod-3f2a9c1e7b4d", []);
    expect(allocatePort("kd_hello-prod-3f2a9c1e7b4d", [])).toBe(a);
    expect(a).toBeGreaterThanOrEqual(20000);
    expect(a).toBeLessThanOrEqual(29999);
  });

  test("different keys usually land on different ports", () => {
    const ports = new Set(
      Array.from({ length: 50 }, (_, i) => allocatePort(`site-${i}`, [])),
    );
    expect(ports.size).toBeGreaterThan(45);
  });

  test("skips a used port to the next free one", () => {
    const key = "kd_hello-prod-aaaaaaaaaaaa";
    const first = allocatePort(key, []);
    expect(allocatePort(key, [first])).toBe(
      first === 29999 ? 20000 : first + 1,
    );
  });

  test("never returns a used port, wrapping at the top of the range", () => {
    const range = { min: 20000, max: 20004 };
    const key = "x";
    const all = [20000, 20001, 20002, 20003, 20004];
    const start = allocatePort(key, [], range);
    // The port just before the start (wrapping) is the last one probed: leave only that free.
    const free = start === range.min ? range.max : start - 1;
    const taken = all.filter((p) => p !== free);
    expect(allocatePort(key, taken, range)).toBe(free);
  });

  test("the new container of a switch never gets the old one's port", () => {
    const old = allocatePort("kd_hello-prod-111111111111", []);
    const next = allocatePort("kd_hello-prod-222222222222", [old]);
    expect(next).not.toBe(old);
  });

  test("throws when the range is full", () => {
    const range = { min: 20000, max: 20002 };
    expect(() => allocatePort("k", [20000, 20001, 20002], range)).toThrow(
      CoreInputError,
    );
  });

  test("rejects an empty key or an inverted range", () => {
    expect(() => allocatePort("", [])).toThrow(CoreInputError);
    expect(() => allocatePort("k", [], { min: 20010, max: 20000 })).toThrow(
      CoreInputError,
    );
  });
});
