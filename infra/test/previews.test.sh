#!/usr/bin/env bash
# Runs the previews' wildcard site (infra/caddy/kit-previews.caddy) in the real Caddy the VPS
# uses (built with caddy-dns/cloudflare, cached by server-ready.test.sh in a Docker volume) and
# checks what a browser gets. Seconds, no network: `tls internal` stands in for DNS-01.
# Usage: bun run test:infra:previews   (or: bash infra/test/previews.test.sh)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
INFRA="$(cd "$HERE/.." && pwd)"
CADDY_VERSION="${CADDY_VERSION:-$(sed -n 's/^CADDY_VERSION="\${CADDY_VERSION:-\([^}]*\)}"/\1/p' "$INFRA/server-ready.sh")}"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
host() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
export MSYS_NO_PATHCONV=1

VOL=kit-deploy-caddy-$CADDY_VERSION
if ! docker run --rm -v "$VOL:/out" "caddy:$CADDY_VERSION-builder" test -x /out/caddy; then
  echo "== Building Caddy $CADDY_VERSION with caddy-dns/cloudflare (cached in volume $VOL)"
  docker run --rm --memory 2g -v "$VOL:/out" "caddy:$CADDY_VERSION-builder" \
    xcaddy build "v$CADDY_VERSION" --with github.com/caddy-dns/cloudflare --output /out/caddy
fi

docker run --rm -v "$VOL:/caddy-build:ro" -v "$(host "$INFRA"):/infra:ro" \
  "caddy:$CADDY_VERSION-builder" sh /infra/test/previews-in-container.sh
