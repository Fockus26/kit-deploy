"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { createProjectAction } from "@/app/(panel)/actions/projects";
import { CommandLine } from "@/components/kit/command-line";
import { Field, FieldInput } from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import { OptionSelect } from "@/components/kit/option-select";
import { RepoCombobox } from "@/components/kit/repo-combobox";
import { TokenOnce } from "@/components/kit/token-once";
import { Button, buttonVariants } from "@/components/ui/button";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import {
  branchAfterPick,
  DEFAULT_BRANCH,
  type RepoList,
} from "@/lib/github/repo-filter";
import type { ProjectCreateResult } from "@/lib/panel/actions/projects";
import { MAX, MEMORY_CHOICES } from "@/lib/panel/schemas";

type State =
  | { kind: "result"; result: ProjectCreateResult }
  /** "Ya lo guardé": the token is gone from state; only the (public) name stays. */
  | { kind: "saved"; project: string }
  | null;

type Input = FormData | { clear: string };

/**
 * The token only ever lives in this state: never in a URL, never re-fetchable. `null` (not the
 * previous state) goes to the server, so an earlier token never rides along in a request.
 */
async function step(_prev: State, input: Input): Promise<State> {
  if (!(input instanceof FormData))
    return { kind: "saved", project: input.clear };
  return { kind: "result", result: await createProjectAction(null, input) };
}

const EMPTY = {
  name: "",
  repo: "",
  branch: DEFAULT_BRANCH,
  memoryMb: "512",
};

// PLACEHOLDER (CONTENT_CHECKLIST rows 44–45): provisional copy until César confirms it.
const REPO_HINT = {
  "no-token":
    "La lista de tus repos no está configurada en el servidor. Escribe owner/repo.",
  error:
    "No se pudo cargar la lista de tus repos de GitHub. Escribe owner/repo.",
} as const;

export function NewProjectForm({ repos }: { repos: RepoList }) {
  const [state, dispatch, pending] = useActionState(step, null);
  // Controlled: React resets a form after its action, and a refused form keeps what was typed.
  const [values, setValues] = useState(EMPTY);
  // Picking a repo fills "Rama" with its default branch (`main` for a typed one), until the user
  // edits that field.
  const [branchEdited, setBranchEdited] = useState(false);
  const savedRef = useRef<HTMLParagraphElement>(null);

  const result = state?.kind === "result" ? state.result : null;
  const failed = result && !result.ok ? result : null;
  const fields = failed?.fields ?? {};

  useEffect(() => {
    if (state?.kind === "saved") savedRef.current?.focus();
    if (state?.kind === "result" && state.result.ok) {
      setValues(EMPTY);
      setBranchEdited(false);
    }
  }, [state]);

  if (result?.ok) {
    return (
      <TokenOnce
        title={`Token de despliegue de ${result.project}`}
        token={result.token}
        onDone={() =>
          startTransition(() => dispatch({ clear: result.project }))
        }
      >
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-body">
            1. Guárdalo como secreto del repositorio
          </p>
          <p className="text-caption text-muted-foreground">
            Pega el token cuando el comando lo pida.
          </p>
          <CommandLine command={result.ghCommand} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-body">
            2. Fija su imagen en el servidor
          </p>
          <p className="text-caption text-muted-foreground">
            Lo hace root por SSH; hasta entonces sus contenedores no reciben
            variables.
          </p>
          <CommandLine command={result.pinCommand} />
        </div>
        {result.hosts.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-body">Dominios</p>
            <ul className="flex flex-col gap-1 font-mono text-mono [overflow-wrap:anywhere]">
              {result.hosts.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </TokenOnce>
    );
  }

  const set =
    (key: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      {state?.kind === "saved" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
          <p
            ref={savedRef}
            tabIndex={-1}
            className="min-w-0 flex-1 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Proyecto <span className="font-mono">{state.project}</span> creado.
            El primer despliegue llega con el siguiente push a su rama.
          </p>
          <Link
            href={`/p/${state.project}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Abrir el proyecto
          </Link>
        </div>
      ) : null}

      {failed ? (
        <Notice
          tone="destructive"
          title={failed.message}
          actions={
            failed.code === "unauthorized" ? (
              <Link
                href={`${LOGIN_PATH}?next=/new`}
                className={buttonVariants({ variant: "outline" })}
              >
                Entrar
              </Link>
            ) : undefined
          }
        />
      ) : null}

      <form
        action={dispatch}
        aria-labelledby="nuevo-proyecto-form"
        className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
      >
        <h2 id="nuevo-proyecto-form" className="font-semibold text-h2">
          Datos del proyecto
        </h2>
        <FieldInput
          label="Nombre"
          name="name"
          value={values.name}
          onChange={set("name")}
          help="Minúsculas, números y _; empieza por letra o número. Es también su subdominio y el nombre de su base."
          error={fields.name}
          required
          maxLength={MAX.project}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="[&_input]:font-mono"
        />
        {repos.kind === "ok" ? (
          <Field
            label="Repositorio"
            help="En GitHub, como owner/nombre."
            error={fields.repo}
          >
            {(a11y) => (
              <RepoCombobox
                {...a11y}
                name="repo"
                value={values.repo}
                repos={repos.repos}
                truncated={repos.truncated}
                onPick={(fullName, repo) =>
                  setValues((v) => ({
                    ...v,
                    repo: fullName,
                    branch: branchAfterPick(v.branch, repo, branchEdited),
                  }))
                }
              />
            )}
          </Field>
        ) : (
          <FieldInput
            label="Repositorio"
            name="repo"
            value={values.repo}
            onChange={set("repo")}
            help={REPO_HINT[repos.kind]}
            error={fields.repo}
            required
            maxLength={MAX.repo}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="[&_input]:font-mono"
          />
        )}
        <FieldInput
          label="Rama de producción"
          name="branch"
          value={values.branch}
          onChange={(e) => {
            setBranchEdited(true);
            set("branch")(e);
          }}
          help="Cada push a esta rama despliega producción."
          error={fields.branch}
          required
          maxLength={MAX.branch}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="[&_input]:font-mono"
        />
        <Field
          label="Memoria"
          help="El límite del contenedor de producción."
          error={fields.memoryMb}
        >
          {(a11y) => (
            <OptionSelect
              {...a11y}
              name="memoryMb"
              value={values.memoryMb}
              onValueChange={(v) => setValues((s) => ({ ...s, memoryMb: v }))}
              options={MEMORY_CHOICES.map((mb) => ({
                value: String(mb),
                label: `${mb} MB`,
              }))}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            Crear proyecto
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
