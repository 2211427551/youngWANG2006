#!/usr/bin/env bash
set -euo pipefail

API_KEY="${API_KEY:-dev-key}"
PROMPT=${1:-"你好，帮我写一首五言绝句。"}

curl -sS \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -X POST http://localhost:3000/chat \
  -d "{\"prompt\": \"${PROMPT}\"}" | jq .
