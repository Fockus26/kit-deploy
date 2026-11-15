# Phase 03 — Previews · log

Plan: `context/plans/03-previews.md` (agreed 2026-11-13).

## Before the code (2026-11-13)

- VPS, read-only: Caddy v2.10.2 already has `dns.providers.cloudflare`; its unit already loads
  `EnvironmentFile=-/etc/caddy/cloudflare.env` (`CLOUDFLARE_API_TOKEN`).
- César created the Cloudflare token (DNS Write + Zone Read on fockus.dev, IP filter 178.238.238.7,
  no expiry), wrote `/etc/caddy/cloudflare.env` (root 0600, one line), added the DNS-only
  `*.preview.fockus.dev` record, and gave the GitHub status token "Pull requests: read and write".
- `x.preview.fockus.dev` already resolved through `*.fockus.dev` (RFC 4592: no `preview` node);
  the explicit record keeps it working if `preview.fockus.dev` is ever created.

## U1 — feat/preview-wildcard

- The wildcard site ships in the release (`infra/caddy/kit-previews.caddy` + `pages/`) and
  update.sh installs it into `/etc/caddy/sites/kit-previews.caddy`, like the dashboard's site — no
  re-run of server-ready.sh (it touches certbot and resets /etc/kit-deploy to 0700).
- Found with the real Caddy: `caddy validate` provisions the Cloudflare module and refuses an
  empty/invalid token → update.sh reads the token (not sourcing the file) and passes it only in
  validate's env. A failed validate restores the previous file and exits 1.
- `header >X-Robots-Tag` (deferred) wins over an app's own header: checked with an upstream that
  sends `X-Robots-Tag: all` → one header, `noindex, nofollow`.
- `*.preview.fockus.dev` matches one label: `a.b.preview…` gets no site (TLS fails).
- Tests: `bun run test:infra:previews` (real Caddy, tls internal) ALL PASS; install --test in Docker:
  see the PR.
- PR #17 merged (f8632b5). Two bugs the Docker test caught before the merge: release.sh did not
  ship `infra/caddy/`; with no cloudflare.env, `sed | head` + pipefail ended update.sh in silence.

### U1 on the VPS (2026-11-13, César's OK)

- `ship.sh` f8632b5: release in `current`, agent + web restarted, `kit-previews.caddy` written,
  validate OK with the real token — but `systemctl reload caddy` failed: the running Caddy (started
  01:46) predates cloudflare.env (18:02); a reload does not re-read EnvironmentFile → "API token ''".
  Caddy kept the old config (sites up: kd-hello 200, deploy 200), but the reload job hung systemctl
  and ship.sh (>10 min).
- With César's OK: `systemctl cancel 36205`, `systemctl restart caddy` → token in its env, Let's
  Encrypt `*.preview.fockus.dev` (YE1, until 2027-02-11) by DNS-01 in seconds. From outside:
  `nope-pr-1.preview.fockus.dev` → 404 "Este preview no existe", `X-Robots-Tag: noindex, nofollow`,
  `no-store`; http → 308. kd-hello 200, deploy 200. `certbot renew --dry-run` db.fockus.dev: success.
- CT logs: scanners hit bare `preview.fockus.dev` within a minute of issuance (not a preview host).
- Left on the VPS: `/tmp/kit-deploy-ship.QRv4fu` and `.za4T51` (~160 MB each; ship.sh's rm skipped
  after the failure) — César decides.
- Fix PR #18 (fix/caddy-restart-token): restart when Caddy lacks the token, bounded reload + cancel,
  every validate with the token (else the dashboard's validate would fail once the previews site
  exists). Install --test 70/70. Ships with the next release.
- 2026-11-13, César's OK: removed both leftover `/tmp/kit-deploy-ship.*` dirs (161 + 143 MB, only
  release tarballs already unpacked). Disk / 15 % of 96 G.
- U2 (auth backend) handed to its own session.

### U2 auth backend (2026-11-13, PR #19, branch feat/auth-backend)

- Better Auth 1.7.23 + @better-auth/passkey: passkey (rpID deploy.fockus.dev, UV required),
  TOTP + 10 recovery codes (two-factor, allowPasswordless), no password, no sign-up. Migration
  0002_auth (auth_* tables, text ids; enrolment_tokens with sha256 like deploy_tokens).
- TOTP as standalone backup: custom `POST /sign-in/totp {email}` opens the same challenge the
  two-factor plugin opens after a password (two_factor cookie + verification rows); the code goes
  through Better Auth's own verify-totp / verify-backup-code (per-challenge 5 tries, account
  lockout 10 → 15 min).
- Closed allowlist of 11 routes (lib/auth/handler.ts); register passkey / enable TOTP only from an
  enrolment session (`enrolUntil`, 30 min, browser-session cookie). `requestUser()` /
  `dashboardUser()` reject enrolment sessions. Dashboard session 24 h, updateAge 1 h.
- Cookies `__Host-kd.*` (useSecureCookies false + cookiePrefix, Secure forced): host-only enforced
  by the browser; unit test reads the real Set-Cookie of every flow (no Domain).
- `kit-deploy user create|enrol <email>`: TTY only (`ssh -t`); link `https://deploy.fockus.dev/enrol#kde_…`
  (fragment: never reaches Caddy's log), 15 min, one use; enrol invalidates earlier links.
- update.sh: BETTER_AUTH_SECRET (openssl rand -hex 32) into web.env if missing/malformed, never
  printed or replaced; web gets BETTER_AUTH_URL. install --test ALL PASS (81).
- Failed sign-ins: `kit-deploy-auth: failed sign-in from <ip> path=… status=…` on the web's stdout.
  fail2ban jail = own small infra unit (journald log driver or Caddy access log 401/429).
- security-review: no high-confidence findings. Closed the one low observation: passkey
  verify-registration with `createSession: true` would swap the enrolment session for a dashboard
  one → 400.
- Not verified: real WebAuthn ceremony (U3 page), host-only in the browser (phase close).
- Gotcha: Python on Windows wrote a shell script with CRLF in the working copy (git normalizes the
  repo, but the Docker test mounts the working copy) → `set: pipefail: invalid option`.
- PR #19 merged (ddeddee). 2026-11-13, César's OK ("Sí, súbelo"): release ddeddee0875a copied
  (sha256 checked) and update.sh run detached (nohup, log /root/kit-deploy-update-ddeddee.log):
  secret generated (web.env root 0600, one valid line), migrations applied: 3, web up with
  BETTER_AUTH_URL, dashboard + previews sites unchanged (no Caddy reload), 7 new tables.
  From outside: get-session 200, passkey authenticate options 200 with a `__Host-kd.*` cookie
  (no Domain), sign-up/email 404, GET sign-out 405, deploy / 200, kd-hello 200, preview 404 page.
  A wrong TOTP → 401 and the fail2ban line with the real client IPv4. Ports 80/443 untouched:
  no certbot dry-run needed. Ship dir in /tmp removed. CONTENT_CHECKLIST #7 waits for U3's /enrol.

### U3 login + enrol pages (2026-11-14, PR #20, branch feat/login-enrol-pages)

- Worktree `.claude/worktrees/u3-login` (shared main folder left untouched).
- `/enrol`: token from the fragment, wiped with replaceState (never in a request URL, `no-referrer`),
  POST /kit/enrol, 3 steps (passkey → TOTP with a local `uqr` QR + typed key → 10 recovery codes,
  copy/.txt, mandatory checkbox, beforeunload guard). Used/expired → Spanish error + copyable
  `ssh -t kit-vps kit-deploy user enrol <tu-email>`. Reload inside 30 min resumes (get-session
  enrolUntil). Pasting a new link in the same tab = hashchange only → handled (found in QA).
- `/login`: passkey button; email + code (6 digits → verify-totp, else verify-backup-code); one
  message for unknown email / wrong code / lockout. `next` via `lib/auth/next-path.ts`.
- `proxy.ts` (optimistic cookie check → `/login?next=`); `/` real check (requestUser, Suspense).
  noindex: meta + X-Robots-Tag (next.config headers). Tokens in globals.css (dark default).
  shadcn primitives written from new-york source (CLI too slow on this network).
- security-review: 1 finding, open redirect `/.//evil` → `//evil` after URL parsing (dot segments
  keep empty segments). Fixed by validating the parsed URL (+ encoded %2F/%5C/control rejected);
  re-review fuzzed 508,621 inputs: none. 37 next-path tests.
- QA: Docker Desktop was off after a restart → `qa:local --offline` + faked /api/auth + CDP virtual
  WebAuthn authenticator: 39/39 (axe AA dark+light every state, focus, 320 px, announcements).
  Full suite 282 pass. Gotcha: biome's `!**/.claude/worktrees` makes `bun run lint` check nothing
  inside a worktree; pass paths explicitly. qa:local needed a `db:migrate` script (added).
- Not verified locally: the real ceremony against Postgres → verified at César's enrolment.

### U3 shipped + enrolment + U3b (2026-11-14, PR #21, branch fix/enrol-passkey-only)

- #20 shipped with César's OK ("Sí, súbelo"): release 87be67cba848 copied (sha256 checked),
  update.sh detached (nohup, /root/kit-deploy-update-87be67c.log): secret kept, migrations 3,
  web switched, dashboard + previews sites unchanged (no Caddy reload, no 80/443 change). From
  outside: / 307 → /login, /login /enrol 200 with X-Robots-Tag, sign-up 404, kd-hello 200,
  preview 404. Gotcha: a Monitor with `ssh … pgrep -f "infra/update.sh"` matches its own command
  line and never ends: tail the log instead.
- César's enrolment: links 1–2 failed with 401 — Caddy showed a 55-byte body instead of 59: the
  token arrived 4 chars short (PowerShell wrapped the indented link; the click opened the first
  line). Server and page fine (same standalone build + full link → 200 locally). Link 3 pasted
  whole: passkey registered (multiDevice, backed up: saved by Chrome/Windows, not his manager),
  TOTP confirmed, sign-in with email + TOTP OK (17:19 UTC). Passkey sign-in tried twice, not
  completed: he wants it in his password manager.
- U3b (#21, merged 7112799): /enrol says "El enlace llegó incompleto" for a malformed token and
  does not post it; CLI prints the link alone (79 cols); /kit/enrol returns twoFactorEnabled and a
  later link only adds a passkey (no /two-factor/* call). Offline QA 18/18, CI green. The first
  passkey stays registered (his; removal needs a route → phase 05).
- Pending: ship #21 (César's OK), César adds a passkey in his manager and signs in with it,
  cookie Domain check in the browser.
- #21 shipped with César's OK ("Sí, súbelo"): release 71127994296e (sha256 checked), update.sh
  detached (/root/kit-deploy-update-7112799.log): migrations 3, web switched, sites unchanged. From
  outside: same answers as #20; a malformed token → 401 INVALID_ENROLMENT_LINK.
- 2026-11-14: César re-enrolled with #21 (passkey-only path worked: 2nd passkey 18:49, TOTP kept)
  but it again went outside his password manager ("es culpa mía, luego lo arreglamos"). U3 closed;
  pending for César: passkey in his manager, passkey sign-in, cookie Domain check (phase close).

### U4 merged (2026-11-14, PRs #22, #23)

- #22 (13d7641): `/preview-access` one-time grant → exchange on the preview host → `kd_preview`;
  `/api/v1/preview-auth` for forward_auth. #23 (40a837c): Caddy `kit_preview` gate (exchange,
  forward_auth, app). Merged by other sessions; whether it is on the VPS is not confirmed here.

### U5 core + agent: preview site file (2026-11-14, PR #24, branch feat/preview-site-file)

- `renderPreviewSite` (lib/core/caddy.ts): `/etc/caddy/previews/<p>-pr-<n>.caddy` = matcher +
  `handle` with one import: `kit_preview 127.0.0.1:<port>` (running) or `kit_preview_asleep <p> <n>`
  (D017). kit-previews.caddy: exchange + forward_auth moved to `kit_preview_gate`, imported first in
  both snippets' `route`; asleep = 503 page `pages/preview-asleep.html` (templates fill project · PR),
  behind the login too (decision: do not publish which PRs exist).
- kit-agent: `preview.write` (zod discriminated by state: running needs a D016 port, asleep none)
  and `preview.remove`; the agent renders the file itself, `assertPreviewFile` re-checks path and
  shape, atomic write, validate + bounded reload, restore on failure; refuses if
  `sites/kit-previews.caddy` is missing. Hardening: site.write/site.remove production-only and no
  host under preview.fockus.dev (a site block of its own would skip the gate).
- Verified: full suite 365 pass; real-Caddy Docker test 36/36 with files rendered by lib/core;
  typecheck, lint, build green; security-review: no findings. Copy → CONTENT_CHECKLIST #14.
- Gotcha: previews.test.sh sets MSYS_NO_PATHCONV=1, so a /tmp path handed to bun.exe must go
  through cygpath -w first (bun wrote to C:\tmp otherwise).
- Not on the VPS: needs César's OK (update.sh reinstalls kit-previews.caddy + new agent).
- CI's lint failed on `{{ }}` in preview-asleep.html (biome's HTML parser): the snippet sets
  `templates { between %% %% }` (17701ca); real-Caddy test 36/36 again, CI green, squash-merged
  as e134cca. Copy and deploy pending (César).

### U4 + U5 on the VPS (2026-11-15, César's OK: "Sí, sube U4 + U5")

- The VPS was still on 7112799: U4 had never shipped. Release e134ccafbe1b (main, U4 + U5) built;
  `install.test.sh` with that tgz in Docker 81/81; copied (sha256 66e74f6c… checked), update.sh
  detached (/root/kit-deploy-update-e134cca.log): secret kept, migrations 4 (0003 preview access),
  agent restarted, web switched, dashboard site unchanged, kit-previews.caddy rewritten (gate +
  asleep snippets), Caddy reloaded cleanly; release ddeddee pruned; ship dir removed.
- From outside: deploy / 307 → /login 200; /preview-access without session → /login?next=…;
  kd-hello 200 (+ /api/health); nope-pr-1.preview → 404 "Este preview no existe", noindex, no-store.
- Agent: version 0.1.0; preview.remove of a missing PR → removed:false (no-op); site.write with a
  preview host → bad_request. /etc/caddy/previews/ still empty (U6 writes the first one).
- Ports 80/443 untouched: no certbot dry-run needed.

### U6 API + preview switch (2026-11-15, PR #25, branch feat/u6-preview-api)

- `POST /api/v1/deploy {sha, pr?}`: with pr → preview row (env preview, pr), response adds
  `preview: {pr, url}`. `DELETE /api/v1/preview {pr}` → 202, then `closePreview` under the project
  lock: preview.remove first (Caddy refusing → nothing changed, retry), open rows of the PR →
  superseded, containers stop (0 s) + rm. Shared `authorize()` (token, size, strict zod, token →
  project); the body can never name a project or an image.
- Switch: `deployOne` split into deployProduction (unchanged behaviour) / deployPreview
  (runNew 384 MB → health → preview.write running → markLive → drain → stop + rm the PR's old
  one; nothing kept). claimNext takes the newest queued of any scope and supersedes only its own
  scope (production or that PR); markLive likewise (`scopeIs` in lib/db/store.ts). Production
  commit status is not posted for previews (U7 does `kit-deploy/preview`).
- Migration 0004_preview_pr: open-commit unique index → (project, env, coalesce(pr,0), sha);
  CHECK pr 1..999999. `onConflictDoNothing()` without target (expression index).
- Verified: suite 397 pass; repo/store vs real Postgres 17 (Docker) 14 pass; build, typecheck,
  lint green; security-review no findings.
- Known gap: a build finishing after the `closed` event re-creates the preview → U10's sweep.
- Gotchas: biome ignores `.claude/worktrees` (lint there with explicit paths or the exclusion
  removed temporarily); Python on Windows writes CRLF (use newline='\n').
- Not on the VPS: needs César's OK (release + migration 0004).
- CI green (2026-11-15). The agent's `gh pr merge` was denied by the permission classifier: César merges #25.
- Squash-merged as c4943ab with César's permission in chat ("Te doy permiso"). VPS pending his OK.

### U7 GitHub status + PR comment (2026-11-15, PR #27, branch claude/preview-github-comment-7a5a1d)

- `lib/deploy/github.ts`: one client (`githubRequest`) for statuses and comments; token only in
  `Authorization`; errors = HTTP status / fetch error name / fixed text, never a body.
- `commit-status.ts` takes `context` (`STATUS_CONTEXTS.production | preview`); `StatusError` is
  now a re-export of `GitHubError`. Preview: success "Preview at <host>" + target_url, failure
  "Deploy failed: …". Logs `switch.status*` now carry `context`.
- `lib/deploy/pr-comment.ts`: marker `<!-- kit-deploy:preview <project> -->`; GET comments
  (100/page, ≤ 10 pages) → first starting with the marker whose author_association is
  OWNER/MEMBER/COLLABORATOR → PATCH, else POST. A failed push leaves the comment alone; close →
  PATCH "eliminada", never POST (`missing` → `preview.comment_skipped` "no comment").
- `closePreview(project)` now needs `repo` (TokenProject already had it). Runtime wires
  `comments: commenterFromEnv()` with the same GITHUB_STATUS_TOKEN.
- Verified: suite 420 pass; build, typecheck, lint green; security-review no findings.
- Not on the VPS: needs César's OK (web release only, no migration, no agent change).
