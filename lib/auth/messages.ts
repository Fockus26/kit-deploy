/**
 * The Spanish messages /login and /enrol show for a failed call. Pure, so the mapping is tested
 * (tests/unit/auth-messages.test.ts). Sign-in errors never say whether the email exists: U2
 * answers an unknown email exactly like a wrong code.
 */
import type { Notice } from "@/components/auth/form-alert";

export type CallError = { status?: number; code?: string } | null | undefined;

/** Codes @better-auth/passkey and @simplewebauthn/browser give a cancelled or failed ceremony. */
const CANCELLED = new Set([
  "AUTH_CANCELLED",
  "ERROR_CEREMONY_ABORTED",
  "REGISTRATION_CANCELLED",
  "NotAllowedError",
]);

export const ENROL_COMMAND = "ssh -t kit-vps kit-deploy user enrol <tu-email>";

export const NETWORK: Notice = {
  kind: "error",
  title: "Sin conexión con el panel",
  body: "Revisa tu conexión y vuelve a intentarlo.",
};

const TOO_MANY: Notice = {
  kind: "error",
  title: "Demasiados intentos",
  body: "Espera unos minutos antes de volver a intentarlo.",
};

function isNetwork(e: CallError): boolean {
  return e?.status === undefined || e.status === 0 || e.status >= 500;
}

export function passkeySignInError(e: CallError): Notice {
  if (e?.status === 429) return TOO_MANY;
  if (e?.code && CANCELLED.has(e.code)) {
    return {
      kind: "error",
      title: "No se usó ninguna passkey",
      body: "Se canceló o este dispositivo no tiene una passkey de kit-deploy. Vuelve a intentarlo o entra con un código.",
    };
  }
  if (e?.status !== undefined && e.status >= 400 && e.status < 500) {
    return {
      kind: "error",
      title: "No se pudo iniciar sesión",
      body: "La passkey no es válida para este panel. Vuelve a intentarlo o entra con un código.",
    };
  }
  return NETWORK;
}

export function codeSignInError(e: CallError): Notice {
  if (e?.status === 429) return TOO_MANY;
  if (e?.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") {
    return {
      kind: "error",
      title: "Demasiados códigos incorrectos",
      body: "Vuelve a escribir el email y un código nuevo.",
    };
  }
  if (isNetwork(e)) return NETWORK;
  // Unknown email, wrong code, expired challenge or a locked account: one answer for all.
  return {
    kind: "error",
    title: "No se pudo iniciar sesión",
    body: "El email o el código no son válidos. Revisa ambos y vuelve a intentarlo.",
  };
}

export function passkeyRegisterError(e: CallError): Notice {
  if (e?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return {
      kind: "error",
      title: "Esta passkey ya estaba registrada",
      body: "Este dispositivo ya tiene una passkey de kit-deploy. Puedes seguir con el paso siguiente.",
    };
  }
  if (e?.code && CANCELLED.has(e.code)) {
    return {
      kind: "error",
      title: "No se registró la passkey",
      body: "Se canceló el registro. Vuelve a intentarlo cuando tu dispositivo te lo pida.",
    };
  }
  if (isNetwork(e)) return NETWORK;
  return {
    kind: "error",
    title: "No se registró la passkey",
    body: "El dispositivo no pudo crear la passkey. Vuelve a intentarlo.",
  };
}

export function totpConfirmError(e: CallError): Notice {
  if (e?.status === 429) return TOO_MANY;
  if (isNetwork(e)) return NETWORK;
  return {
    kind: "error",
    title: "El código no coincide",
    body: "Escribe el código que muestra ahora tu app. Si sigue fallando, revisa que la hora del teléfono sea automática.",
  };
}

/** A sign-in code: 6 digits → TOTP; anything else → a recovery code. */
export function codeKind(code: string): "totp" | "recovery" {
  return /^\d{6}$/.test(code) ? "totp" : "recovery";
}

/** The enrolment session's 403: the 30 minutes ran out or the link was never opened. */
export function isEnrolmentOver(e: CallError): boolean {
  return e?.status === 401 || e?.status === 403;
}
