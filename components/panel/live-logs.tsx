"use client";

import { useEffect, useState } from "react";
import { type LogLine, LogViewer } from "@/components/kit/log-viewer";

/** HANDOFF §3 Logs en vivo: the box asks for the tail every 2 s while it is following. */
export const POLL_MS = 2000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The LogViewer of a project's production, fed by `/api/panel/logs` (a wrapper of `logsTail`).
 * `initial` is what the server read with the page. Paused (by the button or by scrolling up) it
 * stops asking, so what is being read does not move; "Reanudar" asks again at once. A failed
 * poll keeps the lines and says so under the box.
 */
export function LiveLogs({
  project,
  initial,
  lines = 20,
}: {
  project: string;
  initial: LogLine[];
  lines?: number;
}) {
  const [shown, setShown] = useState(initial);
  const [following, setFollowing] = useState(true);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!following) return;
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/panel/logs?project=${encodeURIComponent(project)}&env=production&lines=${lines}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { lines: LogLine[] };
        if (alive) {
          setShown(body.lines);
          setStale(false);
        }
      } catch {
        if (alive) setStale(true);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [following, project, lines]);

  return (
    <div className="flex flex-col gap-2">
      <LogViewer
        lines={shown}
        following={following}
        onTogglePause={() => setFollowing((f) => !f)}
        label={`Logs de ${project} (producción), horas en UTC`}
        className="max-h-72"
      />
      {shown.length === 0 && !stale ? (
        <p className="text-caption text-muted-foreground">
          Producción aún no ha escrito líneas de log.
        </p>
      ) : null}
      {stale ? (
        <output className="block text-caption text-warning">
          No se pudo leer el log ahora; se reintenta cada 2 s.
        </output>
      ) : null}
    </div>
  );
}
