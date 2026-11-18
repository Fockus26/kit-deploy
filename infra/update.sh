#!/usr/bin/env bash
# kit-deploy · installs a release built by scripts/release.sh: unpack, migrate, switch, restart.
# Never through kit-deploy itself (CLAUDE.md). Run as root on the VPS, after infra/install.sh.
#
#   bash update.sh /tmp/kit-deploy-<sha12>.tgz          # on the VPS
#   bash update.sh <tgz> --test                         # in the Docker test (no systemd, no Docker)
#
# Order: the auth secret in web.env if missing → unpack to releases/<sha> → migrate (with the new
# migrations, before anything restarts)
# → `current` points at it → kit-agent restarts → the nightly preview sweep timer is installed and
# enabled → the 30 s metrics timer too → the web container is recreated → the dashboard's
# Caddy site is written if its host resolves → the previews' wildcard site, once the Cloudflare
# token and *.preview DNS exist → only the last 3 releases are kept.
# The sites never stop: their containers and Caddy are not touched.
set -euo pipefail
# Whatever the caller's umask: releases and /run/kit-deploy must be readable by the web user.
umask 022

TEST=0
TGZ=""
while [ $# -gt 0 ]; do
  case "$1" in
    --test) TEST=1; shift ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) TGZ="$1"; shift ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "Run it as root." >&2; exit 1; }
[ -f "$TGZ" ] || { echo "Usage: update.sh <kit-deploy-<sha>.tgz> [--test]" >&2; exit 1; }

BASE=/opt/kit-deploy
STATE=/etc/kit-deploy
WEB_PORT=3100
WEB_IMAGE="${WEB_IMAGE:-node:22-alpine}"
DASHBOARD_HOST="${DASHBOARD_HOST:-deploy.fockus.dev}"
# lib/core/constants.ts PREVIEW_DOMAIN; infra/caddy/kit-previews.caddy names it too.
PREVIEW_DOMAIN="${PREVIEW_DOMAIN:-preview.fockus.dev}"
KEEP_RELEASES=3
say() { echo "== $*"; }
PSITE=/etc/caddy/sites/kit-previews.caddy
CF_ENV=/etc/caddy/cloudflare.env
# The Cloudflare token (CONTENT_CHECKLIST #1). Read, not sourced: the file is data. Never printed;
# it only reaches `caddy validate`'s env. `|| true`: with no file yet, sed fails and pipefail +
# set -e would end the update in silence.
CF_TOKEN="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$CF_ENV" 2>/dev/null | head -1 || true)"
printf '%s' "$CF_TOKEN" | grep -Eq '^[A-Za-z0-9_-]{20,}$' || CF_TOKEN=""

# Every validate gets the token: once the previews site exists, the whole config needs it.
caddy_validate() { CLOUDFLARE_API_TOKEN="$CF_TOKEN" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; }

# A reload re-reads the Caddyfile but not the unit's EnvironmentFile: a Caddy started before
# cloudflare.env existed has no token and refuses the previews site; only a restart (every site
# pauses 1–2 s) gives it the token (VPS, 2026-11-13).
caddy_lacks_token() {
  [ -f "$PSITE" ] || return 1
  local pid environ
  pid="$(systemctl show -p MainPID --value caddy 2>/dev/null || true)"
  environ="${KIT_TEST_CADDY_ENVIRON:-/proc/${pid:-0}/environ}"
  ! tr '\0' '\n' < "$environ" 2>/dev/null | grep -q '^CLOUDFLARE_API_TOKEN=.'
}

# Applies Caddy's new config. A failed reload of a Type=notify unit hung systemctl for minutes
# (and ship.sh with it): bounded, and the stuck job cancelled.
caddy_apply() {
  local action=reload
  if caddy_lacks_token; then
    action=restart
    echo "Caddy started before $CF_ENV existed: restarting it (every site pauses 1–2 s)."
  fi
  if [ "$TEST" = 1 ]; then echo "TEST: caddy $action skipped."; return 0; fi
  if ! timeout 90 systemctl "$action" caddy; then
    systemctl list-jobs --no-legend 2>/dev/null | awk '$2 == "caddy.service" {print $1}' |
      while read -r job; do systemctl cancel "$job" || true; done
    echo "systemctl $action caddy failed or hung (job cancelled): see journalctl -u caddy." >&2
    return 1
  fi
}

[ -f "$STATE/cli.env" ] && [ -f "$STATE/web.env" ] || { echo "Run infra/install.sh first." >&2; exit 1; }
getent group kit-deploy >/dev/null || { echo "Run infra/install.sh first (no kit-deploy group)." >&2; exit 1; }
# server-ready.sh re-run puts it back to root 0700, and the CLI would lose cli.env: heal it.
chown root:kit-deploy "$STATE" && chmod 0710 "$STATE"

say "Auth secret"
# Better Auth's secret (D003): signs the dashboard's cookies and encrypts the TOTP secret and the
# recovery codes. Generated here once, into web.env (root 0600); never printed. Changing it signs
# everyone out and makes the stored TOTP unreadable, so an existing one is never replaced.
if grep -Eq '^BETTER_AUTH_SECRET=[0-9a-f]{64}$' "$STATE/web.env"; then
  echo "Already there (not rewritten)."
else
  # A line that is there but malformed is replaced, never left beside the new one.
  ( umask 077
    grep -v '^BETTER_AUTH_SECRET=' "$STATE/web.env" > "$STATE/web.env.tmp" || true
    # openssl's output goes straight into the file: the secret is never in an argument or a log.
    { printf 'BETTER_AUTH_SECRET='; openssl rand -hex 32; } >> "$STATE/web.env.tmp" )
  grep -Eq '^BETTER_AUTH_SECRET=[0-9a-f]{64}$' "$STATE/web.env.tmp" || {
    rm -f "$STATE/web.env.tmp"; echo "Could not generate the auth secret; web.env left as it was." >&2; exit 1; }
  chown root:root "$STATE/web.env.tmp" && chmod 0600 "$STATE/web.env.tmp"
  mv "$STATE/web.env.tmp" "$STATE/web.env"
  echo "Generated into web.env (0600 root)."
fi

say "Unpack"
TMP="$(mktemp -d "$BASE/releases/.new-XXXXXX")"
tar -xzf "$TGZ" -C "$TMP"
SHA="$(tr -dc 0-9a-f < "$TMP/VERSION")"
[ "${#SHA}" = 40 ] || { rm -rf "$TMP"; echo "Bad release: VERSION is not a commit." >&2; exit 1; }
REL="$BASE/releases/$SHA"
if [ -d "$REL" ]; then echo "Release ${SHA:0:12} already unpacked."; rm -rf "$TMP"; else mv "$TMP" "$REL"; fi
chown -R root:root "$REL"
chmod -R go-w "$REL"

say "Migrate"
# The URL stays in the file and in this process' environment: it is never printed.
# Migrations go straight to Postgres, not through PgBouncer (the kit's rule: `kit-db url
# --direct` is the migrations URL). On the VPS that is 127.0.0.1:5432, not the tunnel's 5433.
# The URL lives only in this process' environment: never in a file, never printed.
DIRECT="$(kit-db url kit_deploy --direct)"
case "$DIRECT" in
  postgresql://kit_deploy:*@127.0.0.1:5433/kit_deploy) ;;
  *) echo "Unexpected kit-db --direct url format." >&2; exit 1 ;;
esac
DATABASE_URL="${DIRECT/@127.0.0.1:5433\//@127.0.0.1:5432/}" "$REL/bin/kit-deploy-migrate" "$REL/drizzle"
unset DIRECT

say "Switch to ${SHA:0:12}"
PREV="$(readlink "$BASE/current" 2>/dev/null || true)"
ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
install -m 0755 -o root -g root "$REL/bin/kit-agent" /usr/local/sbin/kit-agent.new
mv -f /usr/local/sbin/kit-agent.new /usr/local/sbin/kit-agent
install -m 0755 -o root -g root "$REL/bin/kit-deploy" /usr/local/bin/kit-deploy.new
mv -f /usr/local/bin/kit-deploy.new /usr/local/bin/kit-deploy

say "Restart kit-agent"
if [ "$TEST" = 1 ]; then
  pkill -x kit-agent 2>/dev/null || true
  sleep 0.5
  mkdir -p /run/kit-deploy && chmod 0755 /run/kit-deploy
  KIT_AGENT_GROUP=kit-deploy nohup /usr/local/sbin/kit-agent >/var/log/kit-agent.log 2>&1 &
else
  install -m 0644 "$REL/infra/kit-agent.service" /etc/systemd/system/kit-agent.service
  systemctl daemon-reload
  systemctl enable -q kit-agent
  systemctl restart kit-agent
fi
for _ in $(seq 1 20); do [ -S /run/kit-deploy/agent.sock ] && break; sleep 0.5; done
[ -S /run/kit-deploy/agent.sock ] || { echo "kit-agent did not open its socket." >&2; exit 1; }

say "Nightly preview sweep (kit-deploy-preview-sweep.timer)"
# `kit-deploy preview sweep` as root every night (phase 03 U10). Installed or updated from the
# release and enabled; `enable --now` on the timer only schedules it, the sweep does not run here.
SWEEP_UNITS=(kit-deploy-preview-sweep.service kit-deploy-preview-sweep.timer)
SWEEP_CHANGED=0
for u in "${SWEEP_UNITS[@]}"; do
  cmp -s "$REL/infra/$u" "/etc/systemd/system/$u" && continue
  install -m 0644 -o root -g root "$REL/infra/$u" "/etc/systemd/system/$u.new"
  mv -f "/etc/systemd/system/$u.new" "/etc/systemd/system/$u"
  SWEEP_CHANGED=1
done
[ "$SWEEP_CHANGED" = 1 ] && echo "Units installed or updated." || echo "Units unchanged."
if [ "$TEST" = 1 ]; then
  echo "TEST: systemctl enable --now kit-deploy-preview-sweep.timer skipped."
else
  [ "$SWEEP_CHANGED" = 1 ] && systemctl daemon-reload
  systemctl enable -q --now kit-deploy-preview-sweep.timer
  echo "Next run: $(systemctl show -p NextElapseUSecRealtime --value kit-deploy-preview-sweep.timer 2>/dev/null || echo unknown)"
fi

say "Metrics collector (kit-deploy-metrics.timer)"
# `kit-deploy metrics collect` as root every 30 s (D015). Same install as the sweep's units.
METRICS_UNITS=(kit-deploy-metrics.service kit-deploy-metrics.timer)
METRICS_CHANGED=0
for u in "${METRICS_UNITS[@]}"; do
  cmp -s "$REL/infra/$u" "/etc/systemd/system/$u" && continue
  install -m 0644 -o root -g root "$REL/infra/$u" "/etc/systemd/system/$u.new"
  mv -f "/etc/systemd/system/$u.new" "/etc/systemd/system/$u"
  METRICS_CHANGED=1
done
[ "$METRICS_CHANGED" = 1 ] && echo "Units installed or updated." || echo "Units unchanged."
if [ "$TEST" = 1 ]; then
  echo "TEST: systemctl enable --now kit-deploy-metrics.timer skipped."
else
  [ "$METRICS_CHANGED" = 1 ] && systemctl daemon-reload
  systemctl enable -q --now kit-deploy-metrics.timer
fi

say "Web (container kit-deploy-web on 127.0.0.1:$WEB_PORT)"
UID_WEB="$(id -u kitdeploy)"
# github.env (install.sh --github-token) is optional: without it, commit statuses are skipped.
ENV_FILES=(--env-file "$STATE/web.env")
[ -f "$STATE/github.env" ] && ENV_FILES+=(--env-file "$STATE/github.env")
GID_KD="$(getent group kit-deploy | cut -d: -f3)"
# Bridge network, published on loopback only (D016), like any site. Never --network host: the
# host's loopback has Caddy's admin API (:2019, no auth), and a compromised web would rewrite
# every site's routing through it (security review, 2026-11-12). Postgres through PgBouncer at
# db.fockus.dev → host-gateway, the same way the projects reach it.
# Not labelled as a kit-deploy site container: the agent never stops or prunes it.
WEB_RUN=(docker run -d --name kit-deploy-web --restart unless-stopped
  -p "127.0.0.1:$WEB_PORT:3000" --add-host db.fockus.dev:host-gateway
  --user "$UID_WEB:$GID_KD"
  --read-only --tmpfs /tmp --tmpfs /app/.next/cache:uid="$UID_WEB"
  --cap-drop ALL --security-opt no-new-privileges --memory 512m --memory-swap 512m
  --log-opt max-size=10m --log-opt max-file=3
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3000 -e NEXT_TELEMETRY_DISABLED=1
  -e GIT_SHA="$SHA" -e BETTER_AUTH_URL="https://$DASHBOARD_HOST" "${ENV_FILES[@]}"
  -v "$REL/web:/app:ro" -v /run/kit-deploy:/run/kit-deploy -w /app
  "$WEB_IMAGE" node server.js)
if [ "$TEST" = 1 ]; then
  printf '%q ' "${WEB_RUN[@]}" > /var/log/kit-deploy-web.cmd
  echo "TEST: web container not started (no Docker here); command in /var/log/kit-deploy-web.cmd"
else
  docker pull -q "$WEB_IMAGE" >/dev/null
  docker rm -f kit-deploy-web >/dev/null 2>&1 || true
  "${WEB_RUN[@]}" >/dev/null
  for _ in $(seq 1 30); do
    curl -fs -o /dev/null "http://127.0.0.1:$WEB_PORT/" && break; sleep 1
  done
  curl -fs -o /dev/null "http://127.0.0.1:$WEB_PORT/" || {
    echo "The web did not answer on :$WEB_PORT. Logs: docker logs kit-deploy-web" >&2; exit 1; }
fi

say "Dashboard site ($DASHBOARD_HOST)"
SITE=/etc/caddy/sites/kit-deploy.caddy
if getent ahosts "$DASHBOARD_HOST" >/dev/null 2>&1; then
  NEW="$(printf '# Written by kit-deploy infra/update.sh.\n%s {\n\timport kit_access_log\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DASHBOARD_HOST" "$WEB_PORT")"
  if [ "$(cat "$SITE" 2>/dev/null)" != "$NEW" ]; then
    printf '%s\n' "$NEW" > "$SITE.tmp" && chmod 644 "$SITE.tmp" && mv "$SITE.tmp" "$SITE"
    if caddy_validate; then
      caddy_apply
    else
      rm -f "$SITE"; echo "caddy validate failed with the dashboard site: removed it." >&2; exit 1
    fi
  else
    echo "Unchanged."
  fi
else
  # Without DNS, Caddy would retry the certificate forever (and count against Let's Encrypt).
  echo "$DASHBOARD_HOST does not resolve yet: site not written (CONTENT_CHECKLIST #2)."
fi

say "Previews site (*.$PREVIEW_DOMAIN)"
# One wildcard certificate by DNS-01 (D001). Written only once the Cloudflare token
# (CONTENT_CHECKLIST #1) and the wildcard record both exist: without them Caddy would retry the
# certificate forever. Its per-preview files live in /etc/caddy/previews/ (kit-agent writes them).
if [ -z "$CF_TOKEN" ]; then
  echo "No Cloudflare token in $CF_ENV (CLOUDFLARE_API_TOKEN=…, CONTENT_CHECKLIST #1): previews site not written."
elif ! getent ahosts "kit-probe.$PREVIEW_DOMAIN" >/dev/null 2>&1; then
  echo "*.$PREVIEW_DOMAIN does not resolve yet: previews site not written (CONTENT_CHECKLIST #2)."
else
  install -d -m 0755 -o root -g root /etc/caddy/previews
  NEW="$(cat "$REL/infra/caddy/kit-previews.caddy")"
  if [ "$(cat "$PSITE" 2>/dev/null)" != "$NEW" ]; then
    OLD=""; [ -f "$PSITE" ] && OLD="$(cat "$PSITE")"
    printf '%s\n' "$NEW" > "$PSITE.tmp" && chmod 644 "$PSITE.tmp" && mv "$PSITE.tmp" "$PSITE"
    if caddy_validate; then
      caddy_apply
      echo "Written; Caddy asks for the *.$PREVIEW_DOMAIN certificate by DNS-01."
    else
      # The previous file (if any) comes back: a bad template never takes the previews down.
      if [ -n "$OLD" ]; then printf '%s\n' "$OLD" > "$PSITE"; else rm -f "$PSITE"; fi
      echo "caddy validate failed with the previews site: left as it was." >&2; exit 1
    fi
  elif caddy_lacks_token; then
    caddy_apply   # unchanged file, but the running Caddy never got the token: restart it
  else
    echo "Unchanged."
  fi
fi
unset CF_TOKEN

say "Old releases"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [ "${old%/}" = "$REL" ] || [ "${old%/}" = "${PREV%/}" ] || { rm -rf "${old%/}"; echo "removed $(basename "$old")"; }
done

echo
echo "kit-deploy ${SHA:0:12} installed (previous: ${PREV:+$(basename "$PREV" | cut -c1-12)}${PREV:-none})."
