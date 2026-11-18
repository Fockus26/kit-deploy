# D033 · Auth · Destructive panel actions re-check the typed name on the server; a variable's value is read once and never echoed · Implemented (2026-11-17)

**Decision:** Parar and Rollback take the project's name, Borrar variable the project's name, Quitar
dominio the host and Revocar token the token's project; the action compares it (trimmed, exact) with
the real one before doing anything and answers `code: "confirmation"` otherwise. The default
`<project>.fockus.dev` also needs `force` (like `domain rm --force`); the last host a site serves is
never removed. A variable's value goes from `FormData` to kit-agent's `env.seal` and nowhere else: it
is not trimmed (spaces can be part of a key; only the textarea's trailing line break goes), it is never
in a result, a log line, a revalidated path or an error message — kit-agent's own refusal message is
replaced by fixed words with its code only, and the variable actions never log. Readers never return a
secret's value: `SecretVar` has no value field and only plain rows are sent to `env.reveal`. A new
deploy token is in the action's result once; only its sha256 is stored. Double submits are harmless:
env set is an upsert, a removed variable or domain removed again is `ok`, a host already in the
project is `ok` with `already`, Redeploy finds the scope's queued/starting deployment instead of
queueing another, a project with the same name or repo is a 409.
**Why:** a confirmation typed only in the browser is UI, not a check: anyone with the session cookie
can POST the action. Next's Server Actions keep their Origin check (no `allowedOrigins` added). Tests
cover each mismatch, each idempotent path, and that a failed seal (even one whose agent message echoes
the value) leaves the value in neither the result nor `console.error`.
**Discarded alternative:** re-authentication (passkey) for destructive actions — stronger, but a second
WebAuthn flow inside each dialog is a UI unit of its own; it can come later on top of this.
