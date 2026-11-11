#!/usr/bin/env bash
# Runs infra/server-ready.sh --test in a throwaway Ubuntu container, after the kit's
# bootstrap.sh --test (Postgres 17 + PgBouncer + kit-db), and checks what it leaves.
# Usage: bun run test:infra        (or: bash infra/test/server-ready.test.sh)
# Env:   KIT_VPS_DIR   the kit's reference/vps folder (default ~/.claude/kit-reference/vps)
#        IMAGE         default ubuntu:24.04 · CADDY_VERSION default: the one server-ready.sh pins
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
INFRA="$(cd "$HERE/.." && pwd)"
KIT_VPS_DIR="${KIT_VPS_DIR:-$HOME/.claude/kit-reference/vps}"
IMAGE="${IMAGE:-ubuntu:24.04}"
CADDY_VERSION="${CADDY_VERSION:-$(sed -n 's/^CADDY_VERSION="\${CADDY_VERSION:-\([^}]*\)}"/\1/p' "$INFRA/server-ready.sh")}"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
[ -f "$KIT_VPS_DIR/bootstrap.sh" ] || { echo "No kit bootstrap.sh in $KIT_VPS_DIR (set KIT_VPS_DIR)." >&2; exit 2; }
host() { cygpath -w "$1" 2>/dev/null || echo "$1"; }   # Git Bash on Windows needs C:\… paths
export MSYS_NO_PATHCONV=1

# Caddy is built once on the host with the same xcaddy command the VPS uses, cached in a volume.
VOL=kit-deploy-caddy-$CADDY_VERSION
if ! docker run --rm -v "$VOL:/out" "caddy:$CADDY_VERSION-builder" test -x /out/caddy; then
  echo "== Building Caddy $CADDY_VERSION with caddy-dns/cloudflare (cached in volume $VOL)"
  docker run --rm --memory 2g -v "$VOL:/out" "caddy:$CADDY_VERSION-builder" \
    xcaddy build "v$CADDY_VERSION" --with github.com/caddy-dns/cloudflare --output /out/caddy
fi

docker run --rm -e CADDY_VERSION="$CADDY_VERSION" \
  -v "$(host "$KIT_VPS_DIR"):/kit:ro" -v "$(host "$INFRA"):/infra:ro" -v "$VOL:/caddy-build:ro" \
  "$IMAGE" bash /infra/test/in-container.sh
