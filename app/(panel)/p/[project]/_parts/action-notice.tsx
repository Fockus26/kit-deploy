import { AgentDownNotice } from "@/components/kit/agent-down-notice";
import { Notice } from "@/components/kit/notice";
import type { ActionFailure } from "@/lib/panel/actions/core";

/**
 * A Server Action's refusal, above the form that sent it: kit-agent down is the HANDOFF §5b
 * service error; anything else is a destructive Notice with the action's own words (they never
 * echo what was typed as a value). Field problems are shown on their fields, not here.
 */
export function ActionFailureNotice({
  failure,
  title = "No se pudo completar",
  className,
}: {
  failure: ActionFailure;
  /** What did not happen, e.g. "No se pudo guardar la variable". */
  title?: string;
  className?: string;
}) {
  if (failure.code === "agent")
    return (
      <AgentDownNotice
        title={
          failure.message.startsWith("No se pudo hablar")
            ? "No se pudo hablar con kit-agent"
            : failure.message
        }
        className={className}
      />
    );
  return (
    <Notice
      tone="destructive"
      title={failure.code === "unauthorized" ? "Tu sesión ha caducado" : title}
      className={className}
    >
      {failure.message}
      {failure.code === "unauthorized" ? (
        <>
          {" "}
          <a
            href="/login"
            className="text-primary-text underline underline-offset-4"
          >
            Entrar de nuevo
          </a>
        </>
      ) : null}
    </Notice>
  );
}
