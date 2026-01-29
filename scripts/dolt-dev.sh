#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DOLT_DATA_DIR:-.dolt-data}"
PORT="${DOLT_PORT:-3306}"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

if [ ! -d ".dolt" ]; then
  echo "Initializing Dolt repo..."
  dolt init --name "Dev" --email "dev@dev.com"
  dolt sql -q "CREATE DATABASE IF NOT EXISTS vds"
fi

echo "Starting Dolt SQL server on port $PORT..."
exec dolt sql-server --port "$PORT"
