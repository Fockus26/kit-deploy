"use client";

import { Download } from "lucide-react";
import type { Ref } from "react";
import { CopyButton } from "@/components/auth/copy-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function downloadCodes(codes: string[]) {
  const text = [
    "kit-deploy · códigos de recuperación (deploy.fockus.dev)",
    "Cada código sirve una sola vez.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "kit-deploy-codigos-de-recuperacion.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The recovery codes as the enrolment shows them (app/enrol/enrol-flow.tsx) and Ajustes shows
 * them again (D067): a named list, Copiar and Descargar .txt. Only in memory: the file is built
 * in the browser, nothing is sent anywhere.
 */
export function RecoveryCodeList({
  codes,
  copyLabel,
  listRef,
  className,
}: {
  codes: string[];
  copyLabel: string;
  /** To move focus to the list once it appears (it takes `tabIndex={-1}`). */
  listRef?: Ref<HTMLOListElement>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ol
        ref={listRef}
        tabIndex={listRef ? -1 : undefined}
        aria-label="Códigos de recuperación"
        className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-raised p-4 font-mono text-mono focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 min-[360px]:grid-cols-2"
      >
        {codes.map((c) => (
          <li key={c} className="break-all">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <CopyButton value={codes.join("\n")} label={copyLabel} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCodes(codes)}
        >
          <Download aria-hidden="true" />
          Descargar .txt
        </Button>
      </div>
    </div>
  );
}
