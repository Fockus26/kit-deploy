# D068 · Auth · One TOTP guard for every panel action confirmed with a fresh code · Implemented (2026-11-22)

**Decision:** `lib/panel/totp-guard.ts` exports one `panelTotpGuard` (`memoryTotpGuard`, D055)
that Eliminar passkey, Ver códigos / Generar nuevos (D067) and Eliminar proyecto (D069) all use:
the tries per user (5 in 15 minutes) and the spent codes (2 minutes) are shared. A code that
removed a passkey is refused, as already used, to view the recovery codes and vice versa; wrong
codes on any of them count toward the same limit. Each action keeps its own `path=` in the
failed line (`/panel/passkey-remove`, `/panel/backup-codes`, `/panel/project-remove`).
**Why:** a guard per action would multiply the guesses a stolen session gets (5 × the number of
actions per window) and let one code confirm two dangerous actions inside its ~90 s of validity.
Measured in `tests/unit/backup-codes.test.ts` › "the shared guard".
**Discarded alternative:** one guard per action (the limit multiplies); keeping the count in
Better Auth's `failedVerificationCount` (writing a library's internal state, D055).
