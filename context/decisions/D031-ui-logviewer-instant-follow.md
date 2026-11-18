# D031 · UI · LogViewer follows the end with an instant jump; scrolling up pauses it by calling `onTogglePause` · Implemented (2026-11-17)

**Decision:** while `following`, new lines set `scrollTop = scrollHeight` (no smooth scroll); a scroll event that
leaves the box away from the bottom (24 px tolerance) calls `onTogglePause()` once. The caller owns `following`.
The box is `role="log"` (`aria-live` polite while following, off when paused) and focusable, so the keyboard can
scroll it. The "following" dot pulses only under `motion-safe`.
**Why:** HANDOFF §6 asks for a smooth scroll to the end, but a smooth scroll fires scroll events on the way where
the box is "not at the bottom", which would pause it by itself; an instant jump is also the reduced-motion
behaviour, so there is one path.
**Discarded alternative:** smooth scroll guarded by a "programmatic scroll" flag with a timeout (fragile: depends
on the browser's animation length and on `scrollend` support).
