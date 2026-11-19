#!/usr/bin/env bash
# Inside the test container (see server-ready.test.sh). Prints PASS/FAIL per check.
set -uo pipefail
D=db.test.fockus.dev
FAILS=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILS=$((FAILS + 1)); }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi; }
run() { SWAP_MB=64 bash /infra/server-ready.sh --test --db-domain "$D" --caddy-bin /caddy-build/caddy "$@"; }

echo "== Kit bootstrap.sh --test (Postgres + PgBouncer + kit-db)"
bash /kit/bootstrap.sh --test > /tmp/bootstrap.log 2>&1 || { tail -30 /tmp/bootstrap.log; echo "FAIL bootstrap"; exit 1; }

# What bootstrap.sh --domain leaves on the VPS: a certbot standalone cert and the PgBouncer hook.
mkdir -p /etc/letsencrypt/renewal /etc/letsencrypt/renewal-hooks/deploy
printf '[renewalparams]\nauthenticator = standalone\nserver = https://acme-v02.api.letsencrypt.org/directory\n' \
  > "/etc/letsencrypt/renewal/$D.conf"
printf '#!/bin/sh\ntouch /tmp/pgbouncer-hook-ran\n' > /etc/letsencrypt/renewal-hooks/deploy/kit-pgbouncer.sh
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/kit-pgbouncer.sh
install -m 755 /infra/test/fake-certbot.sh /usr/local/bin/certbot
apt-get install -y -qq netcat-openbsd python3 >/dev/null 2>&1

echo "== 1. Port 80 held by something else: stops before changing the certificate"
nc -lk 80 >/dev/null 2>&1 & NC=$!; sleep 1
if run > /tmp/run0.log 2>&1; then fail "refuses when :80 is taken"; else
  grep -q "Port 80 is held by" /tmp/run0.log && pass "refuses when :80 is taken" || { fail "refuses when :80 is taken"; tail -5 /tmp/run0.log; }
fi
kill $NC; wait $NC 2>/dev/null
check "certificate still standalone" grep -q '^authenticator = standalone' "/etc/letsencrypt/renewal/$D.conf"
# The trap itself: with Caddy on :80 a standalone renewal fails (what the script avoids).
caddy start --config /etc/caddy/Caddyfile >/dev/null 2>&1
if certbot renew --dry-run --cert-name "$D" -n 2>/dev/null; then fail "trap reproduced"; else pass "trap reproduced: standalone renew fails with Caddy on :80"; fi
caddy stop >/dev/null 2>&1

echo "== 2. Webroot rehearsal fails: certificate left on standalone, Caddy gives :80 back"
if FAKE_CERTBOT_FAIL_DRY_RUN=1 run > /tmp/run1.log 2>&1; then fail "aborts on failed rehearsal"; else pass "aborts on failed rehearsal"; fi
check "still standalone after the failed rehearsal" grep -q '^authenticator = standalone' "/etc/letsencrypt/renewal/$D.conf"
check "Caddy stopped after the failed rehearsal" bash -c '! pgrep -x caddy'
check "no reissue attempted" bash -c "! grep -q 'force-renewal' /tmp/certbot.log"

echo "== 3. First real run"
: > /tmp/certbot.log
if run > /tmp/run2.log 2>&1; then pass "first run exits 0"; else fail "first run exits 0"; tail -30 /tmp/run2.log; fi
check "rehearsal before the reissue" bash -c "grep -n . /tmp/certbot.log | grep -- '--dry-run' | head -1 | grep -q '^1:certbot certonly'"
check "reissued with --force-renewal by webroot" grep -q 'certonly --webroot -w /var/www/acme .*--force-renewal' /tmp/certbot.log
check "renewal config now webroot" grep -q '^authenticator = webroot' "/etc/letsencrypt/renewal/$D.conf"
check "PgBouncer deploy hook ran" test -f /tmp/pgbouncer-hook-ran
check "renew --dry-run passes with Caddy on :80" certbot renew --dry-run --cert-name "$D" -n
check "Caddy holds :80" bash -c "ss -Hltnp 'sport = :80' | grep -q caddy"
check "Caddy has dns.providers.cloudflare" bash -c "caddy list-modules | grep -qx dns.providers.cloudflare"
check "daemon.json max-size 10m" bash -c "jq -e '.\"log-opts\".\"max-size\" == \"10m\"' /etc/docker/daemon.json"
check "daemon.json max-file 3" bash -c "jq -e '.\"log-opts\".\"max-file\" == \"3\"' /etc/docker/daemon.json"
check "daemon.json live-restore" bash -c "jq -e '.\"live-restore\" == true' /etc/docker/daemon.json"
check "daemon.json userland-proxy off" bash -c "jq -e '.\"userland-proxy\" == false' /etc/docker/daemon.json"
check "dockerd accepts daemon.json" dockerd --validate --config-file /etc/docker/daemon.json
check "other host gets 404, not the challenge dir" bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: $D' http://127.0.0.1/)\" = 404 ]"
check "Caddy logs owned by caddy" bash -c "[ -z \"$(find /var/log/caddy ! -user caddy)\" ]"
check "JSON access log written" bash -c "tail -1 /var/log/caddy/access.log | jq -e '.request.host == \"$D\"'"
mkdir -p /srv/hello && echo hola > /srv/hello/index.html
printf 'http://hello.test {\n\timport kit_access_log\n\troot * /srv/hello\n\tfile_server\n}\n' > /etc/caddy/sites/hello.caddy
caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1
check "sites/*.caddy imported" bash -c "[ \"\$(curl -s -H 'Host: hello.test' http://127.0.0.1/)\" = hola ]"
rm /etc/caddy/sites/hello.caddy
check "kit_deploy database exists" bash -c "kit-db list | grep -q '^kit_deploy '"
check "/etc/kit-deploy is root 0700" bash -c "[ \"\$(stat -c '%U %a' /etc/kit-deploy)\" = 'root 700' ]"
check "master.key is root 0400, 32 bytes" bash -c "[ \"\$(stat -c '%U %a' /etc/kit-deploy/master.key)\" = 'root 400' ] && [ \"\$(base64 -d /etc/kit-deploy/master.key | wc -c)\" = 32 ]"
KEY_SHA=$(sha256sum /etc/kit-deploy/master.key)
check "master key not printed" bash -c "! grep -qF \"\$(cat /etc/kit-deploy/master.key)\" /tmp/run2.log"
check "swapfile in fstab" grep -q '^/swapfile none swap sw 0 0' /etc/fstab
check "Postgres OOM drop-in" grep -qx 'OOMScoreAdjust=-900' /etc/systemd/system/postgresql@.service.d/kit-oom.conf

echo "== 4. Re-run: idempotent"
: > /tmp/certbot.log; cp /etc/caddy/Caddyfile /tmp/Caddyfile.1
if run > /tmp/run3.log 2>&1; then pass "re-run exits 0"; else fail "re-run exits 0"; tail -30 /tmp/run3.log; fi
check "no reissue on re-run" bash -c "! grep -q 'certonly' /tmp/certbot.log"
check "master key unchanged" bash -c "[ \"\$(sha256sum /etc/kit-deploy/master.key)\" = '$KEY_SHA' ]"
check "kit_deploy not recreated" grep -q 'Already exists' /tmp/run3.log
check "Caddyfile unchanged" cmp -s /etc/caddy/Caddyfile /tmp/Caddyfile.1
check "daemon.json unchanged" grep -q 'Unchanged' /tmp/run3.log
check "fstab line once" bash -c "[ \$(grep -c '^/swapfile ' /etc/fstab) = 1 ]"

echo "== 5. daemon.json keeps what was there"
echo '{"data-root":"/var/lib/docker","log-opts":{"labels":"x"}}' > /etc/docker/daemon.json
run > /tmp/run4.log 2>&1 || { fail "run over an existing daemon.json"; tail -20 /tmp/run4.log; }
check "existing keys kept" bash -c "jq -e '.\"data-root\" == \"/var/lib/docker\" and .\"log-opts\".labels == \"x\" and .\"log-opts\".\"max-size\" == \"10m\"' /etc/docker/daemon.json"
check "backup of the old daemon.json" bash -c "ls /etc/docker/daemon.json.bak-* >/dev/null"

echo "== 6. Re-run once a site needs the Cloudflare token (the previews site, by DNS-01)"
printf '*.preview.test {\n\ttls {\n\t\tdns cloudflare {env.CLOUDFLARE_API_TOKEN}\n\t}\n\trespond ok\n}\n' > /etc/caddy/sites/dns01.caddy
rm -f /etc/caddy/cloudflare.env
if run > /tmp/run5.log 2>&1; then fail "without cloudflare.env the re-run is refused"; else pass "without cloudflare.env the re-run is refused"; fi
# Fake tokens: Caddy's Cloudflare module checks the shape only (40 characters pass, 34 do not).
FAKE_TOKEN=kdtestnotarealtoken0123456789abcdefghij
echo "CLOUDFLARE_API_TOKEN=$FAKE_TOKEN" > /etc/caddy/cloudflare.env
if run > /tmp/run6.log 2>&1; then pass "with cloudflare.env, validate gets the token and the re-run passes"; else fail "with cloudflare.env, validate gets the token and the re-run passes"; tail -5 /tmp/run6.log; fi
check "the token is never printed" bash -c "! grep -qF '$FAKE_TOKEN' /tmp/run6.log"
BAD_TOKEN=kdtest_not_a_real_token_0123456789
echo "CLOUDFLARE_API_TOKEN=$BAD_TOKEN" > /etc/caddy/cloudflare.env
if run > /tmp/run7.log 2>&1; then fail "a token Caddy rejects stops the re-run"; else pass "a token Caddy rejects stops the re-run"; fi
check "Caddy's error is shown with the rejected token masked" bash -c "grep -qF '<CLOUDFLARE_API_TOKEN>' /tmp/run7.log && ! grep -qF '$BAD_TOKEN' /tmp/run7.log"
rm -f /etc/caddy/sites/dns01.caddy /etc/caddy/cloudflare.env

echo
[ "$FAILS" = 0 ] && { echo "ALL PASS"; exit 0; }
echo "$FAILS FAILED"; exit 1
