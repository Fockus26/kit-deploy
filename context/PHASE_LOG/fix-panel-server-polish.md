# fix/panel-server-polish (phase 05 W13) — PR #56

- Date.now() prerender warning: `dashboardUser` reads the clock after the session lookup (`now?: () => number`); `sessionUser` awaits `connection()` after `headers()`. Test on the order.
- addDomain: one Spanish message per redirect/host mismatch (`hostRefusal`, lib/panel/actions/domains.ts).
- stop/restart of an unknown project → 404 before the agent.
- Audit (D045, migration 0011 = check constraint only): project.add, token.create/revoke, domain.add/remove in the same transaction; redeploy/rollback/stop/restart after success (a failed audit write is logged, not a failure). Actor web:<id>, names only.
- D046 phase-05 closing decision.
- Not verified: migration 0011 against real Postgres; dev-server warning.
- Open: the CLI does not write audit rows yet (ops accept `actor`; pass `sshActor()`); domain.redirect, rebuild, db.create not audited; D045 overrides part of D034.
