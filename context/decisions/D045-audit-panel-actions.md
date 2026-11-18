# D045 · Data · `audit_log` also records the panel's project, token, domain and container actions (migration 0011) · Implemented (2026-11-17)

**Decision:** `AUDIT_ACTIONS` grows from `env.set`/`env.remove` to also `project.add`, `token.create`,
`token.revoke`, `domain.add`, `domain.remove`, `project.redeploy`, `project.rollback`, `project.stop`
and `project.restart` (migration `0011_audit_actions`: only the `audit_log_action` check is replaced,
no data changes). The changes that are only database writes record their row **in the same
transaction** (`lib/db/audit.ts` `writeAudit`, passed as an optional `audit` entry to
`AdminStore.addProject/addDomain/addToken`, `TokenStore.revoke`, `DomainStore.remove`; a revoke or
removal that changed nothing writes nothing). The ones kit-agent or the switch carry out (redeploy,
rollback, stop, restart) cannot share a transaction with Docker, so the panel records them once they
succeeded (`ActionDeps.audit.record`); a failed write there is logged, never turned into a failure of
an action that did run. Actor `web:<user id>` (`webActor`); `name` holds only a name — the host, the
token's label, the rollback target's deployment id, `PR #<n>` for a preview redeploy — never a value
or a token. This replaces D034's "audit stays variables-only".
**Why:** the brief's Ajustes › Auditoría row asks for "quién, cuándo, qué variable o acción"; the
page (D042) already renders any action string. In-transaction rows mean a change and its record
commit or fail together; for agent operations, recording after the fact is the only honest option.
**Discarded alternative:** one `audit.record` after every action, database ones included (a change
could commit without its row); failing the action when its audit write fails after Docker already
acted (the panel would say "failed" about a container that is stopped). **Not covered yet:** the
CLI's `project add`, `token create`, `domain add|rm`, `rollback`, `stop`, `restart` (the `cli/` files
were outside this unit) — the ops take an optional `actor`, so passing `sshActor()` there is the
follow-up; `domain.redirect`, `rebuild` and `db.create` are not audited (not in this unit's list).
