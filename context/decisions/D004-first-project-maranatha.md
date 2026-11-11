# D004 · Infra · First real project: maranatha, on maranatha.fockus.dev until its domain's DNS is César's · Pending

**Decision:** phase 07 moves maranatha from Vercel; it serves at `maranatha.fockus.dev` until its own domain's
DNS is under César's control, then the domain is added as a separate step (lowered TTL the day before). Vercel
stays one week as the fallback. To solve in phase 07: its `vercel`/`vps` branch scheme (production branch) and
`@vercel/analytics`.
**Why:** César, kickoff ("lo del dns se resuelve después"). The brief asked for a low-traffic project with DNS
under control; the fockus.dev subdomain meets the second part.
**Discarded alternative:** workout (Next.js, Postgres on the VPS, no domain) — the recommended one, not chosen.
