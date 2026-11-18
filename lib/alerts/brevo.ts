/**
 * Alerts by Brevo's transactional API (D002): from "kit-deploy" <alertas@fockus.dev> to the
 * address in /etc/kit-deploy/alerts.env. Never SMTP from the VPS (a new IP has no reputation):
 * an HTTPS call to api.brevo.com, which sends from its own servers with fockus.dev's DKIM.
 * The key is read from the environment and only ever goes in the `api-key` header.
 */
import type { Digest, Mailer } from "./engine";

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
export const ALERTS_FROM = {
  name: "kit-deploy",
  email: "alertas@fockus.dev",
} as const;
const TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
/** Brevo's v3 keys: `xkeysib-` and hex/alnum; bounded so a pasted line of junk is refused. */
export const BREVO_KEY_RE = /^xkeysib-[A-Za-z0-9-]{20,200}$/;

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function brevoMailer(
  apiKey: string,
  to: string,
  fetchFn: Fetch = fetch,
): Mailer {
  return {
    async send(d: Digest) {
      const res = await fetchFn(BREVO_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: ALERTS_FROM,
          to: [{ email: to }],
          subject: d.subject,
          // One body per request (Brevo's docs): the HTML; Brevo derives the text part.
          htmlContent: d.html,
          tags: ["kit-deploy-alert"],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // Brevo's error body is {code, message}; never the request (it has the key's header).
        let why = "";
        try {
          const body = (await res.json()) as {
            code?: string;
            message?: string;
          };
          why = [body.code, body.message]
            .filter(Boolean)
            .join(": ")
            .slice(0, 200);
        } catch {
          why = "";
        }
        throw new Error(
          `Brevo answered ${res.status}${why ? ` (${why})` : ""}`,
        );
      }
    },
  };
}

/** From ALERTS_BREVO_KEY / ALERTS_TO (alerts.env); null when either is missing or malformed. */
export function mailerFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchFn: Fetch = fetch,
): Mailer | null {
  const key = env.ALERTS_BREVO_KEY ?? "";
  const to = env.ALERTS_TO ?? "";
  if (!BREVO_KEY_RE.test(key) || !isEmail(to)) return null;
  return brevoMailer(key, to, fetchFn);
}
