# D044 · Panel · Exit animations by closed-state keyframes; reflow guard versioned · Implemented (2026-11-17)

**Decision:** Dropdown, Sheet and AlertDialog leave with the mirror of their entry (HANDOFF §6): a
`kd-*-out` keyframe applied with `data-[state=closed]:animate-*-out` (radix keeps the node mounted
until that animation ends; `forwards` holds the last frame). Under `prefers-reduced-motion` the
global rule zeroes durations, so they leave at once (entry already did the same). The LogViewer has a
static mode, `follow={false}`: no "Siguiendo/En pausa" bar and no pause button, used by the search
view of Logs. `scripts/qa/panel-reflow.mjs` is the versioned reflow guard: every panel route at 320,
360, 768, 1024, 1440, 1920 px, light and dark, plus 200 % zoom at 1280, failing on `scrollWidth >
clientWidth`; it names the offending elements. Measured on main before this unit: 154 page views, 0
with horizontal scroll, so the sweep fixed what the guard cannot see (clipped text, wrapping rows).
**Why:** the entry-only animations left menus and dialogs popping out; the guard keeps the
"no horizontal scroll at 320" criterion from regressing.
**Discarded alternative:** a motion library for presence (a new dependency for what radix's own
`Presence` already does); checking by screenshot (not repeatable).
