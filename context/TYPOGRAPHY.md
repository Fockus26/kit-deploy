# Typography — kit-deploy

## Families

- Heading: Geist (Google Fonts / `next/font`) — 600
- Body: Geist — 400/500
- Mono: Geist Mono — 400/500 — commit SHAs, logs, metric values, commands, variable names, URLs of
  previews, ports

## Scale (mobile-first)

A dense dashboard: the scale barely grows with the screen; large screens get more columns, not bigger text.

| Level | xs (mobile) | md (tablet) | 1920px+ (large desktop) | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| h1 (page / project name) | 22px | 24px | 30px | 1.25 | -0.01em |
| h2 (card / section title) | 15px | 15px | 18px | 1.35 | 0 |
| h3 (sub-block) | 14px | 14px | 15px | 1.4 | 0 |
| body | 14px | 14px | 15px | 1.5 | 0 |
| table / mono | 13px | 13px | 14px | 1.5 | 0 |
| small/caption | 12px | 12px | 13px | 1.45 | 0 |
| eyebrow/label | 11px | 11px | 12px | 1.4 | 0.08em, uppercase |
| metric value (mono) | 20px | 22px | 24px | 1.2 | 0 |

## Rules

- Any font size not in this table is a new decision — record it in `decisions/D0NN-<topic>.md`
  before using it.
- Numbers in tables and metrics use `font-variant-numeric: tabular-nums`.
- Mono only for machine values (SHA, log, command, env name, port, URL); never for prose.
- Inputs at 16px on touch screens (`max-width: md`) so iOS does not zoom on focus.
