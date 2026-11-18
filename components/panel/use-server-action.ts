"use client";

import { startTransition, useActionState } from "react";

/**
 * A Server Action (signature `(prev, formData)`) called from a button instead of a <form>: the
 * confirmation is a dialog, not a field. `run` sends the fields as a FormData, as the form would;
 * `pending` is true while it is in flight (the caller disables the button and sets aria-busy).
 */
export function useServerAction<R>(
  action: (prev: unknown, form: FormData) => Promise<R>,
) {
  const [state, formAction, pending] = useActionState<R | null, FormData>(
    action,
    null,
  );
  function run(fields: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    startTransition(() => formAction(form));
  }
  return { state, pending, run };
}
