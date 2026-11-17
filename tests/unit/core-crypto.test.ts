import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  deriveEnvKey,
  EnvCryptoError,
  type EnvSlot,
  KEY_VERSION,
  open,
  type Sealed,
  seal,
} from "../../lib/core/crypto";
import {
  assertEnvironment,
  assertEnvName,
  assertEnvValue,
  assertSecretFlag,
  MAX_VALUE_BYTES,
} from "../../lib/core/env";
import { CoreInputError } from "../../lib/core/validate";

const masterFile = () => `${randomBytes(32).toString("base64")}\n`;
const key = deriveEnvKey(masterFile());
const slot: EnvSlot = {
  project: "kd_hello",
  environment: "production",
  name: "BREVO_API_KEY",
  secret: true,
};
const VALUE = "xkeysib-0123456789abcdef-ñ";

describe("deriveEnvKey", () => {
  test("32-byte key, deterministic, not the master key itself", () => {
    const file = masterFile();
    const a = deriveEnvKey(file);
    expect(a.length).toBe(32);
    expect(deriveEnvKey(file).equals(a)).toBe(true);
    expect(a.equals(Buffer.from(file.trim(), "base64"))).toBe(false);
  });

  test("refuses a key that is not 32 bytes, without echoing it", () => {
    const short = randomBytes(16).toString("base64");
    try {
      deriveEnvKey(short);
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvCryptoError);
      expect((e as Error).message).not.toContain(short);
    }
  });
});

describe("seal / open", () => {
  test("round trip, and the blob does not contain the value", () => {
    const s = seal(key, slot, VALUE);
    expect(s.keyVersion).toBe(KEY_VERSION);
    expect(open(key, slot, s)).toBe(VALUE);
    const stored = JSON.stringify(s);
    expect(stored).not.toContain("xkeysib");
    expect(Buffer.from(s.ciphertext, "base64").toString()).not.toContain(
      "xkeysib",
    );
  });

  test("a fresh IV each time: the same value seals differently", () => {
    const a = seal(key, slot, VALUE);
    const b = seal(key, slot, VALUE);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  test("the stored formats match the schema's checks", () => {
    const s = seal(key, slot, "x".repeat(MAX_VALUE_BYTES));
    expect(s.iv).toMatch(/^[A-Za-z0-9+/]{16}$/);
    expect(s.tag).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(s.ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(s.ciphertext.length).toBeLessThanOrEqual(43692);
  });

  test("another key cannot open it", () => {
    const s = seal(key, slot, VALUE);
    expect(() => open(deriveEnvKey(masterFile()), slot, s)).toThrow(
      EnvCryptoError,
    );
  });

  // The AAD: a row edited in the database must not open as something else.
  const moved: [string, EnvSlot][] = [
    ["another project", { ...slot, project: "maranatha" }],
    ["another environment", { ...slot, environment: "development" }],
    ["another name", { ...slot, name: "OTHER_KEY" }],
    ["secret flipped to plain", { ...slot, secret: false }],
  ];
  for (const [what, other] of moved) {
    test(`fails when moved to ${what}`, () => {
      const s = seal(key, slot, VALUE);
      expect(() => open(key, other, s)).toThrow(EnvCryptoError);
    });
  }

  const tampered: [string, (s: Sealed) => Sealed][] = [
    [
      "ciphertext",
      (s) => {
        const b = Buffer.from(s.ciphertext, "base64");
        b[0] = (b[0] ?? 0) ^ 1;
        return { ...s, ciphertext: b.toString("base64") };
      },
    ],
    ["tag", (s) => ({ ...s, tag: randomBytes(16).toString("base64") })],
    ["iv", (s) => ({ ...s, iv: randomBytes(12).toString("base64") })],
    ["short tag", (s) => ({ ...s, tag: randomBytes(8).toString("base64") })],
    ["not base64", (s) => ({ ...s, ciphertext: "%%%" })],
    ["key version", (s) => ({ ...s, keyVersion: 2 })],
  ];
  for (const [what, edit] of tampered) {
    test(`fails when the ${what} is tampered`, () => {
      const s = seal(key, slot, VALUE);
      expect(() => open(key, slot, edit(s))).toThrow(EnvCryptoError);
    });
  }

  test("every failure says the same thing", () => {
    const s = seal(key, slot, VALUE);
    const messages = new Set<string>();
    for (const attempt of [
      () => open(key, { ...slot, secret: false }, s),
      () => open(key, slot, { ...s, tag: randomBytes(16).toString("base64") }),
      () => open(deriveEnvKey(masterFile()), slot, s),
    ]) {
      try {
        attempt();
      } catch (e) {
        messages.add((e as Error).message);
      }
    }
    expect([...messages]).toEqual(["variable cannot be decrypted"]);
  });

  test("seal refuses a bad slot or value", () => {
    expect(() => seal(key, { ...slot, project: "../x" }, VALUE)).toThrow(
      CoreInputError,
    );
    expect(() =>
      seal(key, { ...slot, environment: "staging" as never }, VALUE),
    ).toThrow(CoreInputError);
    expect(() => seal(key, { ...slot, name: "lower" }, VALUE)).toThrow(
      CoreInputError,
    );
    expect(() => seal(key, slot, "a\nb")).toThrow(CoreInputError);
  });
});

describe("env rules", () => {
  test("names", () => {
    expect(assertEnvName("BREVO_API_KEY")).toBe("BREVO_API_KEY");
    expect(assertEnvName("_X1")).toBe("_X1");
    for (const bad of [
      "",
      "1X",
      "lower",
      "A-B",
      "A B",
      `A${"B".repeat(128)}`,
    ]) {
      expect(() => assertEnvName(bad)).toThrow(CoreInputError);
    }
  });

  test("reserved and managed names cannot be set by hand", () => {
    for (const n of [
      "PORT",
      "HOSTNAME",
      "NODE_OPTIONS",
      "DATABASE_URL",
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    ]) {
      expect(() => assertEnvName(n)).toThrow(/set by kit-deploy itself/);
    }
  });

  test("NEXT_PUBLIC_* cannot be secret", () => {
    expect(() => assertSecretFlag("NEXT_PUBLIC_SITE_URL", true)).toThrow(
      CoreInputError,
    );
    expect(assertSecretFlag("NEXT_PUBLIC_SITE_URL", false)).toBe(false);
    expect(assertSecretFlag("BREVO_API_KEY", true)).toBe(true);
  });

  test("values: one line, not empty, bounded, and never echoed", () => {
    expect(assertEnvValue("a=b c")).toBe("a=b c");
    for (const bad of [
      "",
      "a\nb",
      "a\rb",
      "a\0b",
      "x".repeat(MAX_VALUE_BYTES + 1),
    ]) {
      try {
        assertEnvValue(bad);
        throw new Error("did not throw");
      } catch (e) {
        expect(e).toBeInstanceOf(CoreInputError);
        if (bad.length > 0) expect((e as Error).message).not.toContain(bad);
      }
    }
    // Bytes, not characters.
    expect(() => assertEnvValue("ñ".repeat(MAX_VALUE_BYTES / 2 + 1))).toThrow(
      CoreInputError,
    );
  });

  test("environments", () => {
    expect(assertEnvironment("development")).toBe("development");
    expect(() => assertEnvironment("staging")).toThrow(CoreInputError);
  });
});
