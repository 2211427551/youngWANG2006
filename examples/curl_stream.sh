#!/usr/bin/env bash
# 示例：调用 /chat/stream 获取 SSE 增量流
# 用法：./examples/curl_stream.sh "你的问题"
set -euo pipefail

API_KEY="${API_KEY:-dev-key}"
PROMPT=${1:-"用三句话解释什么是反向代理。"}

curl -N -sS \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -X POST http://localhost:3000/chat/stream \
  -d "{\"prompt\": \"${PROMPT}\"}" \
  | awk '{print strftime("[%H:%M:%S]"), $0}'
