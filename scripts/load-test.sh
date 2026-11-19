#!/usr/bin/env bash
# Load test a site from this machine: k6 in Docker (nothing to install), script in
# infra/load-test/site.js. Run it from the laptop, not the VPS, or k6 competes with the site for
# the same CPU. It loads a live site: production only with César's OK.
#
# Usage: bun run load-test -- <url> [--rate N] [--duration 60s] [--paths /,/api/health]
#                                   [--resolve <ip>] [--strict]
#   --rate      requests started per second (default 50)
#   --duration  how long (default 60s; Ns or Nm)
#   --paths     comma-separated paths, picked at random per request (default /)
#   --resolve   send to this IP without asking DNS (the VPS's IP; Host and TLS stay the site's)
#   --strict    zero failed requests allowed: run it across a deploy (brief › Done when)
# Exit: 0 thresholds met · 99 a threshold failed (k6's code) · 2 bad arguments or no Docker.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
K6_IMAGE="grafana/k6:2.3.0"

die() { echo "load-test: $1" >&2; exit 2; }

TARGET="" RATE=50 DURATION=60s PATHS=/ RESOLVE="" STRICT=0 NETWORK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rate) RATE="${2-}"; shift 2 ;;
    --duration) DURATION="${2-}"; shift 2 ;;
    --paths) PATHS="${2-}"; shift 2 ;;
    --resolve) RESOLVE="${2-}"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    # Docker network to run k6 in: only infra/test/load-test.test.sh needs it.
    --network) NETWORK="${2-}"; shift 2 ;;
    -*) die "unknown option $1" ;;
    *) [ -z "$TARGET" ] || die "one URL only"; TARGET="$1"; shift ;;
  esac
done

[ -n "$TARGET" ] || die "usage: load-test <url> [--rate N] [--duration 60s] [--paths /,/x] [--resolve <ip>] [--strict]"
[[ "$TARGET" =~ ^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]] ||
  die "the URL is scheme and host only (https://site.dev), got: $TARGET"
[[ "$RATE" =~ ^[1-9][0-9]{0,3}$ ]] && [ "$RATE" -le 2000 ] || die "--rate is 1–2000 per second"
[[ "$DURATION" =~ ^[1-9][0-9]{0,3}[sm]$ ]] || die "--duration is like 30s or 5m"
[[ "$PATHS" =~ ^/[A-Za-z0-9._~/-]*(,/[A-Za-z0-9._~/-]*)*$ ]] || die "--paths is like /,/api/health"
[ -z "$RESOLVE" ] || [[ "$RESOLVE" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$|^[0-9A-Fa-f:]*:[0-9A-Fa-f:]+$ ]] ||
  die "--resolve is an IP address"
[ -z "$NETWORK" ] || [[ "$NETWORK" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || die "--network is a Docker network name"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || die "Docker is not running."
export MSYS_NO_PATHCONV=1 # Git Bash would turn PATHS=/ into a Windows path

echo "== k6 $TARGET · $RATE req/s · $DURATION · paths $PATHS${RESOLVE:+ · resolve $RESOLVE}$([ "$STRICT" = 1 ] && echo " · strict")"
set +e
docker run --rm -i ${NETWORK:+--network "$NETWORK"} \
  -e TARGET="$TARGET" -e RATE="$RATE" -e DURATION="$DURATION" -e PATHS="$PATHS" \
  -e RESOLVE="$RESOLVE" -e STRICT="$STRICT" \
  "$K6_IMAGE" run --quiet - < "$HERE/../infra/load-test/site.js"
code=$?
set -e
case $code in
  0) echo "== PASS: p95 < 500 ms, p99 < 1 s, $([ "$STRICT" = 1 ] && echo "no failed request" || echo "errors < 1 %"), none dropped" ;;
  99) echo "== FAIL: a threshold was crossed (above, marked ✗)" >&2 ;;
  *) echo "== k6 exited $code" >&2 ;;
esac
exit $code
