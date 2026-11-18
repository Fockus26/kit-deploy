"use client";

import { Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { redeployAction } from "@/app/(panel)/actions/deployments";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { deploymentBadge, formatDuration } from "@/lib/kit/panel-format";
import type { DeploymentDetail } from "@/lib/panel/data";
import { AgentDown } from "./agent-down";
import { RollbackButton } from "./rollback-button";
import { useServerAction } from "./use-server-action";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-border border-b py-3 last:border-b-0">
      <dt className="text-eyebrow text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </dt>
      <dd className="font-mono text-mono [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function Health({ health }: { health: DeploymentDetail["health"] }) {
  if (health === null) return <>Sin contenedor en marcha</>;
  if ("unavailable" in health) return <AgentDown />;
  return (
    <>
      {health.ok ? "Responde" : "No responde"}
      {health.status !== null ? ` (HTTP ${health.status})` : ""}
    </>
  );
}

/**
 * HANDOFF §3 Despliegues: the detail in a right Sheet (480px at most): image, container, port,
 * health check and what happened, with Redeploy (a live one) and Rollback (a kept one). It is
 * open while `?d=` names it; closing goes to `closeHref` (the same filters, without `d`).
 */
export function DeploymentSheet({
  project,
  detail,
  liveSha,
  closeHref,
}: {
  project: string;
  detail: DeploymentDetail;
  liveSha: string | null;
  closeHref: string;
}) {
  const router = useRouter();
  const redeploy = useServerAction(redeployAction);
  const canRedeploy = detail.status === "live";

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.replace(closeHref, { scroll: false });
      }}
    >
      <SheetContent side="right" className="overflow-y-auto p-6">
        <SheetTitle className="pr-10 font-mono">{detail.shortSha}</SheetTitle>
        <SheetDescription className="mt-1">
          {detail.environment === "preview"
            ? `Preview del PR #${detail.pr}`
            : "Producción"}{" "}
          · generación {detail.generation}
        </SheetDescription>
        <div className="mt-3">
          <StatusBadge
            {...deploymentBadge(detail.status, detail.environment)}
          />
        </div>
        <dl className="mt-4">
          <Row label="Imagen">{detail.image}</Row>
          <Row label="Contenedor">{detail.container ?? "—"}</Row>
          <Row label="Puerto">{detail.port ?? "—"}</Row>
          <Row label="Health check">
            <Health health={detail.health} />
          </Row>
          <Row label="Creado">
            <RelativeTime date={detail.createdAt} />
          </Row>
          <Row label="Terminó">
            {detail.finishedAt ? (
              <>
                <RelativeTime date={detail.finishedAt} /> ·{" "}
                {formatDuration(detail.durationS)}
              </>
            ) : (
              "En curso"
            )}
          </Row>
          {detail.error ? <Row label="Error">{detail.error}</Row> : null}
        </dl>
        {canRedeploy || detail.rollbackable ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {detail.rollbackable ? (
                <RollbackButton
                  project={project}
                  fromSha={liveSha}
                  to={{ id: detail.id, sha: detail.shortSha }}
                  label="Rollback a este"
                />
              ) : null}
              {canRedeploy ? (
                <Button
                  loading={redeploy.pending}
                  onClick={() =>
                    redeploy.run({
                      project,
                      ...(detail.pr ? { pr: String(detail.pr) } : {}),
                    })
                  }
                >
                  <Rocket aria-hidden="true" />
                  Redeploy
                </Button>
              ) : null}
            </div>
            {redeploy.state ? (
              redeploy.state.ok ? (
                <output className="block text-caption text-muted-foreground">
                  {redeploy.state.already
                    ? "Ya hay un despliegue en curso."
                    : "Redeploy en cola."}
                </output>
              ) : (
                <p role="alert" className="text-caption text-destructive">
                  {redeploy.state.message}
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
