import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dispatch } from "../../agent/dispatch";
import { Agent, ENV_FILES_DIR, MASTER_KEY } from "../../agent/ops";
import { deriveEnvKey, type EnvSlot, seal } from "../../lib/core/crypto";
import { fakeDeps } from "./agent-fakes";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const MASTER = randomBytes(32).toString("base64");
const KEY = deriveEnvKey(MASTER);
const SECRET = "xkeysib-only-inside-the-container";

const sealed = (slot: Omit<EnvSlot, "project">, value: string) => ({
  name: slot.name,
  secret: slot.secret,
  sealed: seal(KEY, { project: "kd_hello", ...slot }, value),
});

function setup(
  dockerRun: () => {
    code?: number;
    stdout?: string;
    stderr?: string;
  } = () => ({ stdout: "abc\n" }),
) {
  const f = fakeDeps({ "docker run": dockerRun });
  f.files.set(MASTER_KEY, MASTER);
  // What the env file held at the moment `docker run` ran.
  const atRun: (string | null)[] = [];
  const realRun = f.deps.run;
  f.deps.run = async (argv, opts) => {
    if (argv[1] === "run") {
      const flag = argv.find((a) => a.startsWith("--env-file="));
      atRun.push(
        flag ? (f.files.get(flag.slice("--env-file=".length)) ?? null) : null,
      );
    }
    return realRun(argv, opts);
  };
  const agent = new Agent(f.deps);
  const send = (params: Record<string, unknown>) =>
    dispatch(
      agent,
      f.deps,
      JSON.stringify({
        id: "1",
        op: "container.run",
        params: {
          target: { project: "kd_hello", env: "production" },
          sha: SHA,
          image: `ghcr.io/cesar/kd-hello:${SHA}`,
          port: 20417,
          memoryMb: 512,
          ...params,
        },
      }),
    );
  return { ...f, send, atRun };
}

const FILE = `${ENV_FILES_DIR}/kd_hello-prod-3f2a9c1e7b4d.env`;

describe("container.run with variables", () => {
  test("secrets and plain values reach docker through a private env file, removed after", async () => {
    const s = setup();
    const res = await s.send({
      vars: [
        sealed(
          { environment: "production", name: "BREVO_API_KEY", secret: true },
          SECRET,
        ),
        sealed(
          {
            environment: "production",
            name: "NEXT_PUBLIC_SITE_URL",
            secret: false,
          },
          "https://kd-hello.fockus.dev",
        ),
      ],
    });
    expect(res).toMatchObject({ ok: true });
    expect(s.privateFiles.map((p) => p.path)).toEqual([FILE]);
    expect(s.atRun).toEqual([
      `BREVO_API_KEY=${SECRET}\nNEXT_PUBLIC_SITE_URL=https://kd-hello.fockus.dev\n`,
    ]);
    const argv = s.calls.find((c) => c[1] === "run") ?? [];
    expect(argv).toContain(`--env-file=${FILE}`);
    // --env after --env-file: the platform's PORT/HOSTNAME/NODE_OPTIONS still win.
    expect(argv.indexOf(`--env-file=${FILE}`)).toBeLessThan(
      argv.indexOf("--env=PORT=3000"),
    );
    expect(argv.join(" ")).not.toContain("xkeysib");
    expect(s.files.has(FILE)).toBe(false);
    expect(JSON.stringify([res, s.logs])).not.toContain("xkeysib");
  });

  test("the file is removed when docker run fails too", async () => {
    const s = setup(() => ({ code: 125, stderr: "no such image" }));
    const res = await s.send({
      vars: [
        sealed({ environment: "production", name: "A", secret: true }, SECRET),
      ],
    });
    expect(res).toMatchObject({ ok: false, error: { code: "command_failed" } });
    expect(s.files.has(FILE)).toBe(false);
  });

  test("no variables: no env file", async () => {
    for (const params of [{}, { vars: [] }]) {
      const s = setup();
      expect(await s.send(params)).toMatchObject({ ok: true });
      expect(s.privateFiles).toEqual([]);
      expect(
        (s.calls.find((c) => c[1] === "run") ?? []).join(" "),
      ).not.toContain("--env-file");
    }
  });

  test.each([
    [
      "a preview row in production",
      { environment: "preview", name: "A", secret: true },
    ],
    [
      "a development row in production",
      { environment: "development", name: "A", secret: true },
    ],
  ] as const)("refuses %s: nothing written, nothing started", async (_, slot) => {
    const s = setup();
    const res = await s.send({ vars: [sealed(slot, SECRET)] });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "bad_request", message: "A cannot be decrypted" },
    });
    expect(s.privateFiles).toEqual([]);
    expect(s.calls.some((c) => c[1] === "run")).toBe(false);
  });

  test("another project's row, a managed name or a duplicate: nothing started", async () => {
    const other = {
      name: "A",
      secret: true,
      sealed: seal(
        KEY,
        {
          project: "maranatha",
          environment: "production",
          name: "A",
          secret: true,
        },
        "v",
      ),
    };
    const good = sealed(
      { environment: "production", name: "B", secret: false },
      "v",
    );
    for (const vars of [
      [other],
      [{ ...good, name: "DATABASE_URL" }],
      [good, good],
    ]) {
      const s = setup();
      const res = await s.send({ vars });
      expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
      expect(s.calls.some((c) => c[1] === "run")).toBe(false);
    }
  });

  test("a preview target opens preview rows", async () => {
    const s = setup();
    const res = await s.send({
      target: { project: "kd_hello", env: "preview", pr: 7 },
      vars: [sealed({ environment: "preview", name: "A", secret: true }, "pv")],
    });
    expect(res).toMatchObject({ ok: true });
    expect(s.privateFiles[0]?.path).toBe(
      `${ENV_FILES_DIR}/kd_hello-pr-7-3f2a9c1e7b4d.env`,
    );
    expect(s.atRun).toEqual(["A=pv\n"]);
  });
});
