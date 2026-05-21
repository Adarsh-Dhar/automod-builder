#!/usr/bin/env bash
set -euo pipefail

PORT=5678
# On macOS/Linux: find PID listening on port
PIDS=$(lsof -ti tcp:${PORT} || true)
if [ -n "${PIDS}" ]; then
  echo "Killing processes on port ${PORT}: ${PIDS}"
  kill -9 ${PIDS} || true
  sleep 0.3
fi

# Run devvit playtest (forward all args)
if [ "$#" -gt 0 ]; then
  npx devvit playtest "$@"
else
  npx devvit playtest
fi
