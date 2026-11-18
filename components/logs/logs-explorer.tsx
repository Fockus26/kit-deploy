"use client";

import { Download, ScrollText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { LogViewer } from "@/components/kit/log-viewer";
import { Notice } from "@/components/kit/notice";
import { Button } from "@/components/ui/button";
import {
  FOLLOW_EVERY_MS,
  type LogFilter,
  type LogRow,
  logFileName,
  logFileText,
  toLines,
} from "@/lib/kit/logs-page";

/** A request that takes longer than this is a failed one (the poll tries again by itself). */
const REQUEST_TIMEOUT_MS = 8_000;

type TailBody = { entries: LogRow[] };
type SearchBody = { entries: LogRow[]; next: number | null };

function params(f: LogFilter, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ env: f.env, ...extra });
  if (f.level) q.set("level", f.level);
  return q;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * The Logs page's viewer. Live (today, no search): the server's first read, then `logsTail` every
 * 2 s while following; scrolling up pauses it. Search (another day or a text): one page and
 * "Cargar más" for the older one by the cursor. Download = exactly what is on screen.
 */
export function LogsExplorer({
  project,
  filter,
  initial,
  initialNext,
}: {
  project: string;
  filter: LogFilter;
  /** Oldest first, whatever the mode. */
  initial: LogRow[];
  /** Search mode: the cursor of the older page, null when there is none. */
  initialNext: number | null;
}) {
  const live = filter.mode === "live";
  const [rows, setRows] = useState<LogRow[]>(initial);
  const [following, setFollowing] = useState(live);
  const [lost, setLost] = useState(false);
  const [next, setNext] = useState<number | null>(initialNext);
  const [loading, setLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const base = `/p/${project}/logs`;

  // Live follow: one request at a time, the next one 2 s after the last answer.
  const query = params(filter).toString();
  useEffect(() => {
    if (!live || !following) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const body = await getJson<TailBody>(`${base}/tail?${query}`);
      if (stop) return;
      if (body) {
        setRows(body.entries);
        setLost(false);
      } else setLost(true);
      timer = setTimeout(tick, FOLLOW_EVERY_MS);
    };
    timer = setTimeout(tick, FOLLOW_EVERY_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [live, following, base, query]);

  const loadMore = useCallback(async () => {
    if (next === null || loading) return;
    setLoading(true);
    setMoreFailed(false);
    const q = params(filter, { day: filter.day, before: String(next) });
    if (filter.query) q.set("q", filter.query);
    const body = await getJson<SearchBody>(`${base}/search?${q}`);
    setLoading(false);
    if (!body) {
      setMoreFailed(true);
      return;
    }
    // The agent answers newest first; the viewer reads oldest first, so older goes on top.
    setRows((old) => [...[...body.entries].reverse(), ...old]);
    setNext(body.next);
  }, [next, loading, filter, base]);

  const download = () => {
    const blob = new Blob([logFileText(rows)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = logFileName(project, filter);
    a.click();
    URL.revokeObjectURL(url);
  };

  const label = `Logs de ${project} (${filter.env === "production" ? "producción" : filter.env.replace("pr-", "preview #")})`;
  const empty = rows.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {lost ? (
        <Notice tone="warning" title="Se perdió el seguimiento">
          No llegan líneas nuevas. Se vuelve a intentar cada 2 segundos; los
          sitios siguen sirviendo.
        </Notice>
      ) : null}
      {empty && !live ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            level={3}
            icon={ScrollText}
            title="Sin líneas para esta búsqueda"
          >
            Prueba otro día, otro despliegue o quita el texto y el nivel.
          </EmptyState>
        </div>
      ) : (
        <>
          {empty ? (
            <p className="text-caption text-muted-foreground">
              Aún no hay líneas de hoy. Aparecerán aquí en cuanto el sitio
              escriba algo.
            </p>
          ) : null}
          <LogViewer
            lines={toLines(rows)}
            follow={live}
            following={following}
            onTogglePause={() => setFollowing((f) => !f)}
            label={label}
            className="h-[max(360px,calc(100vh-280px))]"
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {live ? null : (
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={next === null}
            loading={loading}
          >
            {next === null ? "No hay más líneas" : "Cargar más"}
          </Button>
        )}
        <Button variant="outline" onClick={download} disabled={empty}>
          <Download aria-hidden="true" />
          Descargar
        </Button>
        <p className="text-caption text-muted-foreground">
          {rows.length === 1 ? "1 línea" : `${rows.length} líneas`} · horas en
          UTC
        </p>
      </div>
      {moreFailed ? (
        <Notice tone="warning" title="No se pudieron cargar más líneas">
          Vuelve a intentarlo en unos segundos.
        </Notice>
      ) : null}
    </div>
  );
}
