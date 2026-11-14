#!/bin/sh
# Inside the test container (see previews.test.sh). Prints PASS/FAIL per check.
set -u
FAILS=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILS=$((FAILS + 1)); }
check() { what="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi; }
CADDY=/caddy-build/caddy
H=kd-hello-pr-7.preview.fockus.dev

# The VPS layout: the release's pages under current/, the base Caddyfile's snippet, sites/.
mkdir -p /opt/kit-deploy/current/infra /etc/caddy/sites /etc/caddy/previews
cp -r /infra/caddy /opt/kit-deploy/current/infra/caddy
cp /infra/caddy/kit-previews.caddy /etc/caddy/sites/kit-previews.caddy
cat > /etc/caddy/Caddyfile <<'EOF'
{
	admin localhost:2019
}
(kit_access_log) {
	log {
		output discard
	}
}
import sites/*.caddy
EOF

echo "== 1. Validates as shipped (DNS-01 through Cloudflare)"
TOKEN=cf_TEST_ONLY_0123456789abcdefghijklmnopqrstu
check "validate with no preview yet (empty import)" env CLOUDFLARE_API_TOKEN=$TOKEN $CADDY validate --config /etc/caddy/Caddyfile
check "refused without the token (it must come from cloudflare.env)" sh -c "! $CADDY validate --config /etc/caddy/Caddyfile"
$CADDY adapt --config /etc/caddy/Caddyfile > /tmp/adapted.json 2>/dev/null
check "one automation policy for *.preview.fockus.dev, by the DNS challenge" sh -c "grep -q '\"subjects\":\[\"\*.preview.fockus.dev\"\]' /tmp/adapted.json && grep -q '\"challenges\":{\"dns\":{\"provider\":{\"api_token\":\"{env.CLOUDFLARE_API_TOKEN}\",\"name\":\"cloudflare\"}' /tmp/adapted.json"
check "the token is read at runtime, never written into the config" sh -c "! grep -q $TOKEN /tmp/adapted.json"
check "caddy fmt leaves it as it is" sh -c "$CADDY fmt /etc/caddy/sites/kit-previews.caddy | diff -q - /etc/caddy/sites/kit-previews.caddy"

echo "== 2. Serves (tls internal in place of DNS-01)"
# One preview, the shape kit-agent writes: a host matcher and its handle, which only imports the
# kit_preview gate (D013). Its app answers on a loopback port and tries to undo noindex.
cat > /etc/caddy/previews/kd_hello-pr-7.caddy <<EOF
@kd_hello-pr-7 host $H
handle @kd_hello-pr-7 {
	import kit_preview 127.0.0.1:29007
}
EOF
cat > /etc/caddy/sites/app.caddy <<'EOF'
http://:29007 {
	bind 127.0.0.1
	header X-Robots-Tag "all"
	respond "hola desde el preview {method} {uri}" 200
}
EOF
# A stand-in for the dashboard's web on :3100 with lib/preview/access.ts's contract: preview-auth
# lets a `kd_preview=good` cookie through and sends anything else to /preview-access; the exchange
# echoes what reached it (path after the rewrite, method, Host, the posted body).
cat > /etc/caddy/sites/web.caddy <<'EOF'
http://:3100 {
	bind 127.0.0.1
	handle /api/v1/preview-auth {
		@ok header Cookie *kd_preview=good*
		route {
			respond @ok 204
			header Location "https://deploy.fockus.dev/preview-access?to=https://{header.X-Forwarded-Host}{header.X-Forwarded-Uri}"
			respond "auth method={method} fwd-method={header.X-Forwarded-Method}" 302
		}
	}
	handle /api/v1/preview-exchange {
		respond "exchange path={path} method={method} host={host} body={http.request.body}" 200
	}
	respond "web: unexpected {path}" 500
}
EOF
sed -i 's#dns cloudflare {env.CLOUDFLARE_API_TOKEN}#issuer internal#' /etc/caddy/sites/kit-previews.caddy
$CADDY start --config /etc/caddy/Caddyfile > /tmp/caddy.out 2>&1 || { cat /tmp/caddy.out; exit 1; }
for _ in $(seq 1 120); do
  curl -sk -o /dev/null --resolve "$H:443:127.0.0.1" "https://$H/" && break; sleep 0.5
done
get() { curl -sk -D /tmp/h -o /tmp/b --resolve "$1:443:127.0.0.1" "https://$1/$2"; }

# Signed in (a valid kd_preview): the app itself. Section 3 checks the gate.
curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -H 'Cookie: kd_preview=good' "https://$H/"
check "a preview answers with its app" grep -q 'hola desde el preview' /tmp/b
check "... with X-Robots-Tag noindex, over the app's own header" sh -c "grep -i '^x-robots-tag:' /tmp/h | tr -d '\r' | grep -qix 'x-robots-tag: noindex, nofollow' && [ \$(grep -ci '^x-robots-tag:' /tmp/h) = 1 ]"

get nope-pr-1.preview.fockus.dev "some/path?x=1"
check "an unknown preview host gets a real 404" sh -c "head -1 /tmp/h | grep -q ' 404'"
check "... the Spanish page" grep -q 'Este preview no existe' /tmp/b
check "... with noindex, not cached" sh -c "grep -qi '^x-robots-tag: noindex, nofollow' /tmp/h && grep -qi '^cache-control: no-store' /tmp/h"
check "... as HTML" sh -c "grep -qi '^content-type: text/html' /tmp/h"
check "the page loads nothing from outside" sh -c "! grep -Eq '(src|href)=\"https?://[^\"]*\\.(css|js|woff2?)' /tmp/b"

curl -s -D /tmp/h80 -o /dev/null --resolve "$H:80:127.0.0.1" "http://$H/x"
check "http redirects to https" sh -c "head -1 /tmp/h80 | grep -Eq ' 30[18]' && grep -qi '^location: https://$H/x' /tmp/h80"

echo "== 3. The kit_preview gate (D013): exchange, forward_auth, then the app"
get "$H" "pricing?plan=pro"
check "no cookie: 302 to the dashboard's /preview-access" sh -c "head -1 /tmp/h | grep -q ' 302'"
check "... with the URL the visitor wanted" sh -c "grep -i '^location:' /tmp/h | tr -d '\r' | grep -qx 'location: https://deploy.fockus.dev/preview-access?to=https://$H/pricing?plan=pro'"
check "... and the app never answered" sh -c "! grep -q 'hola desde el preview' /tmp/b"
check "... noindex on the redirect too" sh -c "grep -qi '^x-robots-tag: noindex, nofollow' /tmp/h"
curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -X POST -d 'x=1' "https://$H/form"
check "forward_auth asks with GET and tells the original method" grep -q 'auth method=GET fwd-method=POST' /tmp/b

curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -H 'Cookie: a=1; kd_preview=good' "https://$H/pricing?plan=pro"
check "valid cookie: the app answers the original request" grep -qF 'hola desde el preview GET /pricing?plan=pro' /tmp/b
rm -f /tmp/h /tmp/b
curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -H 'Cookie: kd_preview=forged' "https://$H/"
check "a forged cookie is refused like none" sh -c "head -1 /tmp/h | grep -q ' 302'"
check "... and the app never answered it" sh -c "! grep -q 'hola desde el preview' /tmp/b"

curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -X POST -d "t=kdg_grant" "https://$H/__kit-deploy/exchange"
check "the exchange reaches the web, rewritten, with the client's Host and the body" grep -q "exchange path=/api/v1/preview-exchange method=POST host=$H body=t=kdg_grant" /tmp/b
check "... never the app" sh -c "! grep -q 'hola desde el preview' /tmp/b"
curl -sk -D /tmp/h -o /tmp/b --resolve "$H:443:127.0.0.1" -H 'Cookie: kd_preview=good' "https://$H/__kit-deploy/exchange/x"
check "only that exact path is the exchange (a subpath goes to the app, behind the gate)" grep -q 'hola desde el preview GET /__kit-deploy/exchange/x' /tmp/b

check "a second-level name is not a preview (*.preview matches one label)" sh -c "! curl -sk -o /dev/null --resolve a.$H:443:127.0.0.1 https://a.$H/"
$CADDY stop >/dev/null 2>&1 || true

echo
[ "$FAILS" = 0 ] && { echo "ALL PASS"; exit 0; }
echo "$FAILS FAILED"; exit 1
