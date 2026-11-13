# Content Checklist — kit-deploy

> Real content and César's actions that the code waits for. No agent invents this content;
> when they find or create a placeholder, they add a row here. Secrets are typed by César in
> his own terminal (stdin) or in a dashboard field — never in the chat.

| # | What is missing | Where (file/component) | Flagged by | Phase | Status |
|---|---|---|---|---|---|
| 1 | Cloudflare API token limited to **DNS edit on the zone fockus.dev** (Caddy DNS-01); César writes it into `/etc/caddy/cloudflare.env` on the VPS | `infra/` Caddy unit | kickoff (D001) | 01 | Pending |
| 2 | DNS-only records → 178.238.238.7: `*.fockus.dev` (covers `deploy` and every `<project>.fockus.dev`, D020) done 2026-11-12; `*.preview` still to add in phase 03; `maranatha` in phase 07 | Cloudflare | kickoff (D001) | 01–03, 07 | Partial (wildcard done 2026-11-12) |
| 3 | Brevo: verify fockus.dev (SPF/DKIM/DMARC records in Cloudflare) and create the API/SMTP key (secret, `env set`) | phase 06 alerts | kickoff (D002) | 06 | Pending |
| 4 | Copy `/etc/kit-deploy/master.key` into César's password manager right after it is generated | VPS | kickoff (D012) | 01/04 | Resolved (2026-11-11) |
| 5 | GHCR read-only token for the VPS (`docker login ghcr.io` as root, typed by César) — classic, `read:packages`, expires ~2027-11-12: renew before | VPS | kickoff | 02 | Resolved (2026-11-12) |
| 6 | `gh secret set KIT_DEPLOY_TOKEN` in each project's repo: `ssh kit-vps kit-deploy token create <p> \| gh secret set KIT_DEPLOY_TOKEN -R <owner/repo>` (never on screen) | each repo | kickoff | 02, 07 | kd-hello done (2026-11-12); maranatha in 07 |
| 7 | Register César's passkey and TOTP at the first login; store the recovery codes | `/login` | kickoff (D003) | 03 | Pending |
| 8 | César's alert recipient address (his Gmail), set as a plain variable | phase 06 | kickoff (D002) | 06 | Pending |
| 9 | maranatha's own domain: DNS under César's control (then add it, TTL lowered the day before) | maranatha | kickoff (D004) | after 07 | Pending |
| 10 | Logo, isotype, favicon, apple touch icon — designed by Claude Design from the brief | `design/` → `app/` | kickoff | 05 | Pending |
| 11 | UI copy of empty states and errors: realistic Spanish placeholders from the handoff, César confirms | phase 05 | kickoff | 05 | Pending |

<!-- Mark "Resolved" (do not delete the row) when it is done and the code is updated. -->
