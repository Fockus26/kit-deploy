#!/usr/bin/env bash
# Stand-in for certbot inside the test container (Let's Encrypt cannot reach it). It does what
# matters for server-ready.sh: an HTTP-01 check against whatever answers :80 for the domain,
# the renewal config rewritten on a real `certonly --webroot`, the deploy hooks run on issue,
# and `renew` with a standalone config failing while something else holds :80 (the trap).
# Every call is logged to /tmp/certbot.log. FAKE_CERTBOT_FAIL_DRY_RUN=1 makes rehearsals fail.
set -euo pipefail
echo "certbot $*" >> /tmp/certbot.log

sub="$1"; shift
webroot=""; domain=""; name=""; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    -w|--webroot-path) webroot="$2"; shift 2 ;;
    -d) domain="$2"; shift 2 ;;
    --cert-name) name="$2"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    *) shift ;;
  esac
done
name="${name:-$domain}"
conf="/etc/letsencrypt/renewal/$name.conf"

http01() { # http01 <webroot>: the CA asks http://<name>/.well-known/acme-challenge/<token>
  local tok; tok="tok$RANDOM$RANDOM"
  mkdir -p "$1/.well-known/acme-challenge"
  echo "$tok" > "$1/.well-known/acme-challenge/$tok"
  local got; got=$(curl -fsS --max-time 5 -H "Host: $name" "http://127.0.0.1/.well-known/acme-challenge/$tok" || true)
  rm -f "$1/.well-known/acme-challenge/$tok"
  [ "$got" = "$tok" ] || { echo "fake-certbot: HTTP-01 for $name failed" >&2; return 1; }
}

case "$sub" in
  certonly)
    [ "$dry" = 1 ] && [ "${FAKE_CERTBOT_FAIL_DRY_RUN:-0}" = 1 ] && { echo "fake-certbot: forced failure" >&2; exit 1; }
    http01 "$webroot"
    if [ "$dry" = 0 ]; then
      sed -i 's/^authenticator = .*/authenticator = webroot/' "$conf"
      grep -q '^webroot_path' "$conf" || printf 'webroot_path = %s,\n[[webroot_map]]\n%s = %s\n' "$webroot" "$name" "$webroot" >> "$conf"
      for h in /etc/letsencrypt/renewal-hooks/deploy/*; do [ -x "$h" ] && "$h"; done
    fi ;;
  renew)
    auth=$(sed -n 's/^authenticator = //p' "$conf")
    if [ "$auth" = standalone ]; then
      ss -Hltn 'sport = :80' | grep -q . && { echo "fake-certbot: standalone cannot bind :80" >&2; exit 1; }
    else
      http01 "$(sed -n 's/^webroot_path = \([^,]*\),*/\1/p' "$conf")"
    fi ;;
  *) echo "fake-certbot: $sub not simulated" >&2; exit 1 ;;
esac
