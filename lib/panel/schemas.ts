/**
 * What every panel form sends, checked on the server by the Server Action and in the browser by
 * the same schema (phase 05 W6, D032). Every text field is trimmed and bounded by its column; the
 * messages are the panel's (Spanish). A value field is never echoed in a message.
 *
 * Shared by client and server: no Node or database imports here.
 */
import { z } from "zod";
import { MEMORY_MB } from "@/lib/core/constants";
import {
  ENV_NAME_RE,
  ENVIRONMENTS,
  MANAGED_NAMES,
  MAX_VALUE_BYTES,
  RESERVED_NAMES,
  RUNTIME_NAME_RE,
} from "@/lib/core/env";
import {
  BRANCH_RE,
  isReservedProject,
  PROJECT_RE,
  REPO_RE,
} from "@/lib/ops/rules";

/** The Nuevo proyecto select (HANDOFF §3); the server accepts the platform's whole range. */
export const MEMORY_CHOICES = [256, 512, 1024] as const;
/** Bounds of the columns (lib/db/schema.ts checks). */
export const MAX = {
  project: 40,
  repo: 201,
  branch: 100,
  envName: 128,
  host: 253,
  tokenLabel: 100,
  logQuery: 200,
} as const;

const NOT_SETTABLE: ReadonlySet<string> = new Set([
  ...RESERVED_NAMES,
  ...MANAGED_NAMES,
]);

const text = (max: number, required: string) =>
  z
    .string({ message: required })
    .trim()
    .min(1, { message: required })
    .max(max, { message: `Como mucho ${max} caracteres.` });

export const projectField = text(MAX.project, "Falta el proyecto.").regex(
  PROJECT_RE,
  {
    message:
      "Minúsculas, números y guion bajo; empieza por letra o número; hasta 40.",
  },
);

export const environmentField = z.enum(ENVIRONMENTS, {
  message: "Elige Producción, Preview o Desarrollo.",
});

/** A name a person may set (lib/core/env assertEnvName), with the panel's words. */
export const envNameField = text(MAX.envName, "Falta el nombre.")
  .regex(ENV_NAME_RE, {
    message: "Mayúsculas, números y guion bajo; no empieza por número.",
  })
  .refine((n) => !NOT_SETTABLE.has(n), {
    message: "Lo pone kit-deploy: no se cambia a mano.",
  })
  .refine((n) => !RUNTIME_NAME_RE.test(n), {
    message:
      "Configura el runtime (Node, TLS, proxies), no la app: no se puede definir.",
  });

/**
 * A variable's value. Not trimmed: spaces can be part of a key. Only the line break a textarea
 * or a paste leaves at the end goes; empty or whitespace-only is refused, and so is anything a
 * Docker env file cannot carry (lib/core/env assertEnvValue).
 */
export const envValueField = z
  .string({ message: "Falta el valor." })
  .transform((v) => v.replace(/\r?\n$/, ""))
  .refine((v) => v.trim().length > 0, { message: "Falta el valor." })
  .refine((v) => !/[\r\n\0]/.test(v), {
    message: "Una sola línea: el valor no puede tener saltos de línea.",
  })
  .refine((v) => new TextEncoder().encode(v).length <= MAX_VALUE_BYTES, {
    message: `Como mucho ${MAX_VALUE_BYTES / 1024} KiB.`,
  });

/** An HTML checkbox: present ("on") or absent. */
export const checkbox = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

export const hostField = text(MAX.host, "Falta el dominio.")
  .transform((h) => h.toLowerCase())
  .refine(
    (h) =>
      /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/.test(
        h,
      ),
    { message: "Escribe un dominio como tienda.com o www.tienda.com." },
  );

export const redirectField = z.enum(["none", "to_apex", "to_www"], {
  message: "Elige una de las tres opciones.",
});

/** The name typed in a confirmation dialog; compared on the server with the real one. */
export const confirmField = text(MAX.host, "Escribe el nombre para confirmar.");

const prField = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
  z
    .number({ message: "Número de PR no válido." })
    .int({ message: "Número de PR no válido." })
    .min(1, { message: "Número de PR no válido." })
    .max(999_999, { message: "Número de PR no válido." })
    .optional(),
);

const uuidField = (message: string) => z.uuid({ message });

// ── Forms ──

export const envSetSchema = z.object({
  project: projectField,
  name: envNameField,
  value: envValueField,
  secret: checkbox,
  environments: z
    .array(environmentField)
    .min(1, { message: "Marca al menos un entorno." })
    .max(ENVIRONMENTS.length)
    .transform((list) => [...new Set(list)]),
});

export const envRemoveSchema = z.object({
  project: projectField,
  environment: environmentField,
  name: envNameField,
  confirm: confirmField,
});

export const redeploySchema = z.object({ project: projectField, pr: prField });

export const rollbackSchema = z.object({
  project: projectField,
  confirm: confirmField,
  /** "Rollback a este": a kept deployment; absent = one step back. */
  to: z.preprocess(
    (v) => (v === "" ? undefined : v),
    uuidField("Despliegue no válido.").optional(),
  ),
});

export const projectOnlySchema = z.object({ project: projectField });

export const stopSchema = z.object({
  project: projectField,
  confirm: confirmField,
});

/** Eliminar proyecto (D069): the name typed, and the app's current 6 digits (spaces allowed, as
 * some apps show "123 456"). The code is never echoed in a message. */
export const projectRemoveSchema = z.object({
  project: projectField,
  confirm: confirmField,
  code: z
    .string({ message: "Escribe los 6 dígitos de tu app." })
    .trim()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(
      z.string().regex(/^\d{6}$/, {
        message: "Escribe los 6 dígitos de tu app.",
      }),
    ),
});

export const domainAddSchema = z.object({
  project: projectField,
  host: hostField,
  redirect: z.preprocess(
    (v) => (v === "" ? undefined : v),
    redirectField.default("none"),
  ),
});

export const domainRemoveSchema = z.object({
  project: projectField,
  host: hostField,
  confirm: confirmField,
  /** The project's default `<project>.fockus.dev` needs it, like `domain rm --force`. */
  force: checkbox,
});

export const domainRedirectSchema = z.object({
  project: projectField,
  host: hostField,
  redirect: redirectField,
});

export const projectCreateSchema = z.object({
  name: projectField
    .refine((n) => !n.endsWith("_preview"), {
      message:
        "No puede terminar en _preview: es el sufijo de las bases de previews.",
    })
    .refine((n) => !isReservedProject(n), {
      message:
        "Ese nombre está reservado: es el de una base de la plataforma o de Postgres.",
    }),
  repo: text(MAX.repo, "Falta el repositorio.").regex(REPO_RE, {
    message: "Escribe el repositorio como owner/nombre.",
  }),
  branch: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    text(MAX.branch, "Falta la rama.")
      .regex(BRANCH_RE, { message: "Rama no válida." })
      .refine((b) => !b.includes(".."), { message: "Rama no válida." })
      .default("main"),
  ),
  memoryMb: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z
      .number({ message: "Elige la memoria." })
      .int({ message: "Elige la memoria." })
      .min(MEMORY_MB.min, {
        message: `Entre ${MEMORY_MB.min} y ${MEMORY_MB.max} MB.`,
      })
      .max(MEMORY_MB.max, {
        message: `Entre ${MEMORY_MB.min} y ${MEMORY_MB.max} MB.`,
      })
      .default(512),
  ),
});

export const tokenCreateSchema = z.object({
  project: projectField,
  label: z
    .string()
    .trim()
    .max(MAX.tokenLabel, {
      message: `Como mucho ${MAX.tokenLabel} caracteres.`,
    })
    .default(""),
});

export const tokenRevokeSchema = z.object({
  id: uuidField("Token no válido."),
  confirm: confirmField,
});

/** Eliminar passkey (D055): Better Auth's text id, and the app's 6 digits (spaces allowed, as
 * some apps show "123 456"). The code is never echoed in a message. */
export const passkeyRemoveSchema = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/, { message: "Passkey no válida." }),
  code: z
    .string({ message: "Escribe los 6 dígitos de tu app." })
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(
      z.string().regex(/^\d{6}$/, {
        message: "Escribe los 6 dígitos de tu app.",
      }),
    ),
});

/** Ajustes › Códigos de recuperación › Ver / Generar nuevos (D067): only the app's 6 digits,
 * read exactly as Eliminar passkey reads them. */
export const backupCodesSchema = z.object({
  code: passkeyRemoveSchema.shape.code,
});

/** Logs page filters (read, not an action): the agent's own bounds (agent/protocol.ts). */
export const logEnvField = z
  .string()
  .regex(/^(?:production|pr-[1-9][0-9]{0,5})$/, {
    message: "Despliegue no válido.",
  });
export const logLevelField = z.enum(["error", "warn", "info"]);
export const logDayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Día no válido." });
export const logQueryField = z
  .string()
  .trim()
  .min(1)
  .max(MAX.logQuery, { message: `Como mucho ${MAX.logQuery} caracteres.` })
  .regex(/^[^\p{Cc}]+$/u, { message: "Texto no válido." });

/** FormData → a plain object for the schemas; `arrays` are the multi-valued fields. Files are
 * never expected and are dropped. */
export function formToObject(
  form: FormData,
  arrays: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    // React's own fields ($ACTION_…) are not the form's.
    if (key.startsWith("$ACTION")) continue;
    const values = form.getAll(key).filter((v) => typeof v === "string");
    out[key] = arrays.includes(key) ? values : values[0];
  }
  for (const key of arrays) if (!(key in out)) out[key] = [];
  return out;
}
