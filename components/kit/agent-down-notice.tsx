"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Notice } from "@/components/kit/notice";
import { Button, buttonVariants } from "@/components/ui/button";

/** The command that tells whether kit-agent is up, on the VPS (infra/kit-agent.service). */
export const AGENT_DIAGNOSTIC = "systemctl status kit-agent";

/**
 * HANDOFF §5b · service error: kit-agent did not answer for this section. The one notice for it:
 * only the section that needs kit-agent shows it; the rest of the page stays usable. "Reintentar"
 * reads the page again, or follows `retryHref` when the page's state lives in its URL.
 */
export function AgentDownNotice({
  title = "No se pudo hablar con kit-agent",
  retryHref,
  className,
}: {
  title?: string;
  retryHref?: string;
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
        retryHref ? (
          <Link
            href={retryHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RotateCw aria-hidden="true" />
            Reintentar
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RotateCw aria-hidden="true" />
            Reintentar
          </Button>
        )
      }
    >
      <p>Los sitios siguen sirviendo: no dependen del panel.</p>
      <p className="mt-1 text-muted-foreground">
        Diagnóstico en el servidor:{" "}
        <code className="font-mono text-foreground text-mono">
          {AGENT_DIAGNOSTIC}
        </code>
      </p>
    </Notice>
  );
}
