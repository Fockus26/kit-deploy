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
| shadow.lg | 0 16px 48px rgb(0 0 0 / 0.5) dark · 0 16px 48px rgb(15 20 25 / 0.18) light | dialog (confirm rollback, stop) |

## Sizes

| Token | Value | Use |
|---|---|---|
| size.control | 40px | buttons, inputs (≥ 44px touch area on mobile via padding) |
| size.sidebar | 240px | sidebar width from `lg` |
| size.content-max | 1440px | main content max width |

## Breakpoints

See `DESIGN_RULES.md` — they must match exactly; this file does not redefine them.

## Transitions / animation

| Token | Value |
|---|---|
| duration.fast | 120ms |
| duration.normal | 200ms |
| easing.default | cubic-bezier(0.2, 0, 0, 1) |

`prefers-reduced-motion`: transitions to 0 and the live-log "following" pulse off.
