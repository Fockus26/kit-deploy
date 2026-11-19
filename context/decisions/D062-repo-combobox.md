# D062 · Panel · "Repositorio" is a searchable combobox (Popover + Command); without a list, today's input · Implemented

**Decision:** with the list (D061), Nuevo proyecto's "Repositorio" is
`components/kit/repo-combobox.tsx` on shadcn `popover` + `command` (cmdk): a trigger with the
Select trigger's box (D053), `role=combobox` + `aria-expanded`, search by `owner/repo` (own pure
filter, `filterRepos`), a text "Privado" badge with a lock, Enter/Space/↓ open, Enter picks, Esc
closes. A valid `owner/repo` that is not in the list can be used ("Usar «…»"); the value goes in a
hidden `repo` input and the server still validates it (`lib/panel/schemas.ts`, unchanged).
Picking a repo puts its default branch in "Rama de producción" while that field is unedited.
Without the token, or when GitHub fails, the field is today's `FieldInput` with a help line that
ends in "Escribe owner/repo" (rows 44–45). The whole form waits for the list behind a `Suspense`
("Datos del proyecto" skeleton), so the field never swaps under the cursor.
**Why:** César: "una lista buscable de mis repos, como en Vercel", without losing typing by hand.
**Discarded alternative:** streaming only the field (a promise + `use()`, the input as fallback):
the form shows sooner, but when the list lands the input is replaced and whoever was typing loses
focus.
