/**
 * Where to go after signing in: `?next=` on /login. Only a path on this same origin is accepted,
 * so a crafted link (`/login?next=https://evil.example`) cannot bounce a fresh session elsewhere.
 * U4 reuses it for `/preview-access?to=…` (that route validates its own `to`).
 *
 * Shared by the proxy (server) and the login form (browser): no Node or DOM imports.
 */

export const HOME = "/";
export const LOGIN_PATH = "/login";
export const ENROL_PATH = "/enrol";
/** Pages a visitor without a session may open; every other page sends them to /login. */
export const PUBLIC_PATHS: readonly string[] = [LOGIN_PATH, ENROL_PATH];
const MAX_LENGTH = 2048;
/** A placeholder origin to parse against: only "is it still this origin?" matters, so the
 * same rule holds on deploy.fockus.dev and on a localhost QA server. */
const BASE = "https://kit-deploy.invalid";

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname === `${p}/`);
}

/** Encoded `/`, `\` or control characters in the path: never in a dashboard route, and a
 * server or proxy that decodes them could rebuild `//host`. */
const ENCODED_UNSAFE = /%(2f|5c|[01][0-9a-f]|7f)/i;

function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * A same-origin path (with its query and fragment) or HOME. The rules hold on the PARSED URL,
 * which is what the browser navigates to: parsing drops `.`/`..` segments but keeps empty ones,
 * so `/.//evil.example` comes out as `//evil.example` (security review, 2026-11-13).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > MAX_LENGTH) return HOME;
  // Root-relative only; parsers strip tabs and newlines, which could rebuild `//`.
  if (!raw.startsWith("/") || hasControl(raw)) return HOME;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return HOME;
  }
  const { pathname } = url;
  if (
    url.origin !== BASE ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    ENCODED_UNSAFE.test(pathname) ||
    hasControl(pathname)
  ) {
    return HOME;
  }
  // Back to the sign-in or enrolment pages would loop.
  if (isPublicPath(pathname)) return HOME;
  const path = `${pathname}${url.search}${url.hash}`;
  // Belt and braces: the string handed to location.assign is never protocol-relative.
  return path.startsWith("//") || path.includes("\\") ? HOME : path;
}

/** `/login`, carrying where the visitor was going (unless that is home). */
export function loginPathFor(pathname: string, search = ""): string {
  const next = safeNextPath(`${pathname}${search}`);
  return next === HOME
    ? LOGIN_PATH
    : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
