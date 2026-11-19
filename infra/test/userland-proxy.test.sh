#!/usr/bin/env bash
# The switch server-ready.sh makes on a live VPS — "userland-proxy": false in daemon.json and a
# dockerd restart with live-restore — rehearsed in Docker-in-Docker with the VPS's Docker version.
# A container published on 127.0.0.1 before the switch must keep answering, from the host only
# (D016), with no docker-proxy left; one created after it too.
# Usage: bun run test:infra:userland-proxy   (or: bash infra/test/userland-proxy.test.sh)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
INFRA="$(cd "$HERE/.." && pwd)"
DIND_IMAGE="${DIND_IMAGE:-docker:29.8.1-dind}" # the VPS runs 29.8.1 (2026-11-19)

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
host() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
export MSYS_NO_PATHCONV=1

NET="kd-uproxy-$$"
DIND="kd-uproxy-dind-$$"
cleanup() { docker rm -f "$DIND" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create "$NET" >/dev/null

# dockerd is started by the script inside, not as PID 1, so it can be restarted like systemd does.
docker run -d --privileged --name "$DIND" --network "$NET" -v "$(host "$INFRA"):/infra:ro" \
  --entrypoint sleep "$DIND_IMAGE" infinity >/dev/null
docker exec "$DIND" sh /infra/test/userland-proxy-in-container.sh

# From another machine on the same network (the internet, for the VPS), the port stays closed.
DIND_IP="$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$DIND")"
if docker run --rm --network "$NET" busybox:1.37 wget -q -T 3 -O /dev/null "http://$DIND_IP:18080/" 2>/dev/null ||
   docker run --rm --network "$NET" busybox:1.37 wget -q -T 3 -O /dev/null "http://$DIND_IP:18081/" 2>/dev/null; then
  echo "FAIL a port published on 127.0.0.1 answers from another machine"; exit 1
fi
echo "PASS ports on 127.0.0.1 stay closed from another machine (D016)"
echo "ALL PASS"
