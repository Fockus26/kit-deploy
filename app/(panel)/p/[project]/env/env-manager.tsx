"use client";

import { KeyRound, Lock } from "lucide-react";
import type * as React from "react";
import {
  createContext,
  startTransition,
  use,
  useActionState,
  useRef,
  useState,
} from "react";
import {
  rebuildAction,
  redeployAction,
} from "@/app/(panel)/actions/deployments";
import { removeEnvVarAction, setEnvVarAction } from "@/app/(panel)/actions/env";
import { AgentDownNotice } from "@/components/kit/agent-down-notice";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import {
  FieldCheckbox,
  FieldInput,
  FieldTextarea,
} from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import { RelativeTime } from "@/components/kit/relative-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENVIRONMENTS, type Environment } from "@/lib/core/env";
import type { EnvNeeds } from "@/lib/ops/env";
import type { EnvListData, EnvVar } from "@/lib/panel/data";
import { ENV_TAB_LABEL, envListText } from "@/lib/panel/resource-labels";
import { MAX } from "@/lib/panel/schemas";
import { ActionFailureNotice } from "../_parts/action-notice";

type Lists = Record<Environment, EnvListData>;

/** The row actions need the page's state; the column definitions stay at module scope. */
const RowContext = createContext<{
  project: string;
  environment: Environment;
  removing: string | null;
  edit: (v: EnvVar) => void;
  remove: (v: EnvVar) => void;
} | null>(null);

function RowActions({ row }: { row: EnvVar }) {
  const ctx = use(RowContext);
  if (!ctx) return null;
  const verb = row.secret ? "Reemplazar" : "Editar";
  const where = ENV_TAB_LABEL[ctx.environment];
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-label={`${verb} ${row.name}`}
        onClick={() => ctx.edit(row)}
      >
        {verb}
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            variant="destructive-text"
            size="sm"
            loading={ctx.removing === row.name}
            aria-label={`Borrar ${row.name}`}
          >
            Borrar
          </Button>
        }
        title={`Borrar ${row.name} de ${where} en ${ctx.project}`}
        description={
          <p>
            La variable deja de existir en {where}; la app la pierde en el
            próximo despliegue. No se puede deshacer.
          </p>
        }
        confirmLabel="Borrar variable"
        confirmName={ctx.project}
        onConfirm={() => ctx.remove(row)}
      />
    </div>
  );
}

const col = dataTableColumns<EnvVar>();
const columns: DataTableColumn<EnvVar>[] = col.columns([
  col.accessor("name", {
    header: "Nombre",
    cell: (c) => (
      <span className="font-medium font-mono text-foreground">
        {c.getValue()}
      </span>
    ),
  }),
  col.display({
    id: "value",
    header: "Valor",
    cell: (c) => {
      const v = c.row.original;
      // Fixed text, not the value masked: a secret's value never reaches the browser.
      if (v.secret)
        return (
          <span className="font-mono text-muted-foreground">
            <span aria-hidden="true">••••••••</span>
            <span className="sr-only">Valor oculto</span>
          </span>
        );
      if (v.value === null)
        return <span className="text-muted-foreground">No disponible</span>;
      return <span className="font-mono">{v.value}</span>;
    },
  }),
  col.display({
    id: "type",
    header: "Tipo",
    cell: (c) => {
      const v = c.row.original;
      return v.secret ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 text-caption">
          <Lock aria-hidden="true" className="size-3" />
          Secreta
        </span>
      ) : (
        <span className="inline-flex rounded-sm border border-border px-1.5 text-caption text-muted-foreground">
          {v.public ? "Pública" : "Visible"}
        </span>
      );
    },
  }),
  col.accessor("updatedAt", {
    header: "Modificada",
    cell: (c) => (
      <RelativeTime
        date={c.getValue()}
        className="whitespace-nowrap text-muted-foreground"
      />
    ),
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: (c) => <RowActions row={c.row.original} />,
  }),
]);

/** What the notice after saving or deleting says and offers (HANDOFF §3: Rebuild / Redeploy). */
type Done = {
  title: string;
  /** "Se guardó en Producción y Preview." (empty for a deletion: the title says where). */
  detail: string;
  name: string;
  environments: Environment[];
  needs: EnvNeeds;
};

export function EnvManager({
  project,
  lists,
}: {
  project: string;
  lists: Lists;
}) {
  const [tab, setTab] = useState<Environment>("production");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState(true);
  const [envs, setEnvs] = useState<Environment[]>(["production"]);
  const [editing, setEditing] = useState<EnvVar | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<unknown>(null);
  const valueRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, saving] = useActionState(setEnvVarAction, null);
  const [removeState, removeAction, removePending] = useActionState(
    removeEnvVarAction,
    null,
  );
  const [lastOp, setLastOp] = useState<"save" | "remove" | null>(null);
  // Each save or deletion gets a fresh notice (its Rebuild / Redeploy start over).
  const [opSeq, setOpSeq] = useState(0);

  // A save that went through starts a new variable; a refused one keeps what was typed but the
  // value (which the form never holds anyway).
  const [seenSave, setSeenSave] = useState(saveState);
  if (saveState !== seenSave) {
    setSeenSave(saveState);
    if (saveState?.ok) {
      setName("");
      setEditing(null);
      setSecret(true);
    }
  }

  function clearValue() {
    if (valueRef.current) valueRef.current.value = "";
  }

  function edit(v: EnvVar) {
    setEditing(v);
    setName(v.name);
    setSecret(v.secret);
    setEnvs([tab]);
    if (valueRef.current)
      // A plain value is on the page already; a secret's is never in the browser.
      valueRef.current.value = v.secret ? "" : (v.value ?? "");
    valueRef.current?.focus();
  }

  function cancel() {
    setEditing(null);
    setName("");
    setSecret(true);
    setEnvs([tab]);
    clearValue();
    nameRef.current?.focus();
  }

  function remove(v: EnvVar) {
    const form = new FormData();
    form.set("project", project);
    form.set("environment", tab);
    form.set("name", v.name);
    // The dialog's button only enables once the project's name is typed exactly.
    form.set("confirm", project);
    setRemoving(v.name);
    setLastOp("remove");
    setOpSeq((n) => n + 1);
    startTransition(() => removeAction(form));
  }

  const op = lastOp === "remove" ? removeState : saveState;
  const pending = lastOp === "remove" ? removePending : saving;
  let done: Done | null = null;
  if (op?.ok && !pending && dismissed !== op) {
    done =
      "created" in op
        ? {
            title: `${op.name} guardada`,
            detail: `Se guardó en ${envListText(op.environments)}.`,
            name: op.name,
            environments: op.environments,
            needs: op.needs,
          }
        : {
            title: op.removed
              ? `${op.name} borrada de ${ENV_TAB_LABEL[op.environment]}`
              : `${op.name} ya no estaba en ${ENV_TAB_LABEL[op.environment]}`,
            detail: "",
            name: op.name,
            environments: [op.environment],
            needs: op.needs,
          };
  }
  const removeFailure =
    lastOp === "remove" && removeState && !removeState.ok ? removeState : null;
  const saveFailure = saveState && !saveState.ok ? saveState : null;
  const fieldError = (key: string) => saveFailure?.fields?.[key];

  const current = lists[tab];
  const formTitle = editing
    ? `${editing.secret ? "Reemplazar" : "Editar"} ${editing.name}`
    : "Nueva variable";

  return (
    <div className="flex flex-col gap-6">
      {done ? (
        <AfterChange
          key={opSeq}
          project={project}
          done={done}
          onLater={() => setDismissed(op)}
        />
      ) : null}
      {removeFailure ? (
        <ActionFailureNotice
          failure={removeFailure}
          title="No se pudo borrar la variable"
        />
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:flex-wrap">
        <section
          aria-labelledby="variables-lista"
          className="flex min-w-0 flex-col gap-3 lg:flex-[3_1_560px]"
        >
          <h2 id="variables-lista" className="sr-only">
            Variables por entorno
          </h2>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              const next = v as Environment;
              setTab(next);
              if (!editing) setEnvs([next]);
            }}
          >
            <TabsList aria-label="Entorno">
              {ENVIRONMENTS.map((e) => (
                <TabsTrigger key={e} value={e}>
                  {ENV_TAB_LABEL[e]}{" "}
                  <span className="font-mono text-caption text-muted-foreground">
                    <span className="sr-only">(</span>
                    {current.counts[e]}
                    <span className="sr-only">
                      {current.counts[e] === 1 ? " variable)" : " variables)"}
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {ENVIRONMENTS.map((e) => {
              const list = lists[e];
              const hiddenValues =
                list.values !== "ok" && list.vars.some((v) => !v.secret);
              return (
                <TabsContent
                  key={e}
                  value={e}
                  className="flex flex-col gap-3 pt-3"
                >
                  {hiddenValues ? (
                    <AgentDownNotice title="No se pudieron abrir los valores visibles" />
                  ) : null}
                  <RowContext
                    value={{
                      project,
                      environment: e,
                      removing: removePending ? removing : null,
                      edit,
                      remove,
                    }}
                  >
                    <DataTable
                      columns={columns}
                      data={list.vars}
                      caption={`Variables de ${ENV_TAB_LABEL[e]} en ${project}`}
                      minWidth={640}
                      getRowId={(v) => v.name}
                      empty={
                        <EmptyState
                          icon={KeyRound}
                          title={`Sin variables en ${ENV_TAB_LABEL[e]}`}
                        >
                          Añade la primera con el formulario.
                        </EmptyState>
                      }
                    />
                  </RowContext>
                </TabsContent>
              );
            })}
          </Tabs>

          <section
            aria-labelledby="gestionadas"
            className="flex flex-col gap-2 rounded-lg border border-border border-dashed bg-card p-4"
          >
            <h3
              id="gestionadas"
              className="font-semibold text-foreground text-h3"
            >
              Gestionadas por la plataforma
            </h3>
            <p className="text-caption text-muted-foreground">
              Las pone kit-deploy en cada despliegue: no se ven ni se editan
              aquí.
            </p>
            <ul className="flex flex-col gap-2">
              {current.managed.map((m) => (
                <li
                  key={m}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <span className="font-medium font-mono text-mono [overflow-wrap:anywhere]">
                    {m}
                  </span>
                  <span className="rounded-sm border border-border px-1.5 font-medium text-eyebrow text-muted-foreground uppercase tracking-[0.08em]">
                    Gestionada
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </section>

        <section
          aria-labelledby="variable-form"
          className="flex min-w-0 flex-col gap-4 self-start rounded-lg border border-border bg-card p-5 lg:flex-[1_1_320px]"
        >
          <h2
            id="variable-form"
            className="font-semibold text-foreground text-h2 [overflow-wrap:anywhere]"
          >
            {formTitle}
          </h2>
          {saveFailure && !saveFailure.fields ? (
            <ActionFailureNotice
              failure={saveFailure}
              title="No se pudo guardar la variable"
            />
          ) : null}
          <form
            method="post"
            action={(form) => {
              // The value leaves with this FormData and is gone from the page: it is never
              // kept in state, and the field is empty again on success and on error.
              clearValue();
              setLastOp("save");
              setOpSeq((n) => n + 1);
              setDismissed(null);
              saveAction(form);
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="project" value={project} />
            <FieldInput
              ref={nameRef}
              label="Nombre"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="STRIPE_SECRET_KEY"
              error={fieldError("name")}
              required
              maxLength={MAX.envName}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="[&_input]:font-mono"
            />
            <FieldTextarea
              ref={valueRef}
              label="Valor"
              name="value"
              rows={3}
              placeholder={
                editing?.secret
                  ? "El valor nuevo (el actual no se muestra)"
                  : undefined
              }
              help={
                editing?.secret
                  ? "Reemplaza el valor guardado: el actual no se puede ver."
                  : "Una sola línea. Si es secreta, no se vuelve a mostrar."
              }
              error={fieldError("value")}
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              className="[&_textarea]:font-mono"
            />
            <FieldCheckbox
              label="Secreta"
              name="secret"
              checked={secret}
              onCheckedChange={(v) => setSecret(v === true)}
              help="Las NEXT_PUBLIC_* nunca lo son: van en el código del navegador."
              error={fieldError("secret")}
            />
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={
                fieldError("environments") ? "env-error" : undefined
              }
            >
              <legend className="mb-1.5 font-medium text-body">Entornos</legend>
              {ENVIRONMENTS.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <Checkbox
                    id={`env-${e}`}
                    name="environments"
                    value={e}
                    checked={envs.includes(e)}
                    onCheckedChange={(v) =>
                      setEnvs((list) =>
                        v === true
                          ? [...list.filter((x) => x !== e), e]
                          : list.filter((x) => x !== e),
                      )
                    }
                    aria-invalid={fieldError("environments") ? true : undefined}
                  />
                  <Label htmlFor={`env-${e}`}>{ENV_TAB_LABEL[e]}</Label>
                </div>
              ))}
              {fieldError("environments") ? (
                <p id="env-error" className="text-caption text-destructive">
                  {fieldError("environments")}
                </p>
              ) : null}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                Guardar
              </Button>
              <Button type="button" variant="outline" onClick={cancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

/** HANDOFF §3: the notice after saving — Rebuild for NEXT_PUBLIC_*, Redeploy otherwise. */
function AfterChange({
  project,
  done,
  onLater,
}: {
  project: string;
  done: Done;
  onLater: () => void;
}) {
  const [rebuildState, rebuild, rebuilding] = useActionState(
    rebuildAction,
    null,
  );
  const [redeployState, redeploy, redeploying] = useActionState(
    redeployAction,
    null,
  );
  const production = done.environments.includes("production");

  if (rebuildState?.ok)
    return (
      <Notice tone="info" title="Rebuild lanzado">
        GitHub construye{" "}
        <span className="font-mono">
          {rebuildState.repo}@{rebuildState.branch}
        </span>{" "}
        y la plataforma lo despliega al terminar.
      </Notice>
    );
  if (redeployState?.ok)
    return (
      <Notice
        tone="info"
        title={
          redeployState.already
            ? "Ya había un redeploy en camino"
            : "Redeploy en cola"
        }
      >
        Despliegue{" "}
        <span className="font-mono">
          {redeployState.deployment.sha.slice(0, 7)}
        </span>{" "}
        con las variables de hoy.
      </Notice>
    );

  const failure =
    rebuildState && !rebuildState.ok
      ? rebuildState
      : redeployState && !redeployState.ok
        ? redeployState
        : null;

  const form = (
    action: (f: FormData) => void,
    label: string,
    loading: boolean,
  ) => (
    <form method="post" action={action}>
      <input type="hidden" name="project" value={project} />
      <Button type="submit" size="sm" loading={loading}>
        {label}
      </Button>
    </form>
  );
  const later = (
    <Button type="button" size="sm" variant="outline" onClick={onLater}>
      Más tarde
    </Button>
  );

  let body: string;
  let actions: React.ReactNode = null;
  if (done.needs === "rebuild") {
    body = production
      ? `${done.name} se incrusta al construir: producción la verá tras un rebuild.`
      : `${done.name} se incrusta al construir: los previews la toman en su próximo push.`;
    if (production)
      actions = (
        <>
          {form(rebuild, "Rebuild", rebuilding)}
          {later}
        </>
      );
  } else if (done.needs === "redeploy") {
    body = production
      ? "Producción la usará en el próximo despliegue; redespliega para aplicarla ya."
      : "Los previews la usan desde su próximo push.";
    if (production)
      actions = (
        <>
          {form(redeploy, "Redeploy", redeploying)}
          {later}
        </>
      );
  } else {
    body = "En desarrollo se trae con kit-deploy env pull.";
  }

  return (
    <>
      <Notice tone="info" title={done.title} actions={actions}>
        {done.detail ? `${done.detail} ${body}` : body}
      </Notice>
      {failure ? (
        <ActionFailureNotice
          failure={failure}
          title={
            failure === rebuildState
              ? "No se pudo lanzar el rebuild"
              : "No se pudo redesplegar"
          }
        />
      ) : null}
    </>
  );
}
