/**
 * The alerts' digest email (phase 06, HANDOFF §5c, D047): one email per run with every alert that
 * opened or resolved, newest state first. Plain table layout with inline styles (email clients
 * ignore stylesheets and CSS variables), light theme only, and the state always written as a word
 * beside its color (WCAG: never color alone). Spanish copy (CONTENT_CHECKLIST: César confirms it).
 */
import { DASHBOARD_HOST } from "../core/constants";
import type { AlertRow, Digest } from "./engine";
import { KIND_LABEL } from "./rules";

/**
 * The light theme's values of app/globals.css' tokens, by token name — emails cannot read CSS
 * variables. tests/unit/alerts-email.test.ts checks they still match globals.css.
 */
export const EMAIL_TOKENS = {
  background: "#f6f7f9",
  card: "#ffffff",
  foreground: "#0f1419",
  "muted-foreground": "#5b6573",
  border: "#e1e4e8",
  "primary-text": "#1f5fd1",
  warning: "#8a5200",
  "warning-surface": "#fff4e0",
  success: "#0e7a45",
  "success-surface": "#e7f6ee",
} as const;

const T = EMAIL_TOKENS;
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** `18 nov 2026, 14:03 UTC` — the VPS and the logs are in UTC. */
export function when(d: Date): string {
  const date = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(d)
    .replace(/\./g, "");
  const time = d.toISOString().slice(11, 16);
  return `${date}, ${time} UTC`;
}

/** `17 min`, `2 h 5 min`, `3 d 4 h`. */
export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const resolved = (a: AlertRow) => a.resolvedAt !== null;

function link(a: AlertRow): string {
  return a.project
    ? `https://${DASHBOARD_HOST}/p/${a.project}`
    : `https://${DASHBOARD_HOST}/`;
}

function stateLine(a: AlertRow): string {
  return a.resolvedAt
    ? `Resuelta el ${when(a.resolvedAt)} · duró ${duration(a.resolvedAt.getTime() - a.openedAt.getTime())}`
    : `Abierta desde el ${when(a.openedAt)}`;
}

export function subjectOf(rows: AlertRow[]): string {
  const first = rows[0];
  if (rows.length === 1 && first)
    return `[kit-deploy] ${resolved(first) ? "Resuelta" : "Abierta"}: ${first.title}`;
  const open = rows.filter((a) => !resolved(a)).length;
  const done = rows.length - open;
  const parts = [
    open ? `${open} ${open === 1 ? "abierta" : "abiertas"}` : "",
    done ? `${done} ${done === 1 ? "resuelta" : "resueltas"}` : "",
  ].filter(Boolean);
  return `[kit-deploy] ${rows.length} alertas: ${parts.join(", ")}`;
}

function block(a: AlertRow): string {
  const ok = resolved(a);
  const color = ok ? T.success : T.warning;
  const surface = ok ? T["success-surface"] : T["warning-surface"];
  const label = ok ? "RESUELTA" : "ABIERTA";
  const detail = a.detail
    ? `<p style="margin:8px 0 0;font:14px/20px ${SANS};color:${T.foreground}">${escapeHtml(a.detail)}</p>`
    : "";
  return `<tr><td style="padding:16px 24px;border-top:1px solid ${T.border}">
<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${surface};color:${color};font:600 12px/16px ${MONO};letter-spacing:0.04em">${label}</span>
<span style="font:12px/16px ${MONO};color:${T["muted-foreground"]};margin-left:8px">${escapeHtml(KIND_LABEL[a.kind])}${a.project ? ` · ${escapeHtml(a.project)}` : ""}</span>
<p style="margin:8px 0 0;font:600 16px/24px ${SANS};color:${T.foreground}">${escapeHtml(a.title)}</p>${detail}
<p style="margin:8px 0 0;font:13px/20px ${SANS};color:${T["muted-foreground"]}">${escapeHtml(stateLine(a))} · <a href="${link(a)}" style="color:${T["primary-text"]}">Ver en el panel</a></p>
</td></tr>`;
}

export function renderDigest(rows: AlertRow[], now: Date): Digest {
  // Open ones first: they are the ones that need César.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(resolved(a)) - Number(resolved(b)) ||
      a.openedAt.getTime() - b.openedAt.getTime(),
  );
  const subject = subjectOf(sorted);
  const heading = subject.replace(/^\[kit-deploy\] /, "");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${T.background}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.background}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${T.card};border:1px solid ${T.border};border-radius:8px">
<tr><td style="padding:20px 24px 16px">
<p style="margin:0;font:12px/16px ${MONO};color:${T["muted-foreground"]}">kit-deploy · alertas</p>
<h1 style="margin:4px 0 0;font:600 18px/26px ${SANS};color:${T.foreground}">${escapeHtml(heading)}</h1>
</td></tr>
${sorted.map(block).join("\n")}
<tr><td style="padding:16px 24px;border-top:1px solid ${T.border};font:12px/18px ${SANS};color:${T["muted-foreground"]}">Enviado por kit-deploy el ${escapeHtml(when(now))}. Una alerta manda un correo al abrirse y otro al resolverse; las de un mismo minuto van juntas.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    heading,
    "",
    ...sorted.flatMap((a) => [
      `${resolved(a) ? "RESUELTA" : "ABIERTA"} · ${KIND_LABEL[a.kind]}${a.project ? ` · ${a.project}` : ""}`,
      a.title,
      ...(a.detail ? [a.detail] : []),
      stateLine(a),
      link(a),
      "",
    ]),
    `Enviado por kit-deploy el ${when(now)}.`,
  ].join("\n");
  return { subject, html, text };
}

/** `kit-deploy alerts test`: the same layout with one sample alert, to check delivery. */
export function renderTest(now: Date): Digest {
  const d = renderDigest(
    [
      {
        id: "test",
        key: "test",
        kind: "site_down",
        project: null,
        title: "Correo de prueba de kit-deploy",
        detail:
          "Si lo lees en la bandeja de entrada (no en spam), las alertas llegan.",
        openedAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        notifiedAt: null,
        resolvedNotifiedAt: null,
      },
    ],
    now,
  );
  return { ...d, subject: "[kit-deploy] Correo de prueba" };
}
