# D037 · Panel · Inicio / Resumen / Despliegues: the choices the data layer and the handoff left open · Implemented (2026-11-17)

**Decision:**
- **Logs en vivo** poll W10's `GET /p/<project>/logs/tail?env=production` (D040) every 2 s and keep the last 20 lines; no wrapper of our own. Lines show their UTC hour. Paused (button or scrolling up) it stops asking.
- **Rollback** from the header names the SHA it will go back to, picked with the same rule as the server
  (`lib/kit/rollback.ts`, over `deployments(project, "production")`). The dialog is the confirmation, so
  the project's name travels as the action's `confirm` field; only **Parar** asks to type the name.
- **"Log de build"** is not offered: there is no build-log source in the data layer. The row action is
  "Detalle" (the Sheet with image, container, port, health check, timestamps and error).
- **Commit message and author** are not shown (CONTENT_CHECKLIST row 22); the tables show the SHA only.
- The recent-deployments table keeps its header row (the handoff says "sin cabecera"): a table without
  `<th>` is worse for screen readers, and DataTable always draws it.
- Metrics, deployments and the header refresh every 30 s (`router.refresh()` while the tab is visible).
- **Inicio** shows Alertas abiertas as an empty line (phase 06 fills it, D034); the agent is not involved,
  so the page has no "agent unavailable" state. Resumen and the header do (container state, live logs).
**Why:** presentation only (W8): no new queries or actions; where the layer has no data, the conservative
fallback and a flagged row in the checklist.
**Discarded alternative:** a Server Action for the log poll; a typed-name dialog for rollback (the handoff §5b gives it a primary confirm).
