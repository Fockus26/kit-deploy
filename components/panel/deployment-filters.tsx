"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { OptionSelect } from "@/components/kit/option-select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DeploymentStatus } from "@/lib/db/schema";
import { deploymentsHref } from "@/lib/kit/deployments-url";

// A Select item cannot be "": this is "Todos".
const STATUS_ALL = "all";

type Env = "production" | "preview";

export const STATUS_OPTIONS: { value: DeploymentStatus; label: string }[] = [
  { value: "live", label: "Activo" },
  { value: "queued", label: "En cola" },
  { value: "starting", label: "Construyendo" },
  { value: "failed", label: "Falló" },
  { value: "superseded", label: "Guardado" },
  { value: "asleep", label: "Dormido" },
];

/**
 * HANDOFF §3 Despliegues: EnvTabs (Producción / Preview, with their counts) and a status select.
 * Both are filters of the URL: the page reads `?env=` and `?status=` again. The table is the
 * children, inside the tabs' panel of the environment on show.
 */
export function DeploymentFilters({
  project,
  env,
  status,
  counts,
  children,
}: {
  project: string;
  env: Env;
  status?: DeploymentStatus;
  counts: { production: number; preview: number };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const selectId = useId();
  const go = (e: Env, s?: DeploymentStatus) =>
    router.replace(deploymentsHref(project, e, s), { scroll: false });
  const panel = (value: Env) => (
    <TabsContent value={value} forceMount hidden={env !== value}>
      {env === value ? children : null}
    </TabsContent>
  );

  return (
    <Tabs value={env} onValueChange={(v) => go(v as Env, status)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <TabsList aria-label="Entorno">
          <TabsTrigger value="production">
            Producción
            <span className="font-mono text-caption text-muted-foreground">
              {counts.production}
            </span>
          </TabsTrigger>
          <TabsTrigger value="preview">
            Preview
            <span className="font-mono text-caption text-muted-foreground">
              {counts.preview}
            </span>
          </TabsTrigger>
        </TabsList>
        <div className="flex max-w-full items-center gap-2">
          <Label htmlFor={selectId} className="text-body">
            Estado
          </Label>
          <OptionSelect
            id={selectId}
            value={status ?? STATUS_ALL}
            onValueChange={(v) =>
              go(env, v === STATUS_ALL ? undefined : (v as DeploymentStatus))
            }
            options={[{ value: STATUS_ALL, label: "Todos" }, ...STATUS_OPTIONS]}
            className="w-auto min-w-0 sm:min-w-40"
          />
        </div>
      </div>
      {panel("production")}
      {panel("preview")}
    </Tabs>
  );
}
