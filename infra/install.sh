#!/usr/bin/env bash
# kit-deploy · phase 02 · first install on the VPS, after infra/server-ready.sh. Safe to re-run.
#
#   bash install.sh /tmp/kit-deploy-<sha12>.tgz [--admin-user <ssh user>]
#   bash install.sh <tgz> --ghcr-login <github user>    # also: docker login ghcr.io (token on stdin)
#   bash install.sh <tgz> --test                        # in the Docker test
#
# What it sets up (once), then hands over to update.sh for the release itself:
#   1. group kit-deploy (may talk to kit-agent's socket) and system user kitdeploy (the web).
#   2. /etc/kit-deploy 0710 root:kit-deploy (traverse only; master.key stays root 0400).
#   3. cli.env (root:kit-deploy 0640) and web.env (root 0600) with kit_deploy's DATABASE_URL:
#      the same PgBouncer URL every project gets (`kit-db url`, TLS verify-full). The switch's
#      lock is transaction-scoped, so transaction pooling is fine. Written once; never printed.
#   4. Optional: docker login ghcr.io for root (kit-agent pulls private images). The token is
#      read from stdin — César types or pipes it in his terminal, never in the chat.
set -euo pipefail

TEST=0
TGZ=""
ADMIN_USER=""
GHCR_USER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --test) TEST=1; shift ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --ghcr-login) GHCR_USER="$2"; shift 2 ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) TGZ="$1"; shift ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "Run it as root." >&2; exit 1; }
[ -f "$TGZ" ] || { echo "Usage: install.sh <kit-deploy-<sha>.tgz> [--admin-user u] [--ghcr-login u] [--test]" >&2; exit 1; }
command -v kit-db >/dev/null || { echo "kit-db is missing: run the kit's bootstrap.sh first." >&2; exit 1; }
[ -f /etc/kit-deploy/master.key ] || { echo "Run infra/server-ready.sh first." >&2; exit 1; }
case "$ADMIN_USER" in *[!a-z0-9_-]*) echo "Bad --admin-user." >&2; exit 1 ;; esac
case "$GHCR_USER" in *[!A-Za-z0-9-]*) echo "Bad --ghcr-login user." >&2; exit 1 ;; esac

STATE=/etc/kit-deploy
say() { echo "== $*"; }

say "Group and users"
getent group kit-deploy >/dev/null || groupadd --system kit-deploy
id kitdeploy >/dev/null 2>&1 || useradd --system --gid kit-deploy --no-create-home \
  --home-dir /nonexistent --shell /usr/sbin/nologin kitdeploy
if [ -n "$ADMIN_USER" ]; then
  id "$ADMIN_USER" >/dev/null 2>&1 || { echo "No user $ADMIN_USER." >&2; exit 1; }
  usermod -aG kit-deploy "$ADMIN_USER"
  echo "$ADMIN_USER is in kit-deploy (takes effect on its next login)."
fi

say "/etc/kit-deploy"
chown root:kit-deploy "$STATE"
chmod 0710 "$STATE"

say "Database URL files"
if [ -f "$STATE/cli.env" ] && [ -f "$STATE/web.env" ]; then
  echo "Already there (not rewritten)."
else
  URL="$(kit-db url kit_deploy)"
  case "$URL" in
    postgresql://kit_deploy:*@*:6432/kit_deploy\?sslmode=*) ;;
    *) echo "Unexpected kit-db url format; nothing written." >&2; exit 1 ;;
  esac
  # umask only for these two files: inherited by update.sh it made /run/kit-deploy 0700 and
  # locked the kit-deploy group out of the agent's socket (Docker test, 2026-11-12).
  (
    umask 077
    printf '# kit-deploy CLI (deploy, rollback, regenerate). Written by infra/install.sh.\nDATABASE_URL=%s\n' "$URL" > "$STATE/cli.env.tmp"
    printf '# kit-deploy web (docker --env-file). Written by infra/install.sh.\nDATABASE_URL=%s\nKIT_AGENT_SOCKET=/run/kit-deploy/agent.sock\n' "$URL" > "$STATE/web.env.tmp"
  )
  unset URL
  chown root:kit-deploy "$STATE/cli.env.tmp" && chmod 0640 "$STATE/cli.env.tmp"
  chown root:root "$STATE/web.env.tmp" && chmod 0600 "$STATE/web.env.tmp"
  mv "$STATE/cli.env.tmp" "$STATE/cli.env"
  mv "$STATE/web.env.tmp" "$STATE/web.env"
  echo "Written (cli.env 0640 root:kit-deploy, web.env 0600 root)."
fi

if [ -n "$GHCR_USER" ]; then
  say "docker login ghcr.io as $GHCR_USER"
  echo "Paste a GitHub token with read:packages only, then Enter (it is not shown):"
  if [ "$TEST" = 1 ]; then
    IFS= read -r TOKEN || true
    [ -n "$TOKEN" ] && echo "TEST: token read (${#TOKEN} chars), docker login skipped."
  else
    IFS= read -rs TOKEN
    printf '%s' "$TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
    echo "Logged in (credentials in /root/.docker/config.json)."
  fi
  unset TOKEN
fi

mkdir -p /opt/kit-deploy/releases
chmod 0755 /opt/kit-deploy /opt/kit-deploy/releases

say "Release"
HERE="$(mktemp -d)"
tar -xzf "$TGZ" -C "$HERE" ./infra/update.sh
bash "$HERE/infra/update.sh" "$TGZ" $([ "$TEST" = 1 ] && echo --test)
rm -rf "$HERE"
