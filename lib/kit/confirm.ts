/** The destructive confirm enables its button only when the typed text is exactly the name. */
export function confirmMatches(typed: string, expected: string): boolean {
  return expected.length > 0 && typed === expected;
}
