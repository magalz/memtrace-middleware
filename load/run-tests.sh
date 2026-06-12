#!/usr/bin/env bash
# Shell test runner for k6 load tests
# Starts test server, runs k6 scripts, stops server, returns exit code
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SCRIPTS=("${@:-concurrent-dispatches degradation-scenarios}")

export MEMTRACE_TEST_MODE=1
export BASE_URL

if [ "$SKIP_BUILD" != "true" ]; then
  echo "Building middleware..." >&2
  pnpm build
fi

echo "Starting test server..." >&2
node dist/test-server.js &
SERVER_PID=$!
sleep 3

cleanup() {
  echo "Stopping test server..." >&2
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for script in "${SCRIPTS[@]}"; do
  echo "Running k6: $script..." >&2
  k6 run "load/$script.js"
  echo "k6 script '$script' passed!" >&2
done

echo "All load tests passed!" >&2
