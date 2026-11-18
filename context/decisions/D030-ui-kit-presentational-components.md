# D030 · UI · Kit components are presentational, in `components/kit/`; DataTable on TanStack Table (core only), Sparkline on Recharts · Implemented (2026-11-17)

**Decision:** every component of HANDOFF §2 lives in `components/kit/<name>.tsx` (shadcn primitives in
`components/ui/`: alert-dialog, tabs, checkbox, radio-group, textarea added). Props in, no data fetching, no
Server Actions. Pure rules sit in `lib/kit/*.ts` and are unit-tested (`relative-time`, `meter` 85/95 thresholds,
`confirm` exact match, `log-follow` auto-pause). New dependencies: `@tanstack/react-table` (v9: `useTable` with
`tableFeatures({})`, so only the core row model; no sorting or paging in v1) and `recharts` (Sparkline only,
animation off). A dev-only gallery, `app/(panel)/dev/componentes`, shows every state for axe and screenshots and
returns `notFound()` when `NODE_ENV === "production"`. `Button` gains `destructive-text`, `destructive-solid` and
`loading` (spinner in place of the icon, `aria-busy`, disabled). `cn` now knows the type scale
(`text-body`, `text-caption`, …) as font sizes: tailwind-merge took them for colors and dropped
`text-primary-foreground` from a small primary button (found by axe, 3.18:1).
**Why:** pages in wave 3 become composition only; the contract (measures, states, a11y) is tested once.
**Discarded alternative:** one generic table without TanStack (less code, but the brief asked for the library and
sorting is coming with the Despliegues page); native `<meter>` for Meter (cannot be styled to the 6px bar, so
`role="meter"` on a div with the ARIA values).
