#!/usr/bin/env bash
# Runs infra/install.sh --test (and update.sh) in a throwaway Ubuntu container, after the kit's
# bootstrap.sh --test (Postgres 17 + PgBouncer + kit-db), against a release from scripts/release.sh.
# Usage: bash infra/test/install.test.sh [build/kit-deploy-<sha12>.tgz]   (builds one if omitted)
# Env:   KIT_VPS_DIR  the kit's reference/vps folder (default ~/.claude/kit-reference/vps)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
KIT_VPS_DIR="${KIT_VPS_DIR:-$HOME/.claude/kit-reference/vps}"
IMAGE="${IMAGE:-ubuntu:24.04}"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
[ -f "$KIT_VPS_DIR/bootstrap.sh" ] || { echo "No kit bootstrap.sh in $KIT_VPS_DIR (set KIT_VPS_DIR)." >&2; exit 2; }
TGZ="${1:-}"
[ -n "$TGZ" ] || TGZ="$(bash "$ROOT/scripts/release.sh" | tail -1)"
case "$TGZ" in /*|[A-Za-z]:*) ;; *) TGZ="$ROOT/$TGZ" ;; esac
[ -f "$TGZ" ] || { echo "No release $TGZ" >&2; exit 2; }

host() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
export MSYS_NO_PATHCONV=1
docker run --rm \
  -v "$(host "$KIT_VPS_DIR"):/kit:ro" -v "$(host "$HERE"):/t:ro" \
  -v "$(host "$TGZ"):/release.tgz:ro" \
  "$IMAGE" bash /t/install-in-container.sh
