import { describe, expect, test } from "bun:test";
import {
  dockerRunArgs,
  maxOldSpaceMb,
  type RunInput,
} from "../../lib/core/docker";
import { containerName, previewHost, siteName } from "../../lib/core/target";
import { CoreInputError } from "../../lib/core/validate";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const base: RunInput = {
  target: { project: "kd_hello", env: "production" },
  sha: SHA,
  image: `ghcr.io/cesar/kd-hello:${SHA}`,
  port: 20417,
  memoryMb: 512,
};

describe("dockerRunArgs", () => {
  test("production run args", () => {
    expect(dockerRunArgs(base)).toEqual([
      "run",
      "--detach",
      "--name",
      "kd_hello-prod-3f2a9c1e7b4d",
      "--memory=512m",
      "--memory-swap=512m",
      "--user=1001:1001",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=256",
      "--publish=127.0.0.1:20417:3000",
      "--add-host=db.fockus.dev:host-gateway",
      "--restart=unless-stopped",
      "--log-driver=json-file",
      "--log-opt=max-size=10m",
      "--log-opt=max-file=3",
      "--label=dev.fockus.kit-deploy=1",
      "--label=dev.fockus.kit-deploy.site=kd_hello",
      "--label=dev.fockus.kit-deploy.project=kd_hello",
      "--label=dev.fockus.kit-deploy.env=production",
      `--label=dev.fockus.kit-deploy.sha=${SHA}`,
      "--label=dev.fockus.kit-deploy.port=20417",
      "--env=NODE_OPTIONS=--max-old-space-size=384",
      "--env=PORT=3000",
      "--env=HOSTNAME=0.0.0.0",
      `ghcr.io/cesar/kd-hello:${SHA}`,
    ]);
  });

  test("never publishes on all interfaces (D016)", () => {
    const publish = dockerRunArgs(base).filter((a) =>
      a.startsWith("--publish"),
    );
    expect(publish).toEqual(["--publish=127.0.0.1:20417:3000"]);
  });

  test("the image is the last argument and nothing after it", () => {
    const args = dockerRunArgs({
      ...base,
      envFile: "/etc/kit-deploy/env/kd_hello.env",
    });
    expect(args.at(-1)).toBe(base.image);
    expect(args).toContain("--env-file=/etc/kit-deploy/env/kd_hello.env");
    expect(
      args.indexOf("--env-file=/etc/kit-deploy/env/kd_hello.env"),
    ).toBeLessThan(args.indexOf("--env=NODE_OPTIONS=--max-old-space-size=384"));
  });

  test("a preview's name and labels", () => {
    const args = dockerRunArgs({
      ...base,
      target: { project: "kd_hello", env: "preview", pr: 7 },
      memoryMb: 384,
    });
    expect(args).toContain("kd_hello-pr-7-3f2a9c1e7b4d");
    expect(args).toContain("--label=dev.fockus.kit-deploy.site=kd_hello-pr-7");
    expect(args).toContain("--label=dev.fockus.kit-deploy.env=preview");
    expect(args).toContain("--memory=384m");
    expect(args).toContain("--env=NODE_OPTIONS=--max-old-space-size=288");
  });

  test("a preview knows its own origin, after the env file and before the image", () => {
    const args = dockerRunArgs({
      ...base,
      target: { project: "kd_hello", env: "preview", pr: 7 },
      memoryMb: 384,
      envFile: "/etc/kit-deploy/env/kd_hello-pr-7.env",
    });
    const url =
      "--env=KIT_DEPLOY_PREVIEW_URL=https://kd-hello-pr-7.preview.fockus.dev";
    expect(args).toContain(url);
    expect(args.indexOf(url)).toBeGreaterThan(
      args.indexOf("--env-file=/etc/kit-deploy/env/kd_hello-pr-7.env"),
    );
    expect(args.at(-1)).toBe(base.image);
  });

  test("production gets no preview origin", () => {
    expect(
      dockerRunArgs(base).some((a) => a.includes("KIT_DEPLOY_PREVIEW_URL")),
    ).toBe(false);
  });

  test("accepts an image pinned by digest", () => {
    const image = `ghcr.io/cesar/kd-hello@sha256:${"a".repeat(64)}`;
    expect(dockerRunArgs({ ...base, image }).at(-1)).toBe(image);
  });

  test.each<[string, Partial<RunInput>]>([
    ["an image starting with -", { image: "--privileged" }],
    ["an image with a space", { image: "ghcr.io/a b" }],
    ["an empty image", { image: "" }],
    ["a short sha", { sha: "abc" }],
    ["a non-hex sha", { sha: "zzzzzzzz" }],
    ["memory below the floor", { memoryMb: 64 }],
    ["memory above the ceiling", { memoryMb: 4096 }],
    ["a port outside D016", { port: 8080 }],
    ["a relative env file", { envFile: "env/kd_hello.env" }],
    ["an env file with ..", { envFile: "/etc/kit-deploy/../shadow" }],
    ["an env file with a space", { envFile: "/tmp/a b" }],
    [
      "a PR number of 0",
      { target: { project: "kd_hello", env: "preview", pr: 0 } },
    ],
  ])("rejects %s", (_, partial) => {
    expect(() => dockerRunArgs({ ...base, ...partial })).toThrow(
      CoreInputError,
    );
  });
});

describe("names", () => {
  test("siteName / containerName / previewHost", () => {
    expect(siteName({ project: "kd_hello", env: "production" })).toBe(
      "kd_hello",
    );
    expect(siteName({ project: "kd_hello", env: "preview", pr: 3 })).toBe(
      "kd_hello-pr-3",
    );
    expect(
      containerName({ project: "maranatha", env: "production" }, "abcdef1"),
    ).toBe("maranatha-prod-abcdef1");
    expect(previewHost("kd_hello", 3)).toBe("kd-hello-pr-3.preview.fockus.dev");
  });

  test("maxOldSpaceMb is ~75 % of the limit", () => {
    expect(maxOldSpaceMb(256)).toBe(192);
    expect(maxOldSpaceMb(500)).toBe(375);
  });
});
