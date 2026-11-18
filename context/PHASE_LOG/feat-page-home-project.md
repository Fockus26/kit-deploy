# feat/page-home-project — phase 05 W8 (2026-11-17)

Inicio, project header + actions, Resumen and Despliegues over `lib/panel/data` and the Server Actions of W6.
- 404 for `/p/<unknown>`: `proxy.ts` + `lib/panel/project-gate.ts` (D036). The layout's `notFound()` stays as the fail-open fallback.
- Logs en vivo: polls W10 route /p/<project>/logs/tail (D040). D037.
- Shared pieces added: `DropdownMenuItem`, Sheet `side="right"` (480px), MetricCard hides its Sparkline < 768.
- New copy: CONTENT_CHECKLIST rows 24–26 (rows 15–17 resolved).
- Open for César: rows 22/23 (commit message, author, PR title are not stored); "Log de build" has no data source.
