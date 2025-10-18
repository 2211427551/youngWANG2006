# Playwright-based LLM Web-to-API Proxy (MVP)

A minimal, deployable proxy service that drives an LLM chat website via Playwright and exposes it as simple APIs.

Features:
- Node.js + Express + Playwright (Chromium)
- Persistent browser session with launchPersistentContext (userDataDir)
- Endpoints:
  - POST /chat: returns full response JSON
  - POST /chat/stream: SSE incremental output
  - GET /health: health check, queue and metrics
  - GET /metrics: basic metrics (Prometheus-like)
  - GET /login/start: open login page in browser
- Concurrency control with p-queue; timeout and retry
- Simple API key auth and rate limiting per IP/Key
- Structured logs with pino
- Configurable selectors via environment variables
- Dockerfile and docker-compose example

IMPORTANT: This project does not bypass paywalls, captchas, or any site security mechanisms. Use only in accordance with target site terms.

## Quick start (local)

1) Install dependencies:

```
npm install
```

2) Configure environment variables in a `.env` file (or export them):

```
TARGET_URL=https://example.com/chat
API_KEY=dev-key
HEADFUL=1
CONCURRENCY=2
TIMEOUT_MS=120000
LOG_LEVEL=info
# Override selectors if needed for your target site
# CHAT_INPUT_SELECTOR=
# SEND_BUTTON_SELECTOR=
# RESPONSE_CONTAINER_SELECTOR=
# NEW_CHAT_BUTTON_SELECTOR=
```

3) First-time login (headful):

```
npm run login
```

- A Chromium window will open (if HEADFUL=1). Complete manual login to the target site. Session cookies will persist in `user-data/`.
- Alternatively, start the server and hit `GET /login/start` to open a page in the persistent context.

4) Start the server:

```
npm start
```

5) Make a request:

```
./examples/curl_chat.sh "请写一首五言绝句"
```

Streaming:

```
./examples/curl_stream.sh "用三句话解释什么是反向代理"
```

## Endpoints

- POST /chat
  - Body: `{ "prompt": "..." }`
  - Headers: `x-api-key: <your-key>`
  - Response: `{ "reply": "...", "durationMs": 1234 }`

- POST /chat/stream
  - Body: `{ "prompt": "..." }`
  - SSE events:
    - `delta` with `{ "delta": "..." }`
    - `done` with `{ "durationMs": ... }`

- GET /health: returns service status, queue size, and metrics
- GET /metrics: simple text metrics
- GET /login/start: opens a page at TARGET_URL in the persistent browser; complete login manually

## Configuration

Environment variables:
- TARGET_URL: Target chat page URL (required)
- USER_DATA_DIR: Persistent session directory (default: ./user-data)
- HEADFUL: 1 to run a visible browser (default: 0)
- CONCURRENCY: Parallel page tasks (default: 2)
- TIMEOUT_MS: Per-request timeout (default: 120000)
- RETRY_ATTEMPTS: Retry attempts on failure (default: 1)
- API_KEY: Comma-separated allowed API keys (default: none - disables auth)
- RATE_LIMIT_WINDOW_MS: Rate limit window (default: 60000)
- RATE_LIMIT_MAX: Requests per window per key/IP (default: 60)
- LOG_LEVEL: pino log level (default: info)
- SELECTORS (override as needed):
  - CHAT_INPUT_SELECTOR (default: `textarea, [contenteditable="true"], input[type="text"]`)
  - SEND_BUTTON_SELECTOR (optional; Enter is pressed if unset)
  - RESPONSE_CONTAINER_SELECTOR (default: `.response, .assistant, .message-bot, .ai-message, .bot-message, .response-container`)
  - NEW_CHAT_BUTTON_SELECTOR (optional)
- POLL_INTERVAL_MS: Streaming polling interval (default: 300)
- STABLE_CHECKS: Number of unchanged polls to consider response finished (default: 6)

## Adapting to different sites

- Update the selectors via environment variables to match the structure of your target chat site.
- The adapter sends the prompt by filling the chat input and either clicking the send button or pressing Enter.
- Streaming is implemented by polling the last matching response container and emitting only newly appended text.

## Docker

Build and run with docker-compose:

```
docker-compose up --build
```

Then perform login (headful not available by default inside container). Consider using `xvfb-run` for headful in server environments, or perform login locally and reuse the persisted `user-data/` volume.

## Compliance

- This proxy does not implement or suggest bypassing paywalls, captchas, or other site protections.
- You are responsible for ensuring your use complies with the target site's Terms of Service.
