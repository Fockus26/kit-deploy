"use client";

import { useActionState } from "react";
import { createDatabasesAction } from "@/app/(panel)/actions/projects";
import { Notice } from "@/components/kit/notice";
import { Button } from "@/components/ui/button";

/**
 * "Crear base": kit-db's `<project>` and `<project>_preview`. Idempotent on the server, and the
 * button is disabled and `aria-busy` while it runs. A plain `<form action>`, so it also works
 * before hydration.
 */
export function CreateDatabasesForm({ project }: { project: string }) {
  const [result, action, pending] = useActionState(createDatabasesAction, null);
  return (
    <form action={action} className="flex flex-col items-center gap-3">
      <input type="hidden" name="project" value={project} />
      <Button type="submit" loading={pending}>
        Crear base
      </Button>
      {result && !result.ok ? (
        <Notice tone="destructive" title="No se pudieron crear las bases">
          {result.message}
        </Notice>
      ) : null}
    </form>
  );
}
