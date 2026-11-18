# D023 · Colors · Theme: dark by default (also on /login), light or "Sistema"; `data-theme` + `light-dark()`, choice in localStorage · Implemented

**Decision:** every color token is `light-dark(<light>, <dark>)` in `app/globals.css`; `color-scheme` on
`<html>` picks the side: dark with no `data-theme`, light with `data-theme="light"`, the system's with
`data-theme="system"`. An inline script in `<head>` (`lib/theme.ts`) sets `data-theme` from localStorage
(`kd-theme`, read in try/catch) before the first paint; the header's ThemeSwitch (Oscuro / Claro /
Sistema) writes it. `/login` and `/enrol` start dark as well (HANDOFF §9 Q2), with no switch there.
**Why:** the brief and D007 make dark the default; HANDOFF §9 Q2 recommends dark on /login too, and
César approved the handoff. One value per token keeps light and dark from drifting apart.
**Discarded alternative:** `next-themes` (a dependency for ~20 lines, and its injected script warns under
React 19); a cookie (the root layout would read it per request and lose the static shell under
cacheComponents); duplicating the light block for `[data-theme=light]` and the media query.
