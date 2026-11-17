import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import { MAX_REQUEST_BYTES, MAX_VARS } from "../../agent/protocol";
import type { Sealed } from "../../lib/core/crypto";
import { fakeDeps } from "./agent-fakes";

const MASTER = `${randomBytes(32).toString("base64")}\n`;
const SECRET_VALUE = "xkeysib-do-not-leak-0123456789";

function setup(master: string | null = MASTER) {
  const f = fakeDeps();
  if (master !== null) f.files.set(MASTER_KEY, master);
  const agent = new Agent(f.deps);
  let n = 0;
  const send = (op: string, params: unknown) =>
    dispatch(agent, f.deps, JSON.stringify({ id: `r${++n}`, op, params }));
  return { ...f, send };
}

type Ok<T> = { ok: true; result: T };
type Fail = { ok: false; error: { code: string; message: string } };

async function sealed(
  send: ReturnType<typeof setup>["send"],
  p: { environment: string; name: string; secret: boolean; value: string },
): Promise<Sealed> {
  const r = (await send("env.seal", {
    project: "kd_hello",
    ...p,
  })) as Ok<Sealed>;
  expect(r.ok).toBe(true);
  return r.result;
}

describe("env.seal", () => {
  test("returns a blob, not the value, and logs no value", async () => {
    const { send, logs } = setup();
    const s = await sealed(send, {
      environment: "production",
      name: "BREVO_API_KEY",
      secret: true,
      value: SECRET_VALUE,
    });
    expect(Object.keys(s).sort()).toEqual([
      "ciphertext",
      "iv",
      "keyVersion",
      "tag",
    ]);
    expect(JSON.stringify(s)).not.toContain("xkeysib");
    expect(JSON.stringify(logs)).not.toContain("xkeysib");
  });

  test.each([
    ["a managed name", { name: "DATABASE_URL", secret: true, value: "x" }],
    ["a reserved name", { name: "PORT", secret: false, value: "1" }],
    [
      "a secret NEXT_PUBLIC_*",
      { name: "NEXT_PUBLIC_X", secret: true, value: "x" },
    ],
    ["a value with a newline", { name: "A", secret: true, value: "a\nb" }],
  ])("refuses %s", async (_, p) => {
    const { send } = setup();
    const r = (await send("env.seal", {
      project: "kd_hello",
      environment: "production",
      ...p,
    })) as Fail;
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("bad_request");
    expect(r.error.message).not.toContain("a\nb");
  });

  test.each([
    ["an unknown environment", { environment: "staging" }],
    ["a bad project", { project: "../etc" }],
    ["a lowercase name", { name: "lower" }],
    ["an empty value", { value: "" }],
    ["an extra key", { echo: true }],
  ])("protocol refuses %s", async (_, over) => {
    const { send } = setup();
    const r = (await send("env.seal", {
      project: "kd_hello",
      environment: "production",
      name: "A",
      secret: true,
      value: "v",
      ...over,
    })) as Fail;
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("bad_request");
  });

  test("no master key: a clear config error, nothing sealed", async () => {
    const { send } = setup(null);
    const r = (await send("env.seal", {
      project: "kd_hello",
      environment: "production",
      name: "A",
      secret: true,
      value: "v",
    })) as Fail;
    expect(r.error.code).toBe("invalid_config");
    expect(r.error.message).toContain("server-ready.sh");
  });

  test("a malformed master key is not echoed", async () => {
    const bad = "c2hvcnQta2V5";
    const { send, logs } = setup(bad);
    const r = (await send("env.seal", {
      project: "kd_hello",
      environment: "production",
      name: "A",
      secret: true,
      value: "v",
    })) as Fail;
    expect(r.error.code).toBe("invalid_config");
    expect(JSON.stringify([r, logs])).not.toContain(bad);
  });
});

describe("env.reveal", () => {
  test("plain variables come back, in any environment", async () => {
    const { send } = setup();
    for (const environment of ["production", "preview", "development"]) {
      const s = await sealed(send, {
        environment,
        name: "NEXT_PUBLIC_SITE_URL",
        secret: false,
        value: "https://kd-hello.fockus.dev",
      });
      const r = (await send("env.reveal", {
        project: "kd_hello",
        environment,
        vars: [{ name: "NEXT_PUBLIC_SITE_URL", secret: false, sealed: s }],
      })) as Ok<{ name: string; value: string }[]>;
      expect(r.result).toEqual([
        { name: "NEXT_PUBLIC_SITE_URL", value: "https://kd-hello.fockus.dev" },
      ]);
    }
  });

  test("development secrets come back (env pull)", async () => {
    const { send } = setup();
    const s = await sealed(send, {
      environment: "development",
      name: "BREVO_API_KEY",
      secret: true,
      value: SECRET_VALUE,
    });
    const r = (await send("env.reveal", {
      project: "kd_hello",
      environment: "development",
      vars: [{ name: "BREVO_API_KEY", secret: true, sealed: s }],
    })) as Ok<{ name: string; value: string }[]>;
    expect(r.result).toEqual([{ name: "BREVO_API_KEY", value: SECRET_VALUE }]);
  });

  for (const environment of ["production", "preview"]) {
    test(`a ${environment} secret is never returned`, async () => {
      const { send, logs } = setup();
      const s = await sealed(send, {
        environment,
        name: "BREVO_API_KEY",
        secret: true,
        value: SECRET_VALUE,
      });
      const plain = await sealed(send, {
        environment,
        name: "NEXT_PUBLIC_X",
        secret: false,
        value: "public",
      });
      // Asked honestly, alone or mixed with a plain one: refused as a whole.
      for (const vars of [
        [{ name: "BREVO_API_KEY", secret: true, sealed: s }],
        [
          { name: "NEXT_PUBLIC_X", secret: false, sealed: plain },
          { name: "BREVO_API_KEY", secret: true, sealed: s },
        ],
      ]) {
        const r = (await send("env.reveal", {
          project: "kd_hello",
          environment,
          vars,
        })) as Fail;
        expect(r.ok).toBe(false);
        expect(r.error.code).toBe("forbidden");
      }
      // Lying about the flag: the AAD says secret, so it does not open.
      const lie = (await send("env.reveal", {
        project: "kd_hello",
        environment,
        vars: [{ name: "BREVO_API_KEY", secret: false, sealed: s }],
      })) as Fail;
      expect(lie.ok).toBe(false);
      expect(lie.error.message).toBe("BREVO_API_KEY cannot be decrypted");
      // Passing it off as a development row: the AAD says otherwise.
      const moved = (await send("env.reveal", {
        project: "kd_hello",
        environment: "development",
        vars: [{ name: "BREVO_API_KEY", secret: true, sealed: s }],
      })) as Fail;
      expect(moved.ok).toBe(false);
      expect(moved.error.code).toBe("bad_request");
      expect(JSON.stringify(logs)).not.toContain("xkeysib");
    });
  }

  test("another project's row does not open", async () => {
    const { send } = setup();
    const s = await sealed(send, {
      environment: "development",
      name: "A",
      secret: true,
      value: "v",
    });
    const r = (await send("env.reveal", {
      project: "maranatha",
      environment: "development",
      vars: [{ name: "A", secret: true, sealed: s }],
    })) as Fail;
    expect(r.error.message).toBe("A cannot be decrypted");
  });

  test("managed names and duplicates are refused", async () => {
    const { send } = setup();
    const s = await sealed(send, {
      environment: "development",
      name: "A",
      secret: false,
      value: "v",
    });
    const managed = (await send("env.reveal", {
      project: "kd_hello",
      environment: "development",
      vars: [{ name: "DATABASE_URL", secret: false, sealed: s }],
    })) as Fail;
    expect(managed.error.code).toBe("bad_request");
    const dup = (await send("env.reveal", {
      project: "kd_hello",
      environment: "development",
      vars: [
        { name: "A", secret: false, sealed: s },
        { name: "A", secret: false, sealed: s },
      ],
    })) as Fail;
    expect(dup.error.message).toBe("A appears twice");
  });

  test(`at most ${MAX_VARS} variables, and they fit in one request`, async () => {
    const { send } = setup();
    const s = await sealed(send, {
      environment: "development",
      name: "A",
      secret: false,
      value: "x".repeat(4000),
    });
    const vars = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `V${i}`,
        secret: false,
        sealed: s,
      }));
    const line = JSON.stringify({
      id: "x",
      op: "env.reveal",
      params: {
        project: "kd_hello",
        environment: "development",
        vars: vars(MAX_VARS),
      },
    });
    expect(Buffer.byteLength(line)).toBeLessThan(MAX_REQUEST_BYTES);
    const over = (await send("env.reveal", {
      project: "kd_hello",
      environment: "development",
      vars: vars(MAX_VARS + 1),
    })) as Fail;
    expect(over.error.code).toBe("bad_request");
  });

  test("the master key is read once", async () => {
    const { send, files } = setup();
    await sealed(send, {
      environment: "development",
      name: "A",
      secret: false,
      value: "v",
    });
    files.delete(MASTER_KEY);
    await sealed(send, {
      environment: "development",
      name: "B",
      secret: false,
      value: "v",
    });
  });
});
