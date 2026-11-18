# Phase 05 — Dashboard (2026-11-17 → 2026-11-18)

Plan `plans/phase-05-dashboard.md`, prompts `plans/orchestration-2026-11-17*.md`. Design: canvas made
in-session and approved by César (https://claude.ai/artifact/BM2D4sybuXcLoczzjw9b5m) → `design/HANDOFF.md`
(D021). PRs #44, #46 (repl. #45), #47–#57, #61. Per-unit logs: `PHASE_LOG/feat-*.md`, `fix-*.md`.

## Security review (2026-11-18, 0107675..189125c)
0 C · 0 H · 2 M · 4 L. M1 (stop did not stick), M2 (project names over foreign kit-db databases),
L1, L3 fixed in #61 (D050, D051). L2, L4 → backlog.

## Ship (2026-11-18, César's OK)
- Release 5c36b947709b of main (includes phase 06 U1–U3 #58–#60). Install test (Docker) ALL PASS 102.
- `ship.sh`: installed, previous 01076756b752; kit-agent active; timers domain-check, metrics, alerts,
  cron, images-prune, preview-sweep active; kit-deploy-web 0 restarts; /login 200; kd-hello 200.
- Close checks on the VPS: `metrics kd_hello` shows the container (42 MiB / 256 MiB); `domain ls` →
  kd-hello.fockus.dev ready. Domain HTTPS with no manual step: added `kd-close05.fockus.dev` (same
  lib/ops path as the panel) → pending_dns → issuing → ready, HTTPS 200, valid cert to 2027-02-16;
  removed afterwards, kd-hello still 200. `db status kd_hello` → not created (no adopt needed).
- Not checked yet: a secret set **from the panel** (needs César's passkey sign-in in the browser);
  the CLI path was proven in phase 04 and the panel uses the same `env.seal`.
