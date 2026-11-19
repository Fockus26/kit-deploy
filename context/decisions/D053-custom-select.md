# D053 · Panel · Every select is the Radix/shadcn Select, not the browser's native one · Confirmed (2026-11-18)

**Decision:** `components/ui/select.tsx` (shadcn new-york on `radix-ui`, kit-deploy's tokens) replaces
every native select in the panel, through `components/kit/option-select.tsx` (a closed list of
options; `id` / `aria-*` land on the trigger, so the Field's label names it). Forms keep
submitting by `name` (Radix renders a hidden native select). An item cannot have value `""`:
Logs' "Nivel" uses the sentinel `all` (`LEVEL_ALL`, read by `parseLogFilter` as no filter) and
Despliegues' "Estado" uses `all` too. `native-select.tsx` stays in the repo, now unused.
**Why:** César: "no hay custom select sino el select es el nativo" — the native menu cannot take
the panel's look. The shown label is resolved by `OptionSelect` so the trigger is not empty in the
server HTML.
**Discarded alternative:** keeping the native menu on phones (better native picker, but two
looks); Radix's own menu is used everywhere. Known edge: before hydration the hidden select has
no options, so a form submitted in that instant would send no value (the filters fall back to
their defaults).
