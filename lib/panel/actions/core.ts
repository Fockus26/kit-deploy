/**
 * What every panel Server Action shares (D032, D033): the session first (none → a typed 401
 * result, never a redirect), then the form through its zod schema, then the work; whatever is
 * thrown comes back as `{ ok: false, code, status, message }` in Spanish. The logic lives here,
 * testable without Next; `app/(panel)/actions/*.ts` only wires the real dependencies.
 *
 * Nothing a person typed as a value is ever put in a result, an error message or a log line.
 */
import type { z } from "zod";
import { AgentUnreachable } from "@/cli/client";
import type { DashboardUser } from "@/lib/auth/session";
import { CoreInputError } from "@/lib/core/validate";
import { AdminError } from "@/lib/db/admin";
import { SwitchError } from "@/lib/deploy/switch";
import { AgentRefused, OpsError } from "@/lib/ops/agent";

export type FailureCode =
  | "unauthorized"
  | "invalid"
  | "confirmation"
  | "not_found"
  | "conflict"
  | "agent"
  | "failed"
  | "too_many";

const STATUS: Record<FailureCode, number> = {
  unauthorized: 401,
  invalid: 400,
  confirmation: 400,
  not_found: 404,
  conflict: 409,
  agent: 503,
  failed: 500,
  too_many: 429,
};

export type ActionFailure = {
  ok: false;
  code: FailureCode;
  /** The HTTP status it stands for (the action's response itself is a 200). */
  status: number;
  message: string;
  /** The first problem of each field, for the form. */
  fields?: Record<string, string>;
};

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | ActionFailure;

export function failure(
  code: FailureCode,
  message: string,
  fields?: Record<string, string>,
): ActionFailure {
  return {
    ok: false,
    code,
    status: STATUS[code],
    message,
    ...(fields ? { fields } : {}),
  };
}

export const AGENT_DOWN =
  "No se pudo hablar con kit-agent. Los sitios siguen sirviendo: no dependen del panel.";
export const SESSION_GONE =
  "Tu sesión ha caducado. Vuelve a entrar para continuar.";

/** What every action is given; the real ones are in lib/panel/runtime.ts. */
export type SessionSource = { user(): Promise<DashboardUser | null> };

/** The typed confirmation of a destructive action: the real name, compared on the server. */
export function confirms(typed: string, expected: string): boolean {
  return typed.trim() === expected;
}

export function confirmationFailure(expected: string): ActionFailure {
  return failure(
    "confirmation",
    `Para confirmar, escribe exactamente ${expected}.`,
    { confirm: `Escribe ${expected}.` },
  );
}

/**
 * The fallback wording of what a shared operation threw. Each action words the cases it knows
 * first; this keeps the rest honest without leaking internals. `quiet`: never log the message
 * (the variable actions, whose input is a value).
 */
export function fromError(
  e: unknown,
  opts: { action: string; quiet?: boolean },
): ActionFailure {
  if (e instanceof AgentUnreachable) return failure("agent", AGENT_DOWN);
  if (e instanceof AgentRefused)
    return failure(
      "agent",
      `kit-agent no hizo la operación (${e.code}). El detalle está en su journal.`,
    );
  if (e instanceof CoreInputError)
    return failure("invalid", "Revisa los datos del formulario.");
  if (e instanceof OpsError && e.code === "not_found")
    return failure("not_found", "Ese proyecto no existe.");
  if (e instanceof AdminError && /^no project /.test(e.message))
    return failure("not_found", "Ese proyecto no existe.");
  if (!opts.quiet) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`panel action ${opts.action}:`, msg);
  }
  if (
    e instanceof SwitchError ||
    e instanceof AdminError ||
    e instanceof OpsError
  )
    return failure(
      "failed",
      "No se pudo completar la operación. El detalle está en el log del panel.",
    );
  return failure("failed", "Algo falló en el panel. Inténtalo de nuevo.");
}

/** zod's issues → the first message per field (the form shows one). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Session, then schema, then `work`. `raw` is the form as an object (lib/panel/schemas.ts
 * `formToObject`); the schema's messages are the panel's, and never echo the input.
 */
export async function runAction<S extends z.ZodType, T extends object>(
  session: SessionSource,
  schema: S,
  raw: unknown,
  opts: { action: string; quiet?: boolean },
  work: (input: z.output<S>, user: DashboardUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let user: DashboardUser | null;
  try {
    user = await session.user();
  } catch {
    user = null;
  }
  if (!user) return failure("unauthorized", SESSION_GONE);
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return failure(
      "invalid",
      "Revisa los campos marcados.",
      fieldErrors(parsed.error),
    );
  try {
    return await work(parsed.data, user);
  } catch (e) {
    return fromError(e, opts);
  }
}
