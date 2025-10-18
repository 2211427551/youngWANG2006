# 基于 Playwright 的 LLM 网页转 API 代理（MVP）

这是一个可部署的最小可用服务，通过 Playwright 驱动带有对话框的 LLM 网页，并将其以简单的 HTTP API 暴露出来。

功能特性：
- Node.js + Express + Playwright（Chromium）
- launchPersistentContext + userDataDir 持久化登录会话
- 接口：
  - POST /chat：输入 prompt，返回完整回复 JSON
  - POST /chat/stream：输入 prompt，SSE 流式返回增量文本
  - GET /health：健康检查、队列与指标摘要
  - GET /metrics：基础指标（文本格式，可被 Prometheus 抓取）
  - GET /login/start：打开目标站点用于首次手动登录
- 并发与稳健性：p-queue 并发控制与排队；超时与失败重试；简易幂等缓存
- 安全：可选 API Key 鉴权、按 IP/Key 限流
- 结构化日志：pino
- 站点适配：选择器集中配置，支持环境变量覆盖
- Docker 支持：Dockerfile + docker-compose 示例

合规声明：本项目不提供、也不鼓励绕过任何付费、验证码或其他安全机制的能力，请在遵守目标站点条款的前提下使用。

## 快速开始（本地）

1) 安装依赖：

```
npm install
```

2) 配置环境变量（建议使用 `.env` 文件）：

```
# 必填：目标对话页 URL（示例）
TARGET_URL=https://example.com/chat

# 认证与限流
API_KEY=dev-key                  # 逗号分隔可配置多个；留空则关闭鉴权
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60

# 浏览器与会话
HEADFUL=1                        # 1 为可视化（手动登录方便），0 为无头
USER_DATA_DIR=./user-data        # 持久化会话目录
NAVIGATION_TIMEOUT_MS=45000

# 并发与稳定性
CONCURRENCY=2
MAX_QUEUE=100
TIMEOUT_MS=120000                # 每个请求的最长执行时间
RETRY_ATTEMPTS=1
RETRY_MIN_TIMEOUT_MS=500
RETRY_BACKOFF_FACTOR=2

# 日志
LOG_LEVEL=info

# 选择器（按目标站点需要覆盖）
# CHAT_INPUT_SELECTOR=
# SEND_BUTTON_SELECTOR=
# RESPONSE_CONTAINER_SELECTOR=
# NEW_CHAT_BUTTON_SELECTOR=

# 流式识别相关
POLL_INTERVAL_MS=300
STABLE_CHECKS=6
```

3) 首次登录（建议在 HEADFUL=1 下）：

```
# 方式一：运行登录助手，会打开持久化浏览器上下文页面
npm run login

# 方式二：启动服务后，访问 GET /login/start 亦可打开页面
```

出现浏览器窗口后，手动完成站点登录。成功后 cookie 将保存在 `user-data/` 中，后续请求会沿用此会话。

4) 启动服务：

```
npm start
```

5) 进行请求：

```
# 完整回复
./examples/curl_chat.sh "请写一首五言绝句"

# 流式 SSE
./examples/curl_stream.sh "用三句话解释什么是反向代理"
```

也可以使用 Node 示例：

```
node examples/node_chat.js "给我写一首七言绝句"
```

## API 说明

- POST /chat
  - 请求体：`{ "prompt": "..." }`
  - 请求头：`x-api-key: <你的 key>`（若配置了 API_KEY）
  - 响应：`{ "reply": "...", "durationMs": 1234 }`

- POST /chat/stream
  - 请求体：`{ "prompt": "..." }`
  - SSE 事件：
    - `delta`：`{ "delta": "..." }`（增量片段）
    - `done`：`{ "durationMs": ... }`（完成）

- GET /health：返回服务状态、队列长度及指标摘要
- GET /metrics：文本格式指标，示例：
  - proxy_requests_total
  - proxy_requests_error_total
  - proxy_request_avg_duration_ms
  - proxy_queue_size / proxy_queue_pending
- GET /login/start：在持久化浏览器上下文中打开 `TARGET_URL`，用于手动登录

说明：支持使用 `Idempotency-Key` 请求头实现幂等（相同 Key 在缓存未过期时会返回相同结果）。

## 适配不同站点

- 可通过环境变量覆盖选择器：
  - CHAT_INPUT_SELECTOR（默认：`textarea, [contenteditable="true"], input[type="text"]`）
  - SEND_BUTTON_SELECTOR（可选；不设置则按 Enter 发送）
  - RESPONSE_CONTAINER_SELECTOR（默认：`.response, .assistant, .message-bot, .ai-message, .bot-message, .response-container`）
  - NEW_CHAT_BUTTON_SELECTOR（可选；用于新建对话、清空上下文等）
- 发送消息流程：定位输入框 -> 输入 prompt -> 点击发送或回车 -> 轮询回复容器的最新节点文本，按增量推送。
- 对于目标站点的结构微调，只需调整选择器即可继续工作。

## 架构概览

- Playwright 使用 `launchPersistentContext(userDataDir)` 保持登录态
- `src/adapter.js` 封装页面交互与流式增量提取
- `src/queue.js` 使用 p-queue 控制并发与超时；`/chat` 与 `/chat/stream` 都经队列执行
- `src/server.js` 暴露 HTTP 接口、鉴权、限流、SSE 输出与基础指标
- `src/idempotency.js` 简易内存幂等缓存（可按需替换为外部存储）
- `src/metrics.js` 基础指标（请求总数/错误数/平均耗时）

## Docker 部署

使用 docker-compose（包含持久化 user-data 卷）：

```
docker-compose up --build
```

容器中默认无头运行。若需要在服务器上进行可视化登录，可考虑 `xvfb-run` 包装运行，或在本地完成登录后将 `user-data/` 内容同步到服务器卷。

## 合规与限制

- 本项目不包含、也不建议绕过付费、验证码或其他安全机制的任何功能。
- 请确保你的使用符合目标站点的服务条款与法律法规。
