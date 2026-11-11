# D002 · Email · Alerts by email through Brevo, from alertas@fockus.dev to César's Gmail · Pending

**Decision:** alerts go out by Brevo (API or SMTP), sender "kit-deploy" <alertas@fockus.dev>, recipient
César's personal Gmail. fockus.dev is verified in Brevo with SPF/DKIM/DMARC records in Cloudflare. No mailbox:
sending needs none. If receiving at @fockus.dev is ever needed: Cloudflare Email Routing (free) forwards to Gmail.
**Why:** César, kickoff. Email is never sent from the VPS (new IP, no reputation — VPS-POSTGRES.md).
**Discarded alternative:** Telegram (instant, but César chose email); both (more work in phase 06).
