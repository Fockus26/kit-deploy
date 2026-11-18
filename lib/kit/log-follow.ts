/** Distance (px) from the bottom within which the log still counts as "at the end". */
export const LOG_BOTTOM_TOLERANCE = 24;

export function isAtBottom(
  m: { scrollTop: number; scrollHeight: number; clientHeight: number },
  tolerance = LOG_BOTTOM_TOLERANCE,
): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= tolerance;
}

/**
 * Should the viewer pause itself after a scroll? Only while following and when the user moved
 * up (not our own jump to the bottom, which leaves it at the end).
 */
export function shouldAutoPause(
  following: boolean,
  m: { scrollTop: number; scrollHeight: number; clientHeight: number },
): boolean {
  return following && !isAtBottom(m);
}
