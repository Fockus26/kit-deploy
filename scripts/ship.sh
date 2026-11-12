#!/usr/bin/env bash
# Ships a release to the VPS over SSH and installs it. It changes the VPS: César's OK first.
#
#   bash scripts/ship.sh build/kit-deploy-<sha12>.tgz                 # update (install.sh ran)
#   bash scripts/ship.sh build/kit-deploy-<sha12>.tgz --install [--admin-user u] [--ghcr-login u]
#
# Env: KIT_VPS (ssh alias, default kit-vps). With --ghcr-login the token is read from this
# terminal's stdin by the remote install.sh: type or paste it there, never in a chat.
set -euo pipefail
TGZ="${1:-}"; shift || true
[ -f "$TGZ" ] || { echo "Usage: ship.sh <build/kit-deploy-<sha>.tgz> [--install [install.sh options]]" >&2; exit 1; }
VPS="${KIT_VPS:-kit-vps}"
NAME="$(basename "$TGZ")"
case "$NAME" in kit-deploy-[0-9a-f]*.tgz) ;; *) echo "Not a kit-deploy release: $NAME" >&2; exit 1 ;; esac

INSTALL=0
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --admin-user|--ghcr-login) EXTRA+=("$1" "$2"); shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo "== Copy $NAME to $VPS"
scp -q "$TGZ" "$VPS:/tmp/$NAME"
if [ "$INSTALL" = 1 ]; then
  echo "== install.sh"
  # shellcheck disable=SC2029  # the arguments are checked above and by install.sh
  ssh -t "$VPS" "set -e; d=\$(mktemp -d); tar -xzf /tmp/$NAME -C \$d ./infra/install.sh; sudo bash \$d/infra/install.sh /tmp/$NAME ${EXTRA[*]:-}; rm -rf \$d /tmp/$NAME"
else
  echo "== update.sh"
  # The new release's update.sh, not the installed one: a fix to it applies to this update.
  ssh "$VPS" "set -e; d=\$(mktemp -d); tar -xzf /tmp/$NAME -C \$d ./infra/update.sh; sudo bash \$d/infra/update.sh /tmp/$NAME; rm -rf \$d /tmp/$NAME"
fi
