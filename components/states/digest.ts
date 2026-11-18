/** Next's id of a server error (`error.digest`); the browser never gets the message itself. */
export function digestOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const d = (error as { digest?: unknown }).digest;
  return typeof d === "string" && d !== "" ? d : undefined;
}
