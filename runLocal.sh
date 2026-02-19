#!/usr/bin/env bash



sudo kill -9 $(sudo lsof -t -i:3010)


set -euo pipefail

pids=$(lsof -ti :3010 || true)
if [ -n "$pids" ]; then
  kill $pids
  # Give the OS a moment to release the port
  sleep 0.5
fi

npm run dev
