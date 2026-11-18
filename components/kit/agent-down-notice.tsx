"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Notice } from "@/components/kit/notice";
import { Button } from "@/components/ui/button";

/**
 * HANDOFF §5b · service error: kit-agent did not answer for this section. Only the section that
 * needs it shows this; the rest of the page stays usable. Reintentar re-reads the page.
 */
export function AgentDownNotice({
  title = "No se pudo hablar con kit-agent",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Notice
      tone="destructive"
      title={title}
      className={className}
      actions={
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          Reintentar
        </Button>
      }
    >
      Los sitios siguen sirviendo: no dependen del panel. Para diagnosticar:{" "}
      <code className="font-mono text-mono [overflow-wrap:anywhere]">
        systemctl status kit-agent
      </code>
    </Notice>
  );
}
