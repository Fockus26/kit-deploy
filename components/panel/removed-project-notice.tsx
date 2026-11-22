"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CommandLine } from "@/components/kit/command-line";
import { Notice } from "@/components/kit/notice";
import { buttonVariants } from "@/components/ui/button";
import type { RemovedNotice } from "@/lib/panel/removed-notice";

/**
 * Inicio after Eliminar proyecto (D070). The dialog's trigger went with the project's page, so
 * focus lands here: a screen reader hears the result, and Tab goes on from it. Cerrar drops the
 * query, and the notice with it.
 */
export function RemovedProjectNotice({ notice }: { notice: RemovedNotice }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);

  return (
    <div
      ref={box}
      tabIndex={-1}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <Notice
        tone={notice.tone}
        title={notice.title}
        actions={
          <Link
            href="/"
            replace
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Cerrar
          </Link>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">{notice.body}</p>
          {notice.command ? <CommandLine command={notice.command} /> : null}
        </div>
      </Notice>
    </div>
  );
}
