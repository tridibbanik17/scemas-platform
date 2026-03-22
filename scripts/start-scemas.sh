#!/bin/echo This script should be run as: source
##===----------------------------------------------------------------------===##
# source scripts/start-scemas.sh
#
# sets up shell aliases and functions for scemas-platform development.
# auto-detects nix (pg_start/pg_stop) vs docker-compose for postgres.
# runs first-time setup (cp .env, bun install) automatically, tracked via .derived
#
# functions:
#   scemas-engine   start rust engine on :3001 with hot reload when watchexec is available
#   scemas-dash     start next.js dashboard on :3000
#   scemas-dev      start everything (db + engine + dashboard)
#   scemas-seed     seed sample sensor data
#   scemas-webhook  start webhook echo server for testing alert dispatch
#   scemas-check    run all lints (cargo fmt + clippy + tsc)
#   scemas-nuke     stop everything and clean up
##===----------------------------------------------------------------------===##

if [ -n "$BASH_VERSION" ]; then
  shopt -s expand_aliases
fi

if [ -z "$_START_SCEMAS_INCLUDED" ]; then
  export _START_SCEMAS_INCLUDED=yes
  export PS1="[scemas] $PS1"
fi

# resolve project root from script location
if [ -n "$ZSH_VERSION" ]; then
  # shellcheck disable=SC2296
  _SCEMAS_SCRIPT=${(%):-%N}
elif [ -n "$BASH_VERSION" ]; then
  _SCEMAS_SCRIPT=${BASH_SOURCE[0]}
fi
SCEMAS_ROOT=$(cd "$(dirname "$_SCEMAS_SCRIPT")/.." && pwd)
export SCEMAS_ROOT

# first-time setup, idempotent via .derived sentinel
if [ ! -f "$SCEMAS_ROOT/.derived" ]; then
  echo "[scemas] first-time setup"
  if [ ! -f "$SCEMAS_ROOT/.env" ]; then
    cp "$SCEMAS_ROOT/.env.example" "$SCEMAS_ROOT/.env"
    echo "[scemas] created .env from .env.example"
  fi
  (cd "$SCEMAS_ROOT" && bun install)
  touch "$SCEMAS_ROOT/.derived"
  echo "[scemas] first-time setup complete"
fi

# load .env
if [ -f "$SCEMAS_ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$SCEMAS_ROOT/.env"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgres://scemas:scemas@localhost:5432/scemas}"

# detect whether we're in a nix shell (pg_start available) or need docker
_scemas_has_nix_pg() { command -v pg_start >/dev/null 2>&1; }
_scemas_has_docker() { command -v docker >/dev/null 2>&1; }
_scemas_has_watchexec() { command -v watchexec >/dev/null 2>&1; }

_scemas_engine_cmd() {
  if _scemas_has_watchexec; then
    watchexec \
      --restart \
      --watch crates \
      --watch data \
      --watch Cargo.toml \
      --watch Cargo.lock \
      --exts rs,toml,json,lock \
      -- cargo run -p scemas-server
  else
    cargo run -p scemas-server
  fi
}

_scemas_start_db() {
  if _scemas_has_nix_pg; then
    echo "[scemas] starting postgres via nix"
    pg_init 2>/dev/null
    pg_start
  elif _scemas_has_docker; then
    echo "[scemas] starting postgres via docker-compose"
    docker compose -f "$SCEMAS_ROOT/docker-compose.yml" up -d
  else
    echo "[scemas] error: no postgres available. use nix develop or install docker" >&2
    return 1
  fi
}

_scemas_stop_db() {
  if _scemas_has_nix_pg; then
    pg_stop 2>/dev/null
  fi
  if _scemas_has_docker; then
    docker compose -f "$SCEMAS_ROOT/docker-compose.yml" down 2>/dev/null
  fi
}

scemas-engine() {
  (cd "$SCEMAS_ROOT" && _scemas_engine_cmd)
}

scemas-dash() {
  (cd "$SCEMAS_ROOT" && bun --filter @scemas/dashboard dev)
}

scemas-dev() {
  _scemas_start_db
  echo "[scemas] waiting for postgres..."
  sleep 2
  (cd "$SCEMAS_ROOT" && bun db:push)
  echo "[scemas] starting rust engine + dashboard"
  echo "[scemas] engine on :3001, dashboard on :3000 (ctrl+c to stop all)"

  cleanup() {
    echo ""
    echo "[scemas] shutting down..."
    kill $ENGINE_PID $DASH_PID 2>/dev/null
    wait $ENGINE_PID $DASH_PID 2>/dev/null
    echo "[scemas] stopped"
  }
  trap cleanup INT TERM

  cd "$SCEMAS_ROOT"
  _scemas_engine_cmd &
  ENGINE_PID=$!
  bun --filter @scemas/dashboard dev &
  DASH_PID=$!

  wait $ENGINE_PID $DASH_PID
}

scemas-seed() {
  (cd "$SCEMAS_ROOT" && bun run scripts/seed.ts "$@")
}

scemas-webhook() {
  (cd "$SCEMAS_ROOT" && bun run scripts/webhook-echo.ts "$@")
}

scemas-check() {
  echo "[scemas] cargo fmt"
  (cd "$SCEMAS_ROOT" && cargo fmt)
  echo "[scemas] cargo clippy"
  (cd "$SCEMAS_ROOT" && cargo clippy --all --benches --tests --examples --all-features)
  echo "[scemas] typecheck"
  (cd "$SCEMAS_ROOT" && bun run typecheck)
}

scemas-nuke() {
  echo "[scemas] stopping everything"
  _scemas_stop_db
  # kill backgrounded engine/dashboard if running
  pkill -f "scemas-server" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  echo "[scemas] done"
}

echo "[scemas] ready. try: scemas-dev, scemas-check, scemas-seed"
