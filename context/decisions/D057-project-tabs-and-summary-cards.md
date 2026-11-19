# D057 · Panel · Pestañas sin scroll vertical y tarjetas del Resumen a la misma altura · Confirmed (2026-11-18)

**Decision:** the project tabs' `ul` keeps `overflow-x: auto` (narrow screens) with `overflow-y: hidden`,
and the links drop `-mb-px`: the active 2 px underline sits right above the nav's 1 px border instead
of overlapping it, so nothing overflows vertically and nothing is clipped. On the Resumen,
"Despliegues recientes" and "Previews activos" are flex columns: side by side they stretch to the
same height and their empty states center in the card (`DataTable` empty slot is `flex-1` +
`justify-center`); wrapped, each keeps its own height.
**Why:** `overflow-x: auto` computes `overflow-y` to `auto`, and the 1 px negative margin created the
stray scrollbar.
**Discarded alternative:** keep `-mb-px` with `overflow-y: hidden` (clips 1 px of the underline), or
`pb-px` on the list (a visible gap).
