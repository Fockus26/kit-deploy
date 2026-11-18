/**
 * What each project action's result says, in the panel's words (Notice of the project header).
 * A failure carries the server's own message (lib/panel/actions/core.ts: Spanish, never a
 * secret). Pure, so it is tested without React.
 */

export type ActionKind = "redeploy" | "restart" | "stop" | "rollback";

export type Outcome = {
  tone: "info" | "destructive";
  title: string;
  body?: string;
};

type Result =
  | { ok: true; already?: boolean; seconds?: number }
  | { ok: false; message: string };

const FAILED: Record<ActionKind, string> = {
  redeploy: "No se pudo redesplegar",
  restart: "No se pudo reiniciar",
  stop: "No se pudo parar",
  rollback: "No se hizo el rollback",
};

export function outcomeOf(
  kind: ActionKind,
  r: Result,
  shas: { target: string | null },
): Outcome {
  if (!r.ok)
    return { tone: "destructive", title: FAILED[kind], body: r.message };
  switch (kind) {
    case "redeploy":
      return r.already
        ? {
            tone: "info",
            title: "Ya hay un despliegue en curso",
            body: "No se encoló otro: el estado se actualiza aquí en unos segundos.",
          }
        : {
            tone: "info",
            title: "Redeploy en cola",
            body: "Mismo commit y misma imagen, con un contenedor nuevo y las variables de hoy.",
          };
    case "restart":
      return { tone: "info", title: "Producción reiniciada" };
    case "stop":
      return {
        tone: "info",
        title: "Producción parada",
        body: "El sitio responde 502 hasta que lo reinicies.",
      };
    case "rollback":
      return {
        tone: "info",
        title: `Producción volvió a ${shas.target ?? "el despliegue anterior"}`,
        ...(typeof r.seconds === "number"
          ? { body: `Tardó ${r.seconds} s.` }
          : {}),
      };
  }
}
