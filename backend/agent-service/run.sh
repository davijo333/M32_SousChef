# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# #!/usr/bin/env bash
# set -euo pipefail
# cd "$(dirname "$0")"
#
# if [[ ! -d .venv ]]; then
#   python3 -m venv .venv
#   .venv/bin/pip install -r requirements.txt
# fi
#
# if [[ ! -f .env ]]; then
#   if [[ -f ../../.env ]]; then
#     cp ../../.env .env
#   else
#     echo "Missing .env — run from repo root: cp .env.example .env"
#     exit 1
#   fi
# fi
#
# exec .venv/bin/python -m uvicorn main:app --reload --port 8000
