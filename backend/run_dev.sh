#!/usr/bin/env bash
# Run from repo root:  bash backend/run_dev.sh
# Or from here:        ./run_dev.sh
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "No backend/.venv with uvicorn. Run:" >&2
  echo "  cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
