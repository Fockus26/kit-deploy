import { Eye } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { deploymentBadge } from "@/lib/kit/panel-format";
import type { PreviewItem } from "@/lib/panel/data";

/**
 * HANDOFF §3 Previews activos: a card per PR ("#<n>", its badge and its URL in mono 12). The PR's
 * title is not stored (CONTENT_CHECKLIST row 23): the number stands alone.
 */
export function PreviewCards({ previews }: { previews: PreviewItem[] }) {
  if (previews.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState level={3} icon={Eye} title="Sin previews">
          Cada pull request abierto contra el repo tendrá aquí su preview.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {previews.map((p) => (
        <li
          key={p.pr}
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium font-mono">#{p.pr}</span>
            <StatusBadge
              size="table"
              {...deploymentBadge(p.status, "preview")}
            />
          </div>
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-caption text-primary-text underline-offset-4 [overflow-wrap:anywhere] hover:underline"
          >
            {p.host}
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
          <p className="text-caption text-muted-foreground">
            <span className="font-mono">{p.shortSha}</span> · último push{" "}
            <RelativeTime date={p.lastPushAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}
