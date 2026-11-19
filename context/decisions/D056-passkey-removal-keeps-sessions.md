# D056 · Auth · Removing a passkey ends no session, not even the one it opened · Implemented (2026-11-18)

**Decision:** Eliminar passkey (D055) deletes the credential row only. Sessions in Better Auth are
not tied to the credential that opened them, so the current session — even if that very passkey
opened it — and any other open session stay until they expire (24 h, `SESSION_TTL_SECONDS`) or the
person signs out. The device can no longer sign in with that passkey; to use it again it needs a
new enrolment link. The dialog says "no se puede deshacer"; for the last passkey it adds that the
next sign-in is with the authenticator app or a recovery code.
**Why:** a removal is "this device should not get in again", not "sign me out": cutting the session
mid-dialog would surprise, and a lost device's session is the job of a "close other sessions"
control, which the panel does not have yet (Better Auth has `revoke-other-sessions`; not opened).
**Discarded alternative:** revoking every session of the user on removal (also signs out the phone
César is using, and the removal still would not stop someone who already has the cookie from
acting until then — that is what the TOTP check is for).
