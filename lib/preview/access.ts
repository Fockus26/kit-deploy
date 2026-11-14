/**
 * Preview access (D013). The dashboard session cookie never leaves deploy.fockus.dev, so a
 * preview gets its own cookie, in three steps:
 *
 *   1. GET  deploy.fockus.dev/preview-access?to=https://<x>.preview.fockus.dev/<path>
 *        signed-in dashboard user → a one-time grant (60 s), carried to the preview host in an
 *        auto-submitted form POST: never in a URL, so never in Caddy's access log.
 *        no session → /login?next=… (back here after signing in).
 *   2. POST <x>.preview.fockus.dev/__kit-deploy/exchange   (Caddy → /api/v1/preview-exchange)
 *        grant valid for THIS host → `kd_preview` (Domain .preview.fockus.dev, HttpOnly, Secure,
 *        SameSite=Lax, 12 h) and a 303 to the path asked for, on that same host.
 *   3. Caddy's forward_auth on every preview request → /api/v1/preview-auth
 *        valid cookie → 204; otherwise → 302 to step 1 with the URL the visitor wanted.
 *
 * Only sha256 hashes of both tokens are stored (32 random bytes: nothing to brute-force).
 * Handlers take their store and clock as arguments: tests/unit/preview-access.test.ts.
 */
import { createHash, randomBytes } from "node:crypto";
import { loginPathFor } from "../auth/next-path";
import { DASHBOARD_HOST, PREVIEW_DOMAIN } from "../core/constants";
import { hashToken } from "../tokens";

export const PREVIEW_COOKIE = "kd_preview";
export const PREVIEW_SESSION_TTL_S = 12 * 60 * 60;
export const GRANT_TTL_MS = 60 * 1000;
/** Where the preview host receives the grant (Caddy rewrites it to the web's API route). */
export const EXCHANGE_PATH = "/__kit-deploy/exchange";
export const ACCESS_PATH = "/preview-access";

const GRANT = /^kdg_[A-Za-z0-9_-]{43}$/;
const SESSION = /^kdp_[A-Za-z0-9_-]{43}$/;
/** One DNS label under the preview wildcard: `kd-hello-pr-7.preview.fockus.dev`. */
const PREVIEW_HOST = new RegExp(
  `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${PREVIEW_DOMAIN.replaceAll(".", "\\.")}$`,
);
const MAX_URL = 2048;

export type DashboardUserRef = { userId: string };

export interface PreviewAccessStore {
  createGrant(g: {
    userId: string;
    tokenHash: string;
    host: string;
    path: string;
    expiresAt: Date;
  }): Promise<void>;
  /** Marks an unused, unexpired grant for `host` as used and returns it, atomically. */
  redeemGrant(
    tokenHash: string,
    host: string,
    now: Date,
  ): Promise<{ userId: string; path: string } | null>;
  createSession(s: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** The unexpired session with this hash, whose user still exists. */
  findSession(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: string; expiresAt: Date } | null>;
}

export function isPreviewHost(host: string | null | undefined): host is string {
  return !!host && host.length <= 253 && PREVIEW_HOST.test(host);
}

/** `to` → the preview host and the path (+ query) on it, or null. Only https, the default port,
 * no credentials, one label under the preview domain. The fragment is dropped (never sent). */
export function parsePreviewTarget(
  raw: string | null | undefined,
): { host: string; path: string } | null {
  if (!raw || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port !== "") return null;
  if (url.username || url.password) return null;
  if (!isPreviewHost(url.hostname)) return null;
  return { host: url.hostname, path: `${url.pathname}${url.search}` };
}

/** Always absolute on the preview host: a path like `//evil.example` stays a path there. */
export function previewUrl(host: string, path: string): string {
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function newToken(prefix: "kdg_" | "kdp_"): { token: string; hash: string } {
  const token = prefix + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      return part.slice(i + 1).trim();
    }
  }
  return null;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

const NO_STORE = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

/** A bare page in the dashboard's dark/light palette (COLORS.md); phase 05 brings the design. */
function page(
  status: number,
  title: string,
  body: string,
  extra: { csp?: string; headers?: Record<string, string> } = {},
): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · kit-deploy</title><style>${PAGE_CSS}</style></head><body><main><p class="brand">kit-deploy · ${escapeHtml(DASHBOARD_HOST)}</p><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      ...NO_STORE,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        extra.csp ??
        `default-src 'none'; style-src '${PAGE_CSS_HASH}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
      ...extra.headers,
    },
  });
}

const PAGE_CSS =
  ":root{color-scheme:dark;--bg:#0b0d10;--fg:#e6e8eb;--muted:#9aa3ae;--primary:#5b9bff;--on-primary:#08111f;--ring:#7ab0ff}" +
  "@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f6f7f9;--fg:#0f1419;--muted:#5b6573;--primary:#1f5fd1;--on-primary:#fff;--ring:#1f5fd1}}" +
  "body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}" +
  "main{max-width:400px;margin:0 auto;padding:48px 16px}" +
  ".brand{font-family:ui-monospace,monospace;font-size:13px;color:var(--muted);margin:0 0 24px}" +
  "h1{font-size:22px;line-height:1.25;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}" +
  "a,button{display:inline-flex;min-height:40px;align-items:center;padding:8px 16px;border:0;border-radius:6px;background:var(--primary);color:var(--on-primary);font:inherit;font-weight:500;text-decoration:none;cursor:pointer}" +
  "a:focus-visible,button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}";
const sha256b64 = (s: string) =>
  `sha256-${createHash("sha256").update(s).digest("base64")}`;
const PAGE_CSS_HASH = sha256b64(PAGE_CSS);
const SUBMIT_JS = "document.forms[0].submit()";
const SUBMIT_JS_HASH = sha256b64(SUBMIT_JS);

export type AccessDeps = {
  store: PreviewAccessStore;
  user: (request: Request) => Promise<DashboardUserRef | null>;
  now?: () => number;
};

/** Step 1, on deploy.fockus.dev. */
export async function handlePreviewAccess(
  request: Request,
  deps: AccessDeps,
): Promise<Response> {
  const to = new URL(request.url).searchParams.get("to");
  const target = parsePreviewTarget(to);
  if (!target) {
    return page(
      400,
      "Enlace de preview no válido",
      "<p>Este enlace no apunta a una preview de kit-deploy. Ábrela desde el comentario del PR.</p>",
    );
  }
  const user = await deps.user(request);
  if (!user) {
    const back = `?to=${encodeURIComponent(previewUrl(target.host, target.path))}`;
    return new Response(null, {
      status: 303,
      headers: { ...NO_STORE, location: loginPathFor(ACCESS_PATH, back) },
    });
  }
  const now = (deps.now ?? Date.now)();
  const { token, hash } = newToken("kdg_");
  await deps.store.createGrant({
    userId: user.userId,
    tokenHash: hash,
    host: target.host,
    path: target.path,
    expiresAt: new Date(now + GRANT_TTL_MS),
  });
  const action = previewUrl(target.host, EXCHANGE_PATH);
  return page(
    200,
    "Abriendo la preview…",
    `<p>${escapeHtml(target.host)}</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="t" value="${token}"><button type="submit">Continuar a la preview</button></form><script>${SUBMIT_JS}</script>`,
    {
      // The origin, not the path: Chrome also checks form-action on the 303 that follows.
      csp: `default-src 'none'; style-src '${PAGE_CSS_HASH}'; script-src '${SUBMIT_JS_HASH}'; form-action https://${target.host}; frame-ancestors 'none'; base-uri 'none'`,
    },
  );
}

export type ExchangeDeps = { store: PreviewAccessStore; now?: () => number };

/** Step 2, on the preview host (Caddy keeps the client's Host header). */
export async function handlePreviewExchange(
  request: Request,
  deps: ExchangeDeps,
): Promise<Response> {
  const host = request.headers.get("host");
  if (!isPreviewHost(host)) return new Response(null, { status: 404 });
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  let t = "";
  try {
    t = String((await request.formData()).get("t") ?? "");
  } catch {
    t = "";
  }
  const now = (deps.now ?? Date.now)();
  const grant = GRANT.test(t)
    ? await deps.store.redeemGrant(hashToken(t), host, new Date(now))
    : null;
  if (!grant) {
    return page(
      400,
      "Este acceso caducó",
      `<p>El acceso a la preview dura un minuto y sirve una vez. Vuelve a abrirla:</p><a href="${escapeHtml(previewUrl(host, "/"))}">Abrir la preview</a>`,
    );
  }
  const session = newToken("kdp_");
  await deps.store.createSession({
    userId: grant.userId,
    tokenHash: session.hash,
    expiresAt: new Date(now + PREVIEW_SESSION_TTL_S * 1000),
  });
  return new Response(null, {
    status: 303,
    headers: {
      ...NO_STORE,
      location: previewUrl(host, grant.path),
      "set-cookie": `${PREVIEW_COOKIE}=${session.token}; Domain=${PREVIEW_DOMAIN}; Path=/; Max-Age=${PREVIEW_SESSION_TTL_S}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export type AuthDeps = {
  store: PreviewAccessStore;
  now?: () => number;
  /** Recently confirmed sessions (hash → expiry ms): forward_auth asks on every asset. */
  cache?: Map<string, number>;
};

const CACHE_MS = 60 * 1000;
const CACHE_MAX = 500;

/** Step 3, forward_auth's question. */
export async function handlePreviewAuth(
  request: Request,
  deps: AuthDeps,
): Promise<Response> {
  const host = request.headers.get("x-forwarded-host");
  if (!isPreviewHost(host)) return new Response(null, { status: 403 });
  const now = (deps.now ?? Date.now)();
  const value = cookieValue(request.headers.get("cookie"), PREVIEW_COOKIE);
  if (value && SESSION.test(value)) {
    const hash = hashToken(value);
    const cached = deps.cache?.get(hash);
    if (cached !== undefined && cached > now) {
      return new Response(null, { status: 204 });
    }
    const s = await deps.store.findSession(hash, new Date(now));
    if (s) {
      if (deps.cache) {
        if (deps.cache.size >= CACHE_MAX) deps.cache.clear();
        // Never past the session's own expiry.
        deps.cache.set(hash, Math.min(now + CACHE_MS, s.expiresAt.getTime()));
      }
      return new Response(null, { status: 204 });
    }
    deps.cache?.delete(hash);
  }
  const uri = request.headers.get("x-forwarded-uri") ?? "/";
  const wanted = previewUrl(host, uri.startsWith("/") ? uri : "/");
  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE,
      location: `https://${DASHBOARD_HOST}${ACCESS_PATH}?to=${encodeURIComponent(wanted)}`,
    },
  });
}
