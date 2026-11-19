import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentDownNotice } from "@/components/kit/agent-down-notice";
import { Field } from "@/components/kit/field";
import { OptionSelect } from "@/components/kit/option-select";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { LogsExplorer } from "@/components/logs/logs-explorer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FOLLOW_LINES,
  LEVEL_ALL,
  LOG_QUERY_MAX,
  type LogRow,
  parseLogFilter,
} from "@/lib/kit/logs-page";
import {
  isUnavailable,
  type LogsFilters,
  logFilters,
  logsSearch,
  logsTail,
} from "@/lib/panel/data";

export const metadata = { title: "Logs" };

type Search = Record<string, string | string[] | undefined>;

export default function LogsPage({
  params,
  searchParams,
}: PageProps<"/p/[project]/logs">) {
  return (
    <Suspense fallback={<SkeletonCard title="Logs" rows={5} />}>
      <Logs params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const LEVEL_OPTIONS = [
  { value: LEVEL_ALL, label: "Todos los niveles" },
  { value: "error", label: "Error" },
  { value: "warn", label: "Aviso" },
  { value: "info", label: "Info" },
] as const;

async function Logs({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<Search>;
}) {
  const { project } = await params;
  const sp = await searchParams;
  const filters = await logFilters(project);
  if (!filters) notFound();
  const f = parseLogFilter(sp, filters.sources, filters.days);

  return (
    <section aria-labelledby="logs" className="flex flex-col gap-4">
      <div>
        <h2 id="logs" className="font-semibold text-foreground text-h2">
          Logs
        </h2>
        <p className="text-caption text-muted-foreground">
          Hoy se siguen en vivo; otro día o un texto de búsqueda muestra las
          líneas que coinciden, las más recientes primero. La búsqueda es de
          texto literal, sin distinguir mayúsculas.
        </p>
      </div>
      <FilterBar filters={filters} f={f} />
      <Results project={project} f={f} />
    </section>
  );
}

function FilterBar({
  filters,
  f,
}: {
  filters: LogsFilters;
  f: ReturnType<typeof parseLogFilter>;
}) {
  return (
    <form
      method="get"
      aria-label="Filtros de logs"
      className="flex flex-wrap items-end gap-3"
    >
      <Field label="Despliegue" className="min-w-0 flex-1 basis-40">
        {(a11y) => (
          <OptionSelect
            name="env"
            defaultValue={f.env}
            options={filters.sources.map((s) => ({
              value: s.env,
              label: s.label,
            }))}
            {...a11y}
          />
        )}
      </Field>
      <Field label="Día (UTC)" className="min-w-0 flex-1 basis-40">
        {(a11y) => (
          <OptionSelect
            name="day"
            defaultValue={f.day}
            options={filters.days.map((d, i) => ({
              value: d,
              label: i === 0 ? `${d} (hoy)` : d,
            }))}
            {...a11y}
          />
        )}
      </Field>
      <Field label="Buscar texto" className="min-w-0 flex-[2] basis-52">
        {(a11y) => (
          <Input
            type="search"
            name="q"
            defaultValue={f.query ?? ""}
            maxLength={LOG_QUERY_MAX}
            autoComplete="off"
            spellCheck={false}
            {...a11y}
          />
        )}
      </Field>
      <Field label="Nivel" className="min-w-0 flex-1 basis-40">
        {(a11y) => (
          <OptionSelect
            name="level"
            defaultValue={f.level ?? LEVEL_ALL}
            options={LEVEL_OPTIONS}
            {...a11y}
          />
        )}
      </Field>
      <Button type="submit">Aplicar</Button>
    </form>
  );
}

async function Results({
  project,
  f,
}: {
  project: string;
  f: ReturnType<typeof parseLogFilter>;
}) {
  // Search answers newest first; the viewer reads oldest first.
  const read = async () => {
    if (f.mode === "live") {
      const tail = await logsTail(project, f.env, f.level, FOLLOW_LINES);
      return isUnavailable(tail) ? tail : { entries: tail.entries, next: null };
    }
    const found = await logsSearch(project, f.day, f.query, f.env, f.level);
    return isUnavailable(found)
      ? found
      : { entries: [...found.entries].reverse(), next: found.next };
  };
  const res = await read();
  if (isUnavailable(res)) {
    const here = new URLSearchParams({ env: f.env, day: f.day });
    if (f.level) here.set("level", f.level);
    if (f.query) here.set("q", f.query);
    return <AgentDownNotice retryHref={`/p/${project}/logs?${here}`} />;
  }
  const entries: LogRow[] = res.entries.map((e) => ({
    ts: e.ts,
    level: e.level,
    line: e.line,
  }));
  return (
    <LogsExplorer
      key={`${f.env}|${f.day}|${f.level ?? ""}|${f.query ?? ""}`}
      project={project}
      filter={f}
      initial={entries}
      initialNext={res.next}
    />
  );
}
