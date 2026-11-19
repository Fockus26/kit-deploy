# Design Tokens — kit-deploy

> The single source of truth for reusable values that are neither color nor typography.
> Every component must consume these tokens instead of loose values in the code.

## Spacing

Base unit: 4px

| Token | Value |
|---|---|
| spacing.2xs | 2px |
| spacing.xs | 4px |
| spacing.sm | 8px |
| spacing.md | 12px |
| spacing.lg | 16px |
| spacing.xl | 24px |
| spacing.2xl | 32px |
| spacing.3xl | 48px |

## Border radii

| Token | Value | Use |
|---|---|---|
| radius.sm | 4px | chips, kbd, code |
| radius.md | 6px | buttons, inputs, nav items |
| radius.lg | 8px | cards, tables, panels |
| radius.full | 999px | status pills, dots |

## Shadows

Surfaces separate by 1px borders, not shadows (D007). Shadows only for what floats.

| Token | Value | Use |
|---|---|---|
| shadow.sm | none | cards (border only) |
| shadow.md | 0 8px 24px rgb(0 0 0 / 0.35) dark · 0 8px 24px rgb(15 20 25 / 0.12) light | dropdown, popover, command palette |
| shadow.lg | 0 16px 48px rgb(0 0 0 / 0.5) dark · 0 16px 48px rgb(15 20 25 / 0.18) light | dialog (confirm rollback, stop), mobile sheet |

## Sizes

| Token | Value | Use |
|---|---|---|
| size.control | 44px below 768 · 40px from 768 | buttons, inputs (`--spacing-control`) |
| size.compact | 32–36px | buttons in table toolbars, ThemeSwitch |
| size.sidebar | 240px | sidebar width from 1024 |
| size.sheet | 280px | mobile navigation sheet below 1024 |
| size.header | 56px | header (also the anchors' `scroll-margin-top`) |
| size.content-max | 1440px | main content max width, aligned left |
| size.form | 400px | the /login and /enrol card (`--container-form`) |
| size.form-wide | 560px | the Nuevo proyecto form card (`--container-form-wide`) |
| size.form-split | 880px | the same forms from 1024 (`lg`), two fields per row (`--container-form-split`, D066) |

## Layout (HANDOFF §4)

| Width | Layout | Main padding |
|---|---|---|
| 320–767 | mobile header + sheet | 16px |
| 768–1023 | mobile header + sheet | 24px |
| ≥ 1024 | sidebar 240 + content | 32px |

## z-index

| Layer | Value |
|---|---|
| content | 0 |
| sticky header | 20 |
| dropdown / popover | 40 |
| overlay + dialog / sheet | 50 |
| toast | 60 |

## Breakpoints

See `DESIGN_RULES.md` — they must match exactly; this file does not redefine them.

## Transitions / animation

| Token | Value |
|---|---|
| duration.fast | 120ms |
| duration.normal | 200ms |
| easing.default | cubic-bezier(0.2, 0, 0, 1) |

Motion per element in `design/HANDOFF.md` §6 (menus 120ms, sheet and dialogs 200ms, skeleton pulse
1.5s). `prefers-reduced-motion`: transitions and animations to 0 and the live-log "following" pulse off.
