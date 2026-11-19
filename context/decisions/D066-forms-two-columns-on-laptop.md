# D066 · Panel · "Nuevo proyecto" and Ajustes › "Nuevo token" use two columns from `lg` (container token `--container-form-split`, 880px) · Implemented (2026-11-19)

**Decision:** from `lg` (1024px) up, the form cards of `/new` and of "Nuevo token" grow from
`--container-form-wide` (560px) to `--container-form-split` (880px, `app/globals.css`, listed in
`DESIGN_TOKENS.md` › sizes) and their fields go two per row in DOM order (`grid lg:grid-cols-2`):
Nombre | Repositorio, Rama | Memoria; Proyecto | Etiqueta. Titles, notices, the submit row and the
intro paragraph stay full width / as they were; no new copy. Below `lg` nothing changes (one
column, 560px cap). The token-once view of `/new` shares the page container, so it is 880px too
(its commands are long lines); the one in Ajustes was never capped.
**Why:** design QA found a 560px column with 450–700px empty at 1280–1536. Pairing fields keeps each
input at ~400px (no absurdly long text fields) and the reading/tab order equals the visual order
(row-major), so no `order-*` is needed.
**Discarded alternatives:** (B) form + side column that repeats the page's existing text and the
post-create steps: uses the width, but the page has no copy to put there and inventing it is
forbidden. (C) the card at full `max-w-content` with single-column fields: fills the space with
inputs of 900px+, hard to scan.
