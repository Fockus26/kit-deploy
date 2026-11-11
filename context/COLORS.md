# Colors — kit-deploy

> Proposal from the kickoff (D007, direction "A · technical product, dark"). Dark is the default
> theme; light follows `prefers-color-scheme` or the switch. Claude Design may adjust it: the
> handoff wins and the change is recorded in a decision. Ratios computed with the WCAG formula.

## Light mode

| Role | Hex | Use | Contrast verified against |
|---|---|---|---|
| primary.main | #1F5FD1 | primary button, links, active tab, focus ring | text #FFFFFF on it → 5.81:1 · as text on #FFFFFF → 5.81:1 · focus on #F6F7F9 → 5.42:1 |
| secondary.main | #5B6573 | secondary text-buttons, icons | #FFFFFF → 5.91:1 |
| background.default | #F6F7F9 | page | — |
| background.paper / surface | #FFFFFF | cards, tables, nav | — |
| text.primary | #0F1419 | body | #FFFFFF → 18.51:1 · #F6F7F9 → 17.27:1 |
| text.secondary | #5B6573 | labels, metadata, timestamps | #FFFFFF → 5.91:1 · #F6F7F9 → 5.51:1 |
| text.disabled | #7A8491 | disabled controls only (exempt from 4.5:1) | #FFFFFF → 3.79:1 |
| success.main | #0E7A45 on chip #E7F6EE | "Listo/Activo" + icon | 4.84:1 on chip · 5.40:1 on #FFFFFF |
| warning.main | #8A5200 on chip #FFF4E0 | "Aviso" + icon | 5.86:1 |
| error.main | #B42318 on chip #FDECEA | "Falló/Caído" + icon | 5.75:1 on chip · 6.57:1 on #FFFFFF |
| info.main | #1F5FD1 on chip #E8F0FD | "Construyendo" + icon | 5.06:1 |
| divider | #E1E4E8 | decorative row/card borders (not informative) | — |
| border.input | #8A94A1 | input, select, checkbox borders | #FFFFFF → 3.07:1 |
| selection.bg / selection.text | #C9DBFA / #0F1419 | `::selection` | 13.22:1 |
| scrollbar.thumb / scrollbar.track | #7A8491 / #EEF0F3 | scrollbar | 3.32:1 (≥ 3:1) |

## Dark mode

| Role | Hex | Use | Contrast verified against |
|---|---|---|---|
| primary.main | #5B9BFF | primary button, active tab underline, meters | text #08111F on it → 6.82:1 · on #12151A → 6.60:1 |
| primary.text | #7AB0FF | links, SHAs, info text, focus ring | #12151A → 8.26:1 · #0B0D10 → 8.79:1 |
| secondary.main | #9AA3AE | icons, secondary actions | #12151A → 7.16:1 |
| background.default | #0B0D10 | page | — |
| background.nav | #0F1216 | sidebar, log panels | — |
| background.paper / surface | #12151A | cards, tables | — |
| surface.raised | #1A1F27 | selected nav item, hover row | text.secondary → 6.48:1 |
| text.primary | #E6E8EB | body | #12151A → 14.90:1 · #0B0D10 → 15.85:1 |
| text.secondary | #9AA3AE | labels, metadata | #12151A → 7.16:1 · #0F1216 → 7.35:1 · #0B0D10 → 7.62:1 |
| text.disabled | #6B7480 | disabled controls only | #12151A → 3.86:1 |
| success.main | #5EE6A0 on chip #10291D | "Listo/Activo" + icon | 9.80:1 · 11.59:1 on #12151A |
| warning.main | #FFB86B on chip #2E2110 | "Aviso" + icon | 9.19:1 · 10.73:1 on #12151A |
| error.main | #FF8A8A on chip #2E1416 | "Falló/Caído" + icon | 7.54:1 · 8.06:1 on #12151A |
| info.main | #7AB0FF on chip #122440 | "Construyendo" + icon | 7.01:1 |
| divider | #232830 | decorative borders of cards and rows | — |
| border.input | #5E6776 | input, select, checkbox borders | #12151A → 3.20:1 · #0F1216 → 3.29:1 |
| selection.bg / selection.text | #1E3A66 / #E6E8EB | `::selection` | 9.24:1 |
| scrollbar.thumb / scrollbar.track | #5E6776 / #12151A | scrollbar | 3.20:1 (≥ 3:1) |

Mono accent for commit SHAs in tables: primary.text (dark) / primary.main (light). Log levels in
the log viewer reuse warning/error/success — always with the level word (`WARN`, `ERROR`).

## Contrast notes

- Dark has two blues: `#5B9BFF` for surfaces (buttons, bars) and `#7AB0FF` for text — `#5B9BFF` as
  small text on `#0B0D10` would still pass, but one text blue keeps links consistent (D007).
- `divider` is decorative and below 3:1 on purpose; every **informative** border (inputs, focus,
  selected state) uses `border.input` or primary (≥ 3:1).
- Status is never color alone: icon + word ("Listo", "Construyendo", "Falló", "Dormido").
