#!/usr/bin/env bash
# kit-deploy · phase 01 · Gets César's VPS ready to run containers behind Caddy with HTTPS,
# without breaking the central Postgres that the kit's bootstrap.sh already left there.
# Run as root on the VPS, AFTER web-agent-kit's bootstrap.sh. Safe to re-run: every step
# checks before it changes anything.
#
# Usage:
#   bash server-ready.sh --db-domain db.fockus.dev            # on the VPS
#   bash server-ready.sh --db-domain db.fockus.dev --test     # inside a Docker container (no
#        systemd, no firewall, no Let's Encrypt): how infra/test/server-ready.test.sh runs it
#   --caddy-bin <path>   use an already-built Caddy (the test builds it on the host)
#
# Order, and why (web-agent-kit prompts/VPS-PLATFORM-BRIEF.md, Traps):
#   1. Docker Engine + daemon.json (log limits, live-restore). Nothing listens on :80 yet.
#   2. Caddy built with caddy-dns/cloudflare (xcaddy, inside Docker: no Go on the host).
#   3. The db.<domain> certificate moves from certbot standalone to webroot: Caddy serves
#      only http://db.<domain>/.well-known/acme-challenge/ from /var/www/acme, a dry run proves
#      it, and only then certbot rewrites the renewal config. Standalone and Caddy both want :80;
#      with standalone left in place the renewal fails in silence and every project with
#      sslmode=verify-full loses its database when the certificate expires.
#   4. ufw 80/443, swap 4 GB, Postgres OOMScoreAdjust=-900 (without restarting Postgres).
#   5. kit-db create kit_deploy, /etc/kit-deploy (0700) and the master key (never printed).
set -euo pipefail

TEST=0
DB_DOMAIN=""
CADDY_BIN=""
CADDY_VERSION="${CADDY_VERSION:-2.10.2}"
SWAP_MB="${SWAP_MB:-4096}"
PG=17
while [ $# -gt 0 ]; do
  case "$1" in
    --test) TEST=1; shift ;;
    --db-domain) DB_DOMAIN="$2"; shift 2 ;;
    --caddy-bin) CADDY_BIN="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" = 0 ] || { echo "Run it as root." >&2; exit 1; }
[ -n "$DB_DOMAIN" ] || { echo "--db-domain is required (e.g. db.fockus.dev)." >&2; exit 1; }
case "$DB_DOMAIN" in *[!a-z0-9.-]*|.*|*..*) echo "Bad domain: $DB_DOMAIN" >&2; exit 1 ;; esac
command -v kit-db >/dev/null || { echo "kit-db is missing: run the kit's bootstrap.sh first." >&2; exit 1; }
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) echo "Only Ubuntu or Debian (this is $ID)." >&2; exit 1 ;; esac
export DEBIAN_FRONTEND=noninteractive

LE=/etc/letsencrypt
RENEWAL="$LE/renewal/$DB_DOMAIN.conf"
ACME=/var/www/acme
STATE=/etc/kit-deploy

say() { echo "== $*"; }
caddy_reload() {
  if [ "$TEST" = 1 ]; then
    if pgrep -x caddy >/dev/null; then caddy reload --config /etc/caddy/Caddyfile >/dev/null
    else caddy start --config /etc/caddy/Caddyfile >/dev/null 2>&1; fi
  else
    systemctl enable -q caddy
    if systemctl is-active -q caddy; then systemctl reload caddy; else systemctl start caddy; fi
  fi
}

# Who holds a TCP port (empty if nobody): caddy may hold :80 on a re-run, anything else stops us.
port_owner() { ss -Hltnp "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -1; }

say "Packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg jq iproute2 procps openssl >/dev/null

# ── 1. Docker ──────────────────────────────────────────────────────────────────────────────
say "Docker Engine"
if command -v dockerd >/dev/null; then
  echo "Already installed: $(dockerd --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi

say "/etc/docker/daemon.json (logs 10m x 3, live-restore)"
# Merged, not overwritten: whatever the VPS already had stays. live-restore keeps running
# containers (gaby, evolution_*, every site) alive while dockerd restarts.
mkdir -p /etc/docker
DJ=/etc/docker/daemon.json
OLD='{}'; [ -s "$DJ" ] && OLD=$(cat "$DJ")
NEW=$(printf '%s' "$OLD" | jq -S '. + {"log-driver":"json-file","log-opts":((."log-opts" // {}) + {"max-size":"10m","max-file":"3"}),"live-restore":true}')
if [ "$(printf '%s' "$OLD" | jq -S .)" != "$NEW" ]; then
  [ -s "$DJ" ] && cp "$DJ" "$DJ.bak-$(date +%Y%m%d%H%M%S)"
  printf '%s\n' "$NEW" > "$DJ"
  CHANGED_DOCKER=1
else
  CHANGED_DOCKER=0; echo "Unchanged."
fi
dockerd --validate --config-file "$DJ" >/dev/null
if [ "$TEST" = 0 ]; then
  systemctl enable -q docker containerd
  if [ "$CHANGED_DOCKER" = 1 ] && systemctl is-active -q docker; then
    BEFORE=$(docker ps -q | sort)
    systemctl reload docker      # live-restore is reloadable: on before the restart
    sleep 2
    systemctl restart docker     # log-opts are not (they apply to containers created from now on)
    sleep 3
    AFTER=$(docker ps -q | sort)
    if [ "$BEFORE" != "$AFTER" ]; then
      echo "WARNING: the running containers changed across the docker restart:" >&2
      diff <(echo "$BEFORE") <(echo "$AFTER") >&2 || true
    else
      echo "dockerd restarted; the $(echo "$BEFORE" | grep -c . || true) running containers kept running."
    fi
  else
    systemctl start docker
  fi
fi

# ── 2. Caddy with caddy-dns/cloudflare ─────────────────────────────────────────────────────
say "Caddy $CADDY_VERSION with caddy-dns/cloudflare"
caddy_ok() { [ -x /usr/bin/caddy ] && /usr/bin/caddy version | grep -q "v$CADDY_VERSION" &&
  /usr/bin/caddy list-modules 2>/dev/null | grep -qx 'dns.providers.cloudflare'; }
if caddy_ok; then
  echo "Already built: $(/usr/bin/caddy version | cut -d' ' -f1)"
else
  if [ -z "$CADDY_BIN" ]; then
    [ "$TEST" = 0 ] || { echo "--test needs --caddy-bin (no Docker inside the test container)." >&2; exit 1; }
    BUILD=/usr/local/src/caddy-build; mkdir -p "$BUILD"
    # The Go build takes ~1.5 GB: a memory cap keeps the OOM killer inside that container.
    docker run --rm --memory 2g -v "$BUILD:/out" "caddy:$CADDY_VERSION-builder" \
      xcaddy build "v$CADDY_VERSION" --with github.com/caddy-dns/cloudflare --output /out/caddy
    CADDY_BIN="$BUILD/caddy"
  fi
  install -m 0755 "$CADDY_BIN" /usr/bin/caddy
  caddy_ok || { echo "The Caddy binary lacks v$CADDY_VERSION or dns.providers.cloudflare." >&2; exit 1; }
fi
getent group caddy >/dev/null || groupadd --system caddy
id caddy >/dev/null 2>&1 || useradd --system --gid caddy --create-home --home-dir /var/lib/caddy \
  --shell /usr/sbin/nologin --comment "Caddy web server" caddy
mkdir -p /etc/caddy/sites /var/log/caddy "$ACME/.well-known/acme-challenge"
chown caddy:caddy /var/log/caddy
chmod 755 /var/www "$ACME"

# Base Caddyfile: kit-deploy writes one file per site into /etc/caddy/sites/ (phase 02+).
# Every site imports (kit_access_log): one JSON access log for metrics (D015) and logs (D014).
cat > /etc/caddy/Caddyfile <<EOF
# Written by kit-deploy infra/server-ready.sh — do not edit by hand: re-run the script.
{
	admin localhost:2019
	log {
		output file /var/log/caddy/caddy.log {
			roll_size 20MiB
			roll_keep 5
		}
		format json
	}
}

(kit_access_log) {
	log {
		output file /var/log/caddy/access.log {
			roll_size 50MiB
			roll_keep 10
		}
		format json
	}
}

# The central Postgres' certificate (PgBouncer :6432) is certbot's, renewed by webroot: Caddy
# only serves the HTTP-01 challenge for it. http:// = Caddy never asks a certificate for it.
http://$DB_DOMAIN {
	import kit_access_log
	handle /.well-known/acme-challenge/* {
		root * $ACME
		file_server
	}
	handle {
		respond 404
	}
}

import sites/*.caddy
EOF
caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
caddy validate --config /etc/caddy/Caddyfile >/dev/null
# validate runs as root and opens the log files: they would stay root 0600 and the caddy user
# could not write them (the service failed on the VPS, 2026-11-11).
chown -R caddy:caddy /var/log/caddy

if [ "$TEST" = 0 ]; then
  # The official unit (caddyserver/dist), plus the Cloudflare token file César writes
  # (CONTENT_CHECKLIST #1); the leading "-" lets Caddy start without it until phase 03.
  cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy (kit-deploy)
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
EnvironmentFile=-/etc/caddy/cloudflare.env
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
fi

# ── 3. db.<domain>: certbot standalone → webroot, before anything else needs :80 ───────────
say "Certificate of $DB_DOMAIN → webroot ($ACME)"
for p in 80 443; do
  o=$(port_owner "$p")
  if [ -n "$o" ] && [ "$o" != caddy ]; then
    echo "Port $p is held by '$o', not Caddy. Stopping before touching anything else." >&2; exit 1
  fi
done
caddy_reload
# Caddy must answer the challenge path before certbot is told to use it.
probe="kit-probe-$(openssl rand -hex 6)"
echo "$probe" > "$ACME/.well-known/acme-challenge/$probe"
got=$(curl -fsS --max-time 5 -H "Host: $DB_DOMAIN" "http://127.0.0.1/.well-known/acme-challenge/$probe" || true)
rm -f "$ACME/.well-known/acme-challenge/$probe"
[ "$got" = "$probe" ] || { echo "Caddy does not serve $ACME on :80 for $DB_DOMAIN." >&2; exit 1; }

[ -f "$RENEWAL" ] || { echo "No certbot certificate for $DB_DOMAIN ($RENEWAL): did bootstrap.sh run with --domain?" >&2; exit 1; }
[ -x "$LE/renewal-hooks/deploy/kit-pgbouncer.sh" ] ||
  { echo "The PgBouncer deploy hook is missing ($LE/renewal-hooks/deploy/kit-pgbouncer.sh)." >&2; exit 1; }
if grep -q '^authenticator = webroot' "$RENEWAL"; then
  echo "Already on webroot."
else
  # Rehearsal against Let's Encrypt staging: if it fails, standalone stays as it was and Caddy
  # gives :80 back, so the next renewal still works the old way.
  if ! certbot certonly --webroot -w "$ACME" -d "$DB_DOMAIN" --cert-name "$DB_DOMAIN" -n --dry-run; then
    echo "The webroot rehearsal failed: certificate left on standalone." >&2
    if [ "$TEST" = 1 ]; then caddy stop >/dev/null 2>&1 || true; else systemctl stop caddy || true; fi
    exit 1
  fi
  # --force-renewal: with a still-valid certificate certbot "keeps" it and does not rewrite
  # the renewal config, so the authenticator would stay standalone. One reissue (rate limit:
  # 5 per week for the same name); the deploy hook copies it to PgBouncer and reloads it.
  certbot certonly --webroot -w "$ACME" -d "$DB_DOMAIN" --cert-name "$DB_DOMAIN" -n --force-renewal
  grep -q '^authenticator = webroot' "$RENEWAL" || { echo "certbot did not switch $RENEWAL to webroot." >&2; exit 1; }
fi
certbot renew --dry-run --cert-name "$DB_DOMAIN" -n

# ── 4. Firewall, swap, OOM ────────────────────────────────────────────────────────────────
if [ "$TEST" = 0 ]; then
  say "ufw: 80, 443 (22 and 6432 stay)"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw allow OpenSSH >/dev/null; ufw allow 6432/tcp >/dev/null
  ufw status | grep -q '^Status: active' || ufw --force enable >/dev/null
  ufw status | sed -n '1,20p'
fi

say "Swap ${SWAP_MB} MB"
cur=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
[ "$TEST" = 1 ] && cur=0   # a container sees the host's swap, not its own
if [ "$cur" -ge $((SWAP_MB * 9 / 10)) ]; then
  echo "Already ${cur} MB."
else
  if [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_MB}M" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MB" status=none
    chmod 600 /swapfile; mkswap /swapfile >/dev/null
  fi
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  if [ "$TEST" = 1 ]; then echo "TEST: swapon skipped (no privileges in the container)."; else swapon /swapfile; fi
fi
# Swap is the cushion, not memory: the kernel uses it only under pressure.
echo 'vm.swappiness = 10' > /etc/sysctl.d/90-kit-deploy.conf
[ "$TEST" = 1 ] || sysctl -q -p /etc/sysctl.d/90-kit-deploy.conf

say "Postgres OOMScoreAdjust=-900"
# The postmaster runs under postgresql@17-main.service on Debian/Ubuntu (postgresql.service is a
# placeholder). The drop-in counts from the next start; the running postmaster gets the value now
# through /proc, and the backends it forks inherit it: no Postgres restart.
mkdir -p /etc/systemd/system/postgresql@.service.d
cat > /etc/systemd/system/postgresql@.service.d/kit-oom.conf <<'EOF'
[Service]
OOMScoreAdjust=-900
EOF
PM_PID=$(head -1 "/var/lib/postgresql/$PG/main/postmaster.pid" 2>/dev/null || true)
if [ "$TEST" = 1 ]; then
  echo "TEST: drop-in written; /proc/$PM_PID/oom_score_adj left (needs CAP_SYS_RESOURCE)."
else
  systemctl daemon-reload
  [ -n "$PM_PID" ] && echo -900 > "/proc/$PM_PID/oom_score_adj"
  echo "postmaster $PM_PID: oom_score_adj $(cat "/proc/$PM_PID/oom_score_adj")"
fi

# ── 5. kit-deploy's own state ─────────────────────────────────────────────────────────────
say "Database kit_deploy"
if kit-db url kit_deploy >/dev/null 2>&1; then echo "Already exists."; else kit-db create kit_deploy; fi

say "$STATE (root, 0700) and the master key"
mkdir -p "$STATE"; chown root:root "$STATE"; chmod 700 "$STATE"
if [ -s "$STATE/master.key" ]; then
  echo "Master key already there (never regenerated: it would make every stored secret unreadable)."
else
  # 32 random bytes, base64: the AES-256-GCM key of every variable (D012). Not printed.
  umask 077; openssl rand -base64 32 > "$STATE/master.key"
  NEW_KEY=1
fi
chown root:root "$STATE/master.key"; chmod 400 "$STATE/master.key"

echo
echo "Ready. Caddy serves http://$DB_DOMAIN/.well-known/acme-challenge/ and imports /etc/caddy/sites/*.caddy."
[ "${NEW_KEY:-0}" = 1 ] && echo "NEW master key: copy it to your password manager now (CONTENT_CHECKLIST #4): sudo cat $STATE/master.key"
[ -f /etc/caddy/cloudflare.env ] || echo "Pending: /etc/caddy/cloudflare.env with CLOUDFLARE_API_TOKEN=… (CONTENT_CHECKLIST #1), before phase 03."
