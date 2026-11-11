# D003 · Auth · Dashboard public behind Better Auth (passkey + TOTP), no sign-up, César only · Pending

**Decision:** `deploy.fockus.dev` is reachable from the internet behind Better Auth: passkey first, TOTP as
backup, recovery codes; no public sign-up (the first account is seeded by CLI). Rate limit on auth routes and a
fail2ban jail on failed logins. v2: collaborators and read-only client view.
**Why:** César, kickoff: reviewing previews from the phone needs it public (preview login uses this session, D013).
**Discarded alternative:** tunnel only (Tailscale / `ssh -L`) — safer, but previews from the phone break;
Cloudflare Access in front — an extra dependency for one user.
