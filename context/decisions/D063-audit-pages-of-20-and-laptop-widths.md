# D063 · Panel · Auditoría pages of 20 with `?pagina=N` and Anterior/Siguiente; laptop widths · Implemented (2026-11-18)

**Decision:** Auditoría shows 20 rows (`AUDIT_PAGE`) and pages by number: `/settings?pagina=N#auditoria`
(1-based; anything that is not a whole number ≥ 1 is page 1, past the last is the last). The section
ends in a `nav aria-label="Paginación de auditoría"` with `Anterior`, "Página N de M" and `Siguiente`;
at the ends they are text with `aria-disabled` (not links, not focusable), never only a faded link.
The store reads `offset` + `limit` and a `count()` for the total, ordered by `at` then `id` so a page
never repeats or skips a row with equal timestamps. Old `?antes=` links have no `pagina`: they land
on page 1. This supersedes the "50 rows + Cargar más / `?antes=` cursor" part of D042 (the /login
part of D042 stands).
**Laptop widths:** measured every panel route at 1280, 1366, 1440 and 1536 px (see the PR for the
table). Result: at 1280–1536 `<main>` is 976–1232 px of inner width (the 1440 cap of `max-w-content`
only bites above ~1750 px) and every route's tables, lists and cards span 100 % of it; Dominios and
Variables already split in two columns and the project's Resumen in 60/40. The only space left
unused is by design (`/new` and the "Nuevo token" form keep `max-w-form-wide`, HANDOFF; the intro
paragraphs keep `max-w-3xl`, a readable measure). So no container was changed.
**Why:** page N of M is bookmarkable and tells the reader where they are, which a cursor and a
growing list do not; still a plain link, no client state (as D042).
**Discarded alternative:** keeping the `before` cursor and adding Anterior by stacking cursors in the
URL (long URLs, no "Página N de M" without a count anyway).
