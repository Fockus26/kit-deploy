#!/bin/sh
# Runs p8-fail.mjs against each fake mode (failures are not cached by the panel).
cd /c/Users/Cesar/Documents/Work/kit-deploy-wt/wt1 || exit 1
killfake() {
  for p in $(netstat -ano | grep -E "127.0.0.1:4310\s.*LISTENING" | awk '{print $5}' | tr -d '\r' | sort -u); do
    taskkill //PID "$p" //T //F >/dev/null 2>&1
  done
}
run() {
  label=$1; shift
  killfake
  if [ "$1" != "none" ]; then
    node scripts/qa/github-fake.mjs --port 4310 "$@" > ".qa/fake-$label.log" 2>&1 &
    sleep 2
  fi
  node .qa/p8-fail.mjs http://localhost:4301 "$label"
}
for m in "$@"; do
  case $m in
    404) run fail404 --fail 404 ;;
    502) run fail502 --fail 502 ;;
    429) run fail429 --fail 429 ;;
    down) run down none ;;
    slow4500) run slow4500 --slow 4500 ;;
    slow5200) run slow5200 --slow 5200 ;;
    count0) run count0 --count 0 ;;
    count600) run count600 --count 600 ;;
    ok) run ok ;;
    slowmany) run slowmany --slow 4500 --count 600 ;;
  esac
done
