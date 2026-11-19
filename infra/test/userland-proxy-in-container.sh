#!/bin/sh
# Runs inside docker:dind for userland-proxy.test.sh. The daemon.json merge is server-ready.sh's
# own jq line, extracted, so the test checks the bytes the VPS gets.
set -eu
FAILS=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }
check() { label="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi; }

apk add -q --no-cache jq bash >/dev/null
DJ=/etc/docker/daemon.json
mkdir -p /etc/docker
# What the VPS has today (2026-11-19).
echo '{"live-restore":true,"log-driver":"json-file","log-opts":{"max-file":"3","max-size":"10m"}}' > "$DJ"

start() { dind dockerd > /var/log/dockerd.log 2>&1 & i=0; until docker info >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 60 ] || { tail -20 /var/log/dockerd.log; exit 1; }; sleep 1; done; }
stop() { kill "$(cat /var/run/docker.pid)"; while [ -e /var/run/docker.pid ]; do sleep 1; done; }
answers() { wget -q -T 3 -O /dev/null "http://127.0.0.1:$1/"; }
proxies() { ps -o args | grep -c "^/usr/[a-z/]*docker-proxy "; }

echo "== before: userland-proxy on (Docker's default)"
start
docker pull -q busybox:1.37 >/dev/null
docker run -d --name old -p 127.0.0.1:18080:80 busybox:1.37 sh -c "mkdir -p /www && echo ok > /www/index.html && exec httpd -f -p 80 -h /www" >/dev/null
sleep 1
check "old container answers on 127.0.0.1:18080" answers 18080
[ "$(proxies)" -ge 1 ] && pass "docker-proxy runs for it" || fail "docker-proxy runs for it"

echo "== the switch: server-ready.sh's merge, then a restart with live-restore"
MERGE="$(sed -n "s/^NEW=\$(printf '%s' \"\$OLD\" | jq -S '\(.*\)')\$/\1/p" /infra/server-ready.sh)"
[ -n "$MERGE" ] || { echo "FAIL could not extract the jq merge from server-ready.sh"; exit 1; }
jq -S "$MERGE" "$DJ" > /tmp/dj && mv /tmp/dj "$DJ"
check "daemon.json has userland-proxy false" jq -e '."userland-proxy" == false' "$DJ"
check "daemon.json keeps live-restore" jq -e '."live-restore" == true' "$DJ"
check "dockerd accepts daemon.json" dockerd --validate --config-file "$DJ"
BEFORE="$(docker ps -q)"
stop
start
check "old container kept running across the restart" sh -c "[ \"\$(docker ps -q)\" = '$BEFORE' ]"
check "old container still answers on 127.0.0.1:18080" answers 18080
echo "info: docker-proxy processes right after the switch: $(proxies) (live-restore moves running containers to NAT too)"

echo "== after"
docker run -d --name new -p 127.0.0.1:18081:80 busybox:1.37 sh -c "mkdir -p /www && echo ok > /www/index.html && exec httpd -f -p 80 -h /www" >/dev/null
sleep 1
check "new container answers on 127.0.0.1:18081" answers 18081
# Since Docker 28, dockerd holds the port itself to reserve it; traffic goes by iptables NAT.
check "the new port is held by dockerd, not a docker-proxy" sh -c "netstat -ltnp | grep ':18081 ' | grep -q dockerd"
docker restart old >/dev/null
sleep 1
check "old container answers after its own restart" answers 18080
[ "$(proxies)" = 0 ] && pass "no docker-proxy left" || fail "no docker-proxy left ($(proxies) running)"

[ "$FAILS" = 0 ] || { echo "$FAILS FAILED"; tail -20 /var/log/dockerd.log; exit 1; }
