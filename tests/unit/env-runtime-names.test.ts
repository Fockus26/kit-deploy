import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import { deriveEnvKey, seal } from "../../lib/core/crypto";
import { assertEnvName, RUNTIME_NAME_RE } from "../../lib/core/env";
import { CoreInputError } from "../../lib/core/validate";
import { fakeDeps } from "./agent-fakes";

// Security review F1: a row that steers the runtime would make a pinned container leak its secrets.
const RUNTIME = [
  "PATH",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_USE_ENV_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "NODE_ENV",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "OPENSSL_CONF",
  "UV_THREADPOOL_SIZE",
  "BUN_CONFIG_REGISTRY",
];
const APP = [
  "BREVO_API_KEY",
  "API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PROXY_MODE",
  "MY_NODE_URL",
  "PATHS",
  "AUTH_SECRET",
];

describe("runtime names", () => {
  test("refused", () => {
    for (const n of RUNTIME) {
      expect(() => assertEnvName(n)).toThrow(CoreInputError);
      expect(RUNTIME_NAME_RE.test(n)).toBe(true);
    }
  });

  test("the app's own names are not caught", () => {
    for (const n of APP) expect(assertEnvName(n)).toBe(n);
  });

  test("env.seal refuses them", async () => {
    const f = fakeDeps();
    f.files.set(MASTER_KEY, randomBytes(32).toString("base64"));
    const agent = new Agent(f.deps);
    const res = await dispatch(
      agent,
      f.deps,
      JSON.stringify({
        id: "1",
        op: "env.seal",
        params: {
          project: "kd_hello",
          environment: "production",
          name: "HTTPS_PROXY",
          secret: false,
          value: "http://attacker:3128",
        },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  test("a row put into the database by hand does not reach the container", async () => {
    const master = randomBytes(32).toString("base64");
    const f = fakeDeps({ "docker run": () => ({ stdout: "abc\n" }) });
    f.files.set(MASTER_KEY, master);
    f.files.set("/etc/kit-deploy/images/kd_hello", "ghcr.io/cesar/kd-hello\n");
    const agent = new Agent(f.deps);
    const sha = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
    const slot = {
      project: "kd_hello",
      environment: "production" as const,
      name: "NODE_TLS_REJECT_UNAUTHORIZED",
      secret: false,
    };
    const res = await dispatch(
      agent,
      f.deps,
      JSON.stringify({
        id: "1",
        op: "container.run",
        params: {
          target: { project: "kd_hello", env: "production" },
          sha,
          image: `ghcr.io/cesar/kd-hello:${sha}`,
          port: 20417,
          memoryMb: 512,
          vars: [
            {
              name: slot.name,
              secret: false,
              sealed: seal(deriveEnvKey(master), slot, "0"),
            },
          ],
        },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect(f.calls.some((c) => c[1] === "run")).toBe(false);
  });
});
