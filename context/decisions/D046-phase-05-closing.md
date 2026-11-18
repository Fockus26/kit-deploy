# D046 · Panel · Phase 05 closes with every HANDOFF §3 page; passkeys, connections, commit/PR text, Cron and alerts are deferred · Confirmed (2026-11-17)

**Decision:** phase 05 ships the dashboard: the shell with theme switch and session (D021–D023);
runtime logs and metrics in kit-agent and the CLI (D024–D027); domains with DNS check, www ↔ apex
redirect and certificate state (D028, D029); the kit components (D030, D031); the panel's read layer
and Server Actions over the shared ops (D032–D034); databases' status (D035); the Inicio, project,
Despliegues, Previews, Variables, Dominios, Logs, Bases, Nuevo proyecto, Ajustes and login pages
(D038–D042); the states and responsive pass (W12, D043–D044); clearer action errors, the
unknown-project 404s, a prerender-safe session check and the audit of every panel action (W13,
D045). Deferred, each with its owner:
- **Adding a passkey from Ajustes → v1.x.** Ajustes lists them read-only; another one comes from an
  enrolment link (`kit-deploy user enrol`), D041.
- **Database connections column → none.** `db.status` gives no connection count (D035); the Bases
  page does not show one.
- **Commit message and author, PR title → not stored.** The tables show the SHA and `#<n>` only;
  César decides in CONTENT_CHECKLIST rows 22–23 whether deploys start storing them.
- **Cron → phase 06** (`phases/06-ALERTS-AND-CRON.md`): the project's Cron tab and its page.
- **Alerts → phase 06:** Inicio's "Alertas abiertas" stays empty until then (D034).
**Why:** phase 05's goal is the page over what the platform already does; each deferred item needs
either a new root operation (passkeys from a dashboard session undo D041's enrolment-only rule),
data nobody stores yet (connections, commit text) or phase 06's scheduler and alerting.
**Discarded alternative:** keeping phase 05 open until Cron and alerts exist (they are phase 06's
scope and need its timer and Brevo pieces); storing commit/PR text now without César's call (it
changes the deploy API's payload).
