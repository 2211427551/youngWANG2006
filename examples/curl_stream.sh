#!/usr/bin/env bash
set -euo pipefail

API_KEY="${API_KEY:-dev-key}"
PROMPT=${1:-"用三句话解释什么是反向代理。"}

curl -N -sS \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -X POST http://localhost:3000/chat/stream \
  -d "{\"prompt\": \"${PROMPT}\"}" \
  | awk '{print strftime("[%H:%M:%S]"), $0}'
