# D041 · Auth · A deploy token lives only in the form's action state; a new passkey comes from an enrolment link, not from Ajustes · Implemented (2026-11-17)

**Decision:** Nuevo proyecto and "Nuevo token" keep the `kdt_…` only in their `useActionState`
state: never in a URL, a cookie, storage or a refetchable read. The client step calls the Server
Action with `null` as the previous state, so an earlier token never rides along in a later request,
and "Ya lo guardé" dispatches a clear that replaces the state with the project's name only. Ajustes
shows the passkeys read-only and, for another one, the `ssh -t kit-vps kit-deploy user enrol <email>`
command with the signed-in email: the auth handler only lets an enrolment session register factors
(`ENROL_ONLY`, so a stolen dashboard session cannot plant its own passkey), and a later link keeps
the TOTP and recovery codes. TOTP and recovery codes are status only (the layer has no count and no
regenerate route).
**Why:** HANDOFF §3 asks for the token once and "Ya lo guardé, después no se vuelve a ver";
`useActionState` sends the previous state to the server on every submit, so passing it through would
re-upload the token. Opening `/passkey/generate-register-options` to dashboard sessions would undo the
2026-11-13 security review.
**Discarded alternative:** binding the Server Action straight to `useActionState` (keeps the no-JS
submit, but the token stays in state and is re-sent); an "Añadir passkey" button through Better Auth's
client from Ajustes (refused with 403 `ENROLMENT_SESSION_REQUIRED` by design).
