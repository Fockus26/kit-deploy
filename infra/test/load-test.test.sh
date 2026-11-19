#!/usr/bin/env bash
# Checks scripts/load-test.sh against a fake app in Docker: it passes a healthy site and fails
# one too slow, one with 5 % errors, and — only in --strict — one with 0.5 %. Under a minute.
# Usage: bun run test:infra:load   (or: bash infra/test/load-test.test.sh)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOAD="$HERE/../../scripts/load-test.sh"
NODE_IMAGE="node:22-alpine"

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
export MSYS_NO_PATHCONV=1

NET="kd-loadtest-$$"
APP="kd-loadtest-app-$$"
cleanup() { docker rm -f "$APP" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# / is fast, /slow takes 700 ms, /flaky fails 1 in 20 (5 %), /rare fails 1 in 200 (0.5 %).
# Counters, not random: the same run always gets the same failures.
APP_JS='
const http = require("node:http");
const n = { flaky: 0, rare: 0 };
http.createServer((req, res) => {
  const fail = (code) => { res.statusCode = code; res.end(); };
  if (req.url === "/slow") return setTimeout(() => res.end("ok"), 700);
  if (req.url === "/flaky" && ++n.flaky % 20 === 0) return fail(500);
  if (req.url === "/rare" && ++n.rare % 200 === 0) return fail(500);
  if (req.url === "/moved") { res.statusCode = 308; res.setHeader("location", "/"); return res.end(); }
  res.end("ok");
}).listen(3000);
'
docker network create "$NET" >/dev/null
docker run -d --name "$APP" --network "$NET" --network-alias app "$NODE_IMAGE" node -e "$APP_JS" >/dev/null
APP_IP="$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$APP")"

fails=0
expect() { # expect <exit code> <label> <load-test args…>
  local want="$1" label="$2"; shift 2
  local got=0
  bash "$LOAD" --network "$NET" --duration 5s --rate 100 "$@" >"$OUT" 2>&1 || got=$?
  if [ "$got" = "$want" ]; then echo "PASS $label (exit $got)"
  else echo "FAIL $label: exit $got, wanted $want"; sed 's/^/  | /' "$OUT"; fails=$((fails + 1)); fi
}
OUT="$(mktemp)"
trap 'rm -f "$OUT"; cleanup' EXIT

for _ in $(seq 1 30); do
  docker run --rm --network "$NET" "$NODE_IMAGE" node -e \
    'fetch("http://app:3000/").then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))' && break
  sleep 1
done

echo "== bad arguments never reach Docker"
expect 2 "no URL"
expect 2 "a URL with a path" http://app:3000/x
expect 2 "a URL with a space" "http://app :3000"
expect 2 "rate 0" http://app:3000 --rate 0
expect 2 "a path with a quote" http://app:3000 --paths "/a'b"
expect 2 "resolve to a name" http://app:3000 --resolve example.com
expect 2 "an unknown option" http://app:3000 --vus 10

echo "== thresholds"
expect 0 "a healthy site passes" http://app:3000 --paths /,/moved
expect 99 "p95 over 500 ms fails" http://app:3000 --paths /slow
expect 99 "5 % errors fail" http://app:3000 --paths /flaky
expect 0 "0.5 % errors pass the normal run" http://app:3000 --paths /rare
expect 99 "0.5 % errors fail --strict (a deploy allows none)" http://app:3000 --paths /rare --strict
expect 0 "--resolve sends a name DNS does not know to the given IP" http://site.invalid:3000 --resolve "$APP_IP"

[ "$fails" = 0 ] && echo "ALL PASS" || { echo "$fails FAILED"; exit 1; }
