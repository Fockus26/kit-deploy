# D055 · Auth · A passkey is removed from Ajustes only with a fresh TOTP code checked on the server; never without TOTP · Implemented (2026-11-18)

**Decision:** Ajustes › Passkeys gets "Eliminar" per row. Its dialog asks for the authenticator
app's current 6-digit code; the Server Action (`lib/panel/actions/passkeys.ts`) checks, in order:
dashboard session → form → `auth_user.two_factor_enabled` (off → refused, "no hay con qué
confirmar") → the guard → Better Auth's own `verify-totp`, called server-side as
`auth.api.verifyTOTP` with the request's cookie (no new route through `lib/auth/handler.ts`) → only
then `DELETE … WHERE id = ? AND user_id = ?` plus the audit row `passkey.remove` (name or id, project
`-` = the account, `lib/db/account-scope.ts`) in one transaction. Rule: **TOTP verified → removal
allowed, even of the last passkey** — the account still has TOTP, the recovery codes and the CLI
enrolment link (`kit-deploy user enrol`), so it is never the last way in; **no TOTP → never**, so
the only factor of a passkey-only account cannot go. Another user's id, or one already removed,
answers `removed: false` and deletes nothing (indistinguishable on purpose).
The guard (`memoryTotpGuard`, in the web process): every try counts as a failure up front and
claims its code synchronously, before the async check; a right code clears the count. 5 tries per
user in 15 minutes, then `too_many` (429) until the window passes; a code that confirmed a removal
is refused for 2 minutes (Better Auth accepts a code one step either side, ~90 s). A wrong code or a
blocked try logs `kit-deploy-auth: failed sign-in from <ip> path=/panel/passkey-remove status=401|429`
(`failedLine`, the same shape as the sign-in routes', for the fail2ban jail of D003). The code is in
no result, message or log line. Migration `0015_passkey_audit` widens the `audit_log_action` check.
**Why:** César: "no puedo revocar, eliminar passkeys", and a stolen dashboard cookie alone must not
be able to strip the account's factors (D041's reasoning). Called server-side, Better Auth's
verify-totp has no rate limit (its limiter only sees HTTP requests), no account lockout (that is
for sign-in challenges only) and no memory of used codes — measured in
`tests/unit/passkey-remove.test.ts` (the same code passes twice), hence the guard. In memory is
enough for one web container, like Better Auth's own limiter; a restart forgets it, fail2ban does not.
**Discarded alternative:** opening `/passkey/delete-passkey` in the handler (a session alone would
delete); a WebAuthn re-authentication with another passkey (fails exactly when the device is lost);
a recovery code instead of TOTP (spends a one-time code on a routine action); counting failures in
Better Auth's `failedVerificationCount` columns (writing a library's internal state by hand).
