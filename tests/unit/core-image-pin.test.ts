import { describe, expect, test } from "bun:test";
import {
  imageMatchesPin,
  parsePin,
  pinFor,
  pinPath,
} from "../../lib/core/image-pin";
import { CoreInputError } from "../../lib/core/validate";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";

describe("image pins", () => {
  test("pinFor lowercases like imageFor, and refuses a bad repo", () => {
    expect(pinFor("Fockus26/kd-hello")).toBe("ghcr.io/fockus26/kd-hello");
    for (const bad of ["kd-hello", "a/b/c", "../x", "a/ b", ".a/b"]) {
      expect(() => pinFor(bad)).toThrow(CoreInputError);
    }
  });

  test("pinPath is one file per valid project", () => {
    expect(pinPath("kd_hello")).toBe("/etc/kit-deploy/images/kd_hello");
    expect(() => pinPath("../etc")).toThrow(CoreInputError);
  });

  test("parsePin", () => {
    expect(parsePin("ghcr.io/fockus26/kd-hello\n")).toBe(
      "ghcr.io/fockus26/kd-hello",
    );
    for (const bad of [
      null,
      "",
      "ghcr.io/",
      "docker.io/a/b",
      "ghcr.io/A/b",
      "ghcr.io/a/b/c",
    ]) {
      expect(parsePin(bad)).toBeNull();
    }
  });

  test("imageMatchesPin: that repository by tag and/or digest, nothing else", () => {
    const pin = "ghcr.io/fockus26/kd-hello";
    const digest = `@sha256:${"a".repeat(64)}`;
    for (const ok of [
      `${pin}:${SHA}`,
      `${pin}${digest}`,
      `${pin}:${SHA}${digest}`,
    ]) {
      expect(imageMatchesPin(ok, pin)).toBe(true);
    }
    for (const bad of [
      pin,
      `${pin}-evil:${SHA}`,
      `${pin}/sub:${SHA}`,
      `ghcr.io/attacker/kd-hello:${SHA}`,
      `${pin}:a b`,
      `${pin}@sha256:short`,
    ]) {
      expect(imageMatchesPin(bad, pin)).toBe(false);
    }
  });
});
