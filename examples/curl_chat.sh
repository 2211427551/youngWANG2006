#!/usr/bin/env bash
# 示例：调用 /chat 获取完整回复
# 用法：./examples/curl_chat.sh "你的问题"
set -euo pipefail

API_KEY="${API_KEY:-dev-key}"
PROMPT=${1:-"你好，帮我写一首五言绝句。"}

if command -v jq >/dev/null 2>&1; then
  curl -sS \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -X POST http://localhost:3000/chat \
    -d "{\"prompt\": \"${PROMPT}\"}" | jq .
else
  echo "提示: 未检测到 jq。将输出原始 JSON。建议安装 jq 以获得更好的格式化显示。" >&2
  curl -sS \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -X POST http://localhost:3000/chat \
    -d "{\"prompt\": \"${PROMPT}\"}"
fi
