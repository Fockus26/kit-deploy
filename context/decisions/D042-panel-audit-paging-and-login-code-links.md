# D042 · Panel · Auditoría pages by a `?antes=` link; /login opens its code form from two links over one form · Implemented (2026-11-17) · Superseded in part by D063 (Auditoría: 20 rows and `?pagina=N`)

**Decision:** Auditoría shows 50 rows; "Cargar más" is a link to `/settings?antes=<ISO date of the
last row>#auditoria` (settingsData's cursor) that shows the next 50, with "Volver a los más
recientes" back to the first page. /login shows "Entrar con passkey" and the two links of HANDOFF
§3 ("Usar código de la app", "Usar código de recuperación"); either opens the same email + code form,
whose label and hint follow the choice, while `codeKind` still decides TOTP or recovery code from
what was typed, as before. The code form is `method="post"`, so a submit before hydration never puts
the code in the URL.
**Why:** pages are presentation only (no new action or route to append rows client-side), and a link
keeps paging bookmarkable and keyboard-plain. Keeping `codeKind` keeps every sign-in path and its
tests unchanged.
**Discarded alternative:** appending rows in place (needs a new read endpoint); two separate code forms
with their own submit paths (duplicates the sign-in logic for no gain).
