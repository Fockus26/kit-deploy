"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Notice } from "@/components/kit/notice";
import { Button } from "@/components/ui/button";

/** The command that tells whether kit-agent is up, on the VPS (infra/kit-agent.service). */
export const AGENT_DIAGNOSTIC = "systemctl status kit-agent";

/**
 * HANDOFF §5b · error de servicio: kit-agent did not answer. Only the section that needs it shows
 * this; the rest of the page stays usable. "Reintentar" reads the page again.
 */
export function AgentDown({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Notice
      tone="destructive"
      title="No se pudo hablar con kit-agent"
      className={className}
      actions={
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RotateCw aria-hidden="true" />
          Reintentar
        </Button>
      }
    >
      <p>Los sitios siguen sirviendo: no dependen del panel.</p>
      <p className="mt-1 text-muted-foreground">
        Diagnóstico en el servidor:{" "}
        <code className="font-mono text-mono text-foreground">
          {AGENT_DIAGNOSTIC}
        </code>
      </p>
    </Notice>
  );
}
