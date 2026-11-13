#!/usr/bin/env bash
# Inside the test container (see install.test.sh). Prints PASS/FAIL per check.
set -uo pipefail
FAILS=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILS=$((FAILS + 1)); }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi; }
extract() { mkdir -p /tmp/rel && tar -xzf /release.tgz -C /tmp/rel ./infra; }

echo "== Kit bootstrap.sh --test (Postgres + PgBouncer + kit-db)"
bash /kit/bootstrap.sh --test > /tmp/bootstrap.log 2>&1 || { tail -30 /tmp/bootstrap.log; echo "FAIL bootstrap"; exit 1; }
apt-get install -y -qq curl iproute2 procps >/dev/null 2>&1

# What server-ready.sh leaves that install.sh needs: kit_deploy, /etc/kit-deploy 0700, the key.
kit-db create kit_deploy > /tmp/kitdb.log 2>&1
mkdir -p /etc/kit-deploy && chmod 700 /etc/kit-deploy
openssl rand -base64 32 > /etc/kit-deploy/master.key && chmod 400 /etc/kit-deploy/master.key
KEY_SHA=$(sha256sum /etc/kit-deploy/master.key)
# A stand-in caddy: update.sh only validates (and reloads through systemd, skipped in --test).
mkdir -p /etc/caddy/sites
printf '#!/bin/sh\necho "caddy $*" >> /tmp/caddy.log\nexit 0\n' > /usr/local/bin/caddy && chmod 755 /usr/local/bin/caddy
useradd -m cesar
useradd -m other
PW="$(kit-db url kit_deploy | sed 's#.*://kit_deploy:\([^@]*\)@.*#\1#')"
extract
# bootstrap --test points the URL at this machine's public IP, unreachable from inside the
# container. On the VPS it is db.fockus.dev (its own address); here PgBouncer on 127.0.0.1.
sed -i 's/^KIT_VPS_HOST=.*/KIT_VPS_HOST=127.0.0.1/' /etc/kit-vps/vps.env
# Its certificate is self-signed (sslmode=no-verify, which postgres.js 4 verifies anyway): TLS
# without verification here. The VPS has verify-full with db.fockus.dev's real certificate.
sed -i 's/^KIT_VPS_SSLMODE=.*/KIT_VPS_SSLMODE=require/' /etc/kit-vps/vps.env
echo "kit-db url (redacted): $(kit-db url kit_deploy | sed 's#:[^:@/]*@#:***@#')"

echo "== 1. First install"
if bash /tmp/rel/infra/install.sh /release.tgz --admin-user cesar --test > /tmp/install1.log 2>&1; then
  pass "install exits 0"; else fail "install exits 0"; tail -30 /tmp/install1.log; fi
SHA=$(tar -xzf /release.tgz -O ./VERSION)
check "group kit-deploy" getent group kit-deploy
check "system user kitdeploy, no shell" bash -c "getent passwd kitdeploy | grep -q nologin"
check "cesar in kit-deploy" bash -c "id -nG cesar | grep -qw kit-deploy"
check "other not in kit-deploy" bash -c "! id -nG other | grep -qw kit-deploy"
check "/etc/kit-deploy 0710 root:kit-deploy" bash -c "[ \"\$(stat -c '%U:%G %a' /etc/kit-deploy)\" = 'root:kit-deploy 710' ]"
check "master.key untouched, root 0400" bash -c "[ \"\$(sha256sum /etc/kit-deploy/master.key)\" = '$KEY_SHA' ] && [ \"\$(stat -c '%U %a' /etc/kit-deploy/master.key)\" = 'root 400' ]"
check "cli.env 0640 root:kit-deploy" bash -c "[ \"\$(stat -c '%U:%G %a' /etc/kit-deploy/cli.env)\" = 'root:kit-deploy 640' ]"
check "web.env 0600 root" bash -c "[ \"\$(stat -c '%U:%G %a' /etc/kit-deploy/web.env)\" = 'root:root 600' ]"
check "PgBouncer URL, like every project (:6432, sslmode)" grep -q '^DATABASE_URL=postgresql://kit_deploy:.*:6432/kit_deploy?sslmode=' /etc/kit-deploy/cli.env
check "password never printed" bash -c "! grep -qF '$PW' /tmp/install1.log"
check "migrations applied (4 tables)" bash -c "[ \"\$(su postgres -c \"psql -tA -d kit_deploy -c \\\"select count(*) from information_schema.tables where table_schema='public' and table_name in ('projects','deployments','deploy_tokens','domains')\\\"\")\" = 4 ]"
check "current -> releases/<sha>" bash -c "[ \"\$(readlink /opt/kit-deploy/current)\" = /opt/kit-deploy/releases/$SHA ]"
check "binaries installed" bash -c "[ -x /usr/local/sbin/kit-agent ] && [ -x /usr/local/bin/kit-deploy ]"
check "release root-owned, not writable by others" bash -c "[ -z \"\$(find /opt/kit-deploy/releases/$SHA ! -user root -o -perm -o+w ! -type l)\" ]"
check "/run/kit-deploy 0755 (the group can reach the socket)" bash -c "[ \"$(stat -c %a /run/kit-deploy)\" = 755 ]"
check "agent socket root:kit-deploy 0660" bash -c "[ \"\$(stat -c '%U:%G %a' /run/kit-deploy/agent.sock)\" = 'root:kit-deploy 660' ]"
check "cesar: kit-deploy version reaches the agent" bash -c "su cesar -c 'kit-deploy version' | grep -qx 'kit-agent 0.1.0'" || true
su cesar -c 'kit-deploy version' > /tmp/v.out 2>&1 || { echo "--- version as cesar:"; cat /tmp/v.out; echo "--- agent log:"; tail -20 /var/log/kit-agent.log; pgrep -a kit-agent || echo "agent not running"; }
check "cesar: the CLI reads cli.env and reaches the database" bash -c "su cesar -c 'kit-deploy rollback kd_hello' 2>&1 | grep -qx 'no project kd_hello'"
check "other: no agent" bash -c "su other -c 'kit-deploy version' 2>&1 | grep -q 'EACCES'"
check "other: cannot read cli.env" bash -c "! su other -c 'cat /etc/kit-deploy/cli.env' 2>/dev/null"
check "web: bridge, published on loopback only, no Docker socket" bash -c "grep -q -- '-p 127.0.0.1:3100:3000' /var/log/kit-deploy-web.cmd && ! grep -q -- '--network' /var/log/kit-deploy-web.cmd && ! grep -q docker.sock /var/log/kit-deploy-web.cmd"
check "web: db.fockus.dev through host-gateway" grep -q -- '--add-host db.fockus.dev:host-gateway' /var/log/kit-deploy-web.cmd
check "web: read-only, non-root, env from web.env" bash -c "grep -q -- '--read-only' /var/log/kit-deploy-web.cmd && grep -q -- \"--user \$(id -u kitdeploy):\" /var/log/kit-deploy-web.cmd && grep -q 'env-file /etc/kit-deploy/web.env' /var/log/kit-deploy-web.cmd"
check "standalone web in the release" test -f "/opt/kit-deploy/releases/$SHA/web/server.js"
check "no dashboard site while its DNS does not resolve" bash -c "[ ! -f /etc/caddy/sites/kit-deploy.caddy ] && grep -q 'does not resolve yet' /tmp/install1.log"

echo "== 2. Re-run: idempotent, nothing rewritten"
ENV_SHA=$(sha256sum /etc/kit-deploy/cli.env /etc/kit-deploy/web.env)
if bash /tmp/rel/infra/install.sh /release.tgz --test > /tmp/install2.log 2>&1; then
  pass "re-run exits 0"; else fail "re-run exits 0"; tail -20 /tmp/install2.log; fi
check "env files unchanged" bash -c "[ \"\$(sha256sum /etc/kit-deploy/cli.env /etc/kit-deploy/web.env)\" = '$ENV_SHA' ]"
check "says so" grep -q 'Already there' /tmp/install2.log
check "release not unpacked twice" grep -q 'already unpacked' /tmp/install2.log
check "agent back after the restart" bash -c "su cesar -c 'kit-deploy version' | grep -qx 'kit-agent 0.1.0'"

echo "== 3. update.sh heals /etc/kit-deploy after a server-ready re-run, and writes the dashboard site"
chmod 700 /etc/kit-deploy && chown root:root /etc/kit-deploy
echo "127.0.0.1 deploy.fockus.dev" >> /etc/hosts
: > /tmp/caddy.log
if bash /opt/kit-deploy/current/infra/update.sh /release.tgz --test > /tmp/update.log 2>&1; then
  pass "update exits 0"; else fail "update exits 0"; tail -20 /tmp/update.log; fi
check "/etc/kit-deploy back to 0710 root:kit-deploy" bash -c "[ \"\$(stat -c '%U:%G %a' /etc/kit-deploy)\" = 'root:kit-deploy 710' ]"
check "dashboard site proxies 127.0.0.1:3100" grep -qP '^\treverse_proxy 127.0.0.1:3100$' /etc/caddy/sites/kit-deploy.caddy
check "dashboard site imports the access log" grep -qP '^\timport kit_access_log$' /etc/caddy/sites/kit-deploy.caddy
check "caddy validate ran before" grep -q '^caddy validate' /tmp/caddy.log
check "migrations re-run: nothing new" grep -q 'migrations applied: 2' /tmp/update.log

echo "== 4. ghcr login reads the token from stdin and never shows it"
if echo 'ghp_test_token_never_shown' | bash /tmp/rel/infra/install.sh /release.tgz --ghcr-login fockus26 --test > /tmp/install3.log 2>&1; then
  pass "install --ghcr-login exits 0"; else fail "install --ghcr-login exits 0"; tail -10 /tmp/install3.log; fi
check "token read" grep -q 'token read (26 chars)' /tmp/install3.log
check "token never printed" bash -c "! grep -q ghp_test_token_never_shown /tmp/install3.log"

echo "== 5. The commit-status token: stdin, root 0600, never shown, given to the web"
FAKE_GH='github_pat_TEST_ONLY_never_shown_0000'
if echo "$FAKE_GH" | bash /tmp/rel/infra/install.sh /release.tgz --github-token --test > /tmp/install4.log 2>&1; then
  pass "install --github-token exits 0"; else fail "install --github-token exits 0"; tail -10 /tmp/install4.log; fi
check "github.env 0600 root" bash -c "[ \"\$(stat -c '%U:%G %a' /etc/kit-deploy/github.env)\" = 'root:root 600' ]"
check "github.env has the token under GITHUB_STATUS_TOKEN" grep -qx "GITHUB_STATUS_TOKEN=$FAKE_GH" /etc/kit-deploy/github.env
check "token never printed" bash -c "! grep -qF '$FAKE_GH' /tmp/install4.log"
check "cesar (kit-deploy group) cannot read it" bash -c "! su cesar -c 'cat /etc/kit-deploy/github.env' 2>/dev/null"
check "web gets it as a second env-file" grep -q 'env-file /etc/kit-deploy/web.env --env-file /etc/kit-deploy/github.env' /var/log/kit-deploy-web.cmd
check "token not in the web command" bash -c "! grep -qF '$FAKE_GH' /var/log/kit-deploy-web.cmd"
GH_SHA=$(sha256sum /etc/kit-deploy/github.env)
check "a value that is not a token is refused" bash -c "! echo 'oops' | bash /tmp/rel/infra/install.sh /release.tgz --github-token --test"
check "odd characters are refused" bash -c "! echo 'ghp_a;rm -rf' | bash /tmp/rel/infra/install.sh /release.tgz --github-token --test"
check "a refused value leaves the old token" bash -c "[ \"\$(sha256sum /etc/kit-deploy/github.env)\" = '$GH_SHA' ]"

echo "== 6. Refusals"
check "update without install refuses" bash -c "mv /etc/kit-deploy/cli.env /tmp/cli.env.bak; ! bash /tmp/rel/infra/update.sh /release.tgz --test; r=\$?; mv /tmp/cli.env.bak /etc/kit-deploy/cli.env; exit \$r"
check "a bad --admin-user is refused" bash -c "! bash /tmp/rel/infra/install.sh /release.tgz --admin-user 'a;b' --test"
check "not root is refused" bash -c "! su other -c 'bash /tmp/rel/infra/update.sh /release.tgz --test'"

echo
[ "$FAILS" = 0 ] && { echo "ALL PASS"; exit 0; }
echo "$FAILS FAILED"; exit 1
