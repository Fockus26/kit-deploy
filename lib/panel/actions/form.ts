/**
 * A Server Action's payload as the schemas read it. The POST is anyone's to send: whatever is not
 * a FormData is an empty form (the schema then refuses it), never a throw.
 */
import { formToObject } from "@/lib/panel/schemas";

export function payload(
  form: unknown,
  arrays: readonly string[] = [],
): Record<string, unknown> {
  return form instanceof FormData ? formToObject(form, arrays) : {};
}
