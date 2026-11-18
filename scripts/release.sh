#!/usr/bin/env bash
# Builds a kit-deploy release on this machine, inside Docker (Linux binaries, same bun as CI):
#   build/kit-deploy-<sha12>.tgz
#     VERSION                  the commit
#     bin/kit-agent            root daemon        (bun build --compile)
#     bin/kit-deploy           CLI
#     bin/kit-deploy-migrate   applies drizzle/
#     web/                     Next standalone (server.js, .next/static, public)
#     drizzle/                 migrations
#     infra/                   install.sh, update.sh, kit-agent.service, the preview sweep's
#                              .service + .timer, caddy/ (previews site + pages)
# Only committed code ships (`git archive HEAD`): a dirty tree is refused.
# Then: scripts/ship.sh build/kit-deploy-<sha12>.tgz   (needs César's OK: it changes the VPS)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BUN_IMAGE="${BUN_IMAGE:-oven/bun:1.4.4}"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY:-0}" != 1 ]; then
  echo "Uncommitted changes: commit first (a release is HEAD, nothing else)." >&2; exit 1
fi
SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:12}"
mkdir -p build
OUT="build/kit-deploy-$SHORT.tgz"
SRC="build/src-$SHORT.tar"
git archive --format=tar -o "$SRC" HEAD

host() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
export MSYS_NO_PATHCONV=1
docker run --rm -e SHA="$SHA" -e SHORT="$SHORT" -v "$(host "$ROOT/build"):/out" "$BUN_IMAGE" sh -euc '
  mkdir -p /src /rel/bin && cd /src && tar -xf "/out/src-$SHORT.tar"
  bun install --frozen-lockfile >/dev/null
  NEXT_TELEMETRY_DISABLED=1 NEXT_DEPLOYMENT_ID="$SHA" bun run build >/dev/null
  test -f .next/standalone/server.js || { echo "no standalone output" >&2; exit 1; }
  for b in agent/main.ts:kit-agent cli/main.ts:kit-deploy scripts/migrate.ts:kit-deploy-migrate; do
    bun build --compile --target=bun-linux-x64 "${b%%:*}" --outfile "/rel/bin/${b##*:}" >/dev/null
  done
  cp -r .next/standalone /rel/web
  mkdir -p /rel/web/.next /rel/web/public && cp -r .next/static /rel/web/.next/static
  [ -d public ] && cp -r public/. /rel/web/public/
  mkdir -p /rel/web/.next/cache
  cp -r drizzle /rel/drizzle
  mkdir -p /rel/infra && cp infra/install.sh infra/update.sh infra/kit-agent.service infra/kit-deploy-preview-sweep.service infra/kit-deploy-preview-sweep.timer infra/kit-deploy-metrics.service infra/kit-deploy-metrics.timer /rel/infra/
  cp -r infra/caddy /rel/infra/caddy
  echo "$SHA" > /rel/VERSION
  tar -C /rel -czf "/out/kit-deploy-$SHORT.tgz" .
'
rm -f "$SRC"
echo "$OUT"
