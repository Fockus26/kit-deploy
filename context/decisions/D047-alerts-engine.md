# D047 · Alerts · One check per minute, incidents by streak, one Brevo digest per run · Confirmed (2026-11-18)

**Decision:** `kit-deploy alerts check` (root, `kit-deploy-alerts.timer`, every minute) looks at
every production site's `/api/health` (a container stopped with the panel's Parar is skipped), the
certificates (domains' `cert_not_after` plus the new `platform.certs` op: certbot's
`db.fockus.dev`, the dashboard's and the previews' wildcard), the VPS disk (> 80 %) and memory
(> 90 % used) from the metrics collector's last reading, `kit-db status` through the new
`backups.status` op (a FAIL newer than the newest dump, or a dump older than 36 h) and each
project's last production deployment (failed in the last 7 days). Each subject keeps a streak in
`alert_checks`; an incident opens in `alerts` after its rule's failing runs (site 3, memory 5,
disk 2, the rest 1) and resolves after its fine runs (site and memory 5, disk 5, the rest 1).
Every opening and resolution not emailed yet goes out in ONE digest per run, from
"kit-deploy" <alertas@fockus.dev> by Brevo's v3 API (D002), so an outage of every site is one
email, not one per site; a failed send is retried next run. The Brevo key and the recipient live
in `/etc/kit-deploy/alerts.env` (root 0600), written by `kit-deploy alerts setup --to <email>`
with the key on stdin; without it the incidents are recorded and their emails wait.
The email is a plain table layout with the light theme's token values inlined (a test keeps them
equal to `globals.css`) and the state as a word (ABIERTA / RESUELTA), never color alone.
**Why:** brief F10 ("one email per incident, a resolved email, no storm") with a check that never
needs the web app, and the key never in argv, the chat or the database.
**Discarded alternative:** one email per alert (a VPS-wide outage would send one per site);
storing the Brevo key encrypted in `env_vars` (the alerts must work with the web and its
database row-level code out of the picture, and the key is the platform's, not a project's);
a fixed "one email per N minutes" rate limit (would delay the first email of a real outage).
