#!/usr/bin/env bash
# Ships a release to the VPS over SSH and installs it. It changes the VPS: César's OK first.
#
#   bash scripts/ship.sh build/kit-deploy-<sha12>.tgz                 # update (install.sh ran)
#   bash scripts/ship.sh build/kit-deploy-<sha12>.tgz --install [--admin-user u] [--ghcr-login u]
#                                                    [--github-token] [--github-read-token]
#
# Env: KIT_VPS (ssh alias, default kit-vps). With --ghcr-login, --github-token or
# --github-read-token the token is read from this terminal's stdin by the remote install.sh: type
# or paste it there, never in a chat.
set -euo pipefail
TGZ="${1:-}"; shift || true
[ -f "$TGZ" ] || { echo "Usage: ship.sh <build/kit-deploy-<sha>.tgz> [--install [install.sh options]]" >&2; exit 1; }
VPS="${KIT_VPS:-kit-vps}"
NAME="$(basename "$TGZ")"
[[ "$NAME" =~ ^kit-deploy-[0-9a-f]{12}\.tgz$ ]] || { echo "Not a kit-deploy release: $NAME" >&2; exit 1; }

INSTALL=0
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --admin-user|--ghcr-login) EXTRA+=("$1" "$2"); shift 2 ;;
    --github-token|--github-read-token) EXTRA+=("$1"); shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[ "$INSTALL" = 1 ] || [ "${#EXTRA[@]}" = 0 ] || { echo "Those options need --install." >&2; exit 1; }

# A fresh private directory on the VPS, never a guessable /tmp path another user could plant.
DIR="$(ssh "$VPS" 'mktemp -d /tmp/kit-deploy-ship.XXXXXX')"
case "$DIR" in /tmp/kit-deploy-ship.*) ;; *) echo "mktemp on $VPS failed" >&2; exit 1 ;; esac
echo "== Copy $NAME to $VPS:$DIR"
scp -q "$TGZ" "$VPS:$DIR/$NAME"
ARGS="$(printf ' %q' "${EXTRA[@]}")"
[ "${#EXTRA[@]}" = 0 ] && ARGS=""
# The new release's scripts, not the installed ones: a fix to them applies to this run.
if [ "$INSTALL" = 1 ]; then
  echo "== install.sh"
  # shellcheck disable=SC2029  # expanded here on purpose; every piece is checked or %q-quoted
  ssh -t "$VPS" "set -e; cd $DIR; tar -xzf $NAME ./infra; sudo bash infra/install.sh $DIR/$NAME$ARGS; rm -rf $DIR"
else
  echo "== update.sh"
  # shellcheck disable=SC2029
  ssh "$VPS" "set -e; cd $DIR; tar -xzf $NAME ./infra; sudo bash infra/update.sh $DIR/$NAME; rm -rf $DIR"
fi
