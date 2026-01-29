#!/usr/bin/env bash
# Start an ephemeral Dolt SQL server and run bun test.
set -euo pipefail

PORT="${VDS_TEST_PORT:-3307}"
DIR=$(mktemp -d)
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null
  rm -rf "$DIR"
}
trap cleanup EXIT

# Create a dolt database named "vds" as a subdirectory
mkdir -p "$DIR/vds"
(cd "$DIR/vds" && dolt init --name "Test" --email "test@test.com") > /dev/null 2>&1

# Start sql-server with --data-dir so it discovers the "vds" database
dolt sql-server -H 127.0.0.1 -P "$PORT" -l warning --data-dir "$DIR" &
SERVER_PID=$!

# Wait for server
for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$PORT" 2>/dev/null && break
  sleep 0.3
done

export VDS_TEST_PORT="$PORT"
bun test "$@"
