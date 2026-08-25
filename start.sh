#!/usr/bin/env bash
# commit-grapher — one-command setup & run.
#   ./start.sh          build the frontend once, then serve everything on http://localhost:8000
#   ./start.sh dev      run backend (:8000) + Vite hot-reload frontend (:5173) together
# ponytail: plain bash orchestration; swap for a Makefile/justfile only if steps multiply.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
PY="${PYTHON:-python3}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' not found — please install it first."; exit 1; }; }
need "$PY"; need node; need npm

# 1) Python venv + backend (idempotent: only create/install when missing).
if [ ! -d .venv ]; then
  echo "▸ Creating virtualenv (.venv)…"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if ! python -c "import app.main" >/dev/null 2>&1; then
  echo "▸ Installing backend (pip install -e backend)…"
  pip install -q --upgrade pip
  pip install -q -e backend
fi

# 2) Frontend deps (idempotent).
if [ ! -d frontend/node_modules ]; then
  echo "▸ Installing frontend deps (npm install)…"
  (cd frontend && npm install --silent)
fi

# dev mode: backend + Vite together, Vite proxies /api to :8000.
if [ "${1:-}" = "dev" ]; then
  echo "▸ Dev mode — backend on :$PORT, frontend on :5173"
  trap 'kill 0' EXIT
  uvicorn app.main:app --app-dir backend --reload --port "$PORT" &
  (cd frontend && npm run dev)
  exit 0
fi

# default: build the SPA once, let the backend serve it on a single port.
echo "▸ Building frontend (npm run build)…"
(cd frontend && npm run build --silent)
echo "▸ Ready → http://localhost:$PORT"
exec uvicorn app.main:app --app-dir backend --port "$PORT"
