# D067 · Auth · Recovery codes are shown or regenerated from Ajustes only with a fresh TOTP code; they live only in the dialog · Implemented (2026-11-22)

**Decision:** Ajustes › Códigos de recuperación gets "Ver códigos" and "Generar nuevos", one
dialog each asking for the authenticator app's current 6-digit code (César, 2026-11-22: "Sí, con
el código" — there is no password, D003). Both are Server Actions
(`lib/panel/actions/backup-codes.ts`) with Eliminar passkey's order (D055): session → form
(exactly 6 digits, spaces dropped) → `auth_user.two_factor_enabled` (off → refused) → the guard
→ `auth.api.verifyTOTP` → only then Better Auth, server-side: `auth.api.viewBackupCodes({ body:
{ userId } })` (server-only, decrypts the stored ones: the **remaining** unused codes; none left →
the dialog says so and offers Generar nuevos) or `auth.api.generateBackupCodes` with the request's
cookie (`allowPasswordless`: no password; 10 new codes, the old ones stop working at once; the
dialog says so before confirming). No route is opened in `lib/auth/handler.ts`.
The codes travel only in the action's result (the dialog's `useActionState`, called with `null`
as the previous state so they never ride along in a later request, D041): never in a URL, a
cookie, a cache, a log line or the audit row; closing the dialog unmounts that state. They are
shown with the enrolment's own list, Copiar and Descargar .txt (`components/auth/recovery-codes.tsx`).
Audit rows `backup_codes.view` / `backup_codes.regenerate`, project `-` (the account), no name;
migration `0017_backup_codes_audit` widens the check. View writes its row **before** returning the
codes (a failed write shows nothing). Regenerate writes it **right after** Better Auth, not in one
transaction: Better Auth writes `two_factor.backup_codes` through its own adapter, outside any
transaction of ours, and once it did the old codes are dead — so a failed audit write is logged
(without codes) and the new codes are still returned rather than lost.
A wrong code or a blocked try logs `kit-deploy-auth: failed sign-in from <ip> path=/panel/backup-codes
status=401|429` for the fail2ban jail (D003).
**Why:** César: "No puedo volver a generar los codigos de recuperacion o verlos". A stolen
dashboard cookie alone must not be able to read the codes (they are a way in) nor replace them
(D041's reasoning, D055).
**Discarded alternative:** opening `/two-factor/generate-backup-codes` in the handler (a session
alone would regenerate, and it cannot view); a recovery code to confirm (spends one to see the
rest); a password (there is none, D003); wrapping Better Auth's write and the audit row in our
transaction (its adapter does not take our `tx`).
