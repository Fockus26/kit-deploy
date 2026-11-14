/** The dashboard's cookie names, without Better Auth: the proxy reads them (proxy.ts). */

/** `__Host-` makes the browser refuse the cookie if it ever carried a Domain or lacked Secure. */
export const COOKIE_PREFIX = "__Host-kd";
export const SESSION_COOKIE = `${COOKIE_PREFIX}.session_token`;
