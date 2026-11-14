import { describe, expect, test } from "bun:test";
import {
  codeKind,
  codeSignInError,
  isEnrolmentOver,
  NETWORK,
  passkeyRegisterError,
  passkeySignInError,
  totpConfirmError,
} from "../../lib/auth/messages";

describe("sign-in errors", () => {
  test("a wrong code and an unknown email read the same", () => {
    const wrong = codeSignInError({ status: 401, code: "INVALID_CODE" });
    const noChallenge = codeSignInError({
      status: 401,
      code: "INVALID_TWO_FACTOR_COOKIE",
    });
    const locked = codeSignInError({
      status: 400,
      code: "ACCOUNT_TEMPORARILY_LOCKED",
    });
    expect(noChallenge).toEqual(wrong);
    expect(locked).toEqual(wrong);
    expect(wrong.body).not.toMatch(/existe|registrad|cuenta/i);
  });

  test("rate limit, network and cancelled passkey have their own message", () => {
    expect(codeSignInError({ status: 429 }).title).toBe("Demasiados intentos");
    expect(codeSignInError({ status: 502 })).toBe(NETWORK);
    expect(codeSignInError(undefined)).toBe(NETWORK);
    expect(
      passkeySignInError({ status: 400, code: "AUTH_CANCELLED" }).title,
    ).toBe("No se usó ninguna passkey");
    expect(passkeySignInError({ status: 401 }).title).toBe(
      "No se pudo iniciar sesión",
    );
    expect(passkeySignInError({ status: 429 }).title).toBe(
      "Demasiados intentos",
    );
  });

  test("every message is an error with a title and a body", () => {
    for (const n of [
      codeSignInError({ status: 401 }),
      passkeySignInError({ status: 401 }),
      passkeyRegisterError({ status: 400, code: "ERROR_CEREMONY_ABORTED" }),
      passkeyRegisterError({
        status: 400,
        code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      }),
      totpConfirmError({ status: 401 }),
    ]) {
      expect(n.kind).toBe("error");
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("codeKind / isEnrolmentOver", () => {
  test("six digits are TOTP; anything else is a recovery code", () => {
    expect(codeKind("123456")).toBe("totp");
    expect(codeKind("12345")).toBe("recovery");
    expect(codeKind("1234567")).toBe("recovery");
    expect(codeKind("Ab3dE-f9HiJ2")).toBe("recovery");
  });

  test("401/403 from an enrolment route means the window is over", () => {
    expect(isEnrolmentOver({ status: 403 })).toBe(true);
    expect(isEnrolmentOver({ status: 401 })).toBe(true);
    expect(isEnrolmentOver({ status: 400 })).toBe(false);
    expect(isEnrolmentOver(null)).toBe(false);
  });
});
