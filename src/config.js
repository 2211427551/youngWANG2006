const path = require('path');
require('dotenv').config();

function bool(val, def = false) {
  if (val === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Target site and selectors
  targetUrl: process.env.TARGET_URL || '',
  selectors: {
    chatInput: process.env.CHAT_INPUT_SELECTOR || 'textarea, [contenteditable="true"], input[type="text"]',
    sendButton: process.env.SEND_BUTTON_SELECTOR || '',
    responseContainer: process.env.RESPONSE_CONTAINER_SELECTOR || '.response, .assistant, .message-bot, .ai-message, .bot-message, .response-container',
    newChatButton: process.env.NEW_CHAT_BUTTON_SELECTOR || ''
  },

  // Playwright/browser
  userDataDir: process.env.USER_DATA_DIR || path.resolve(process.cwd(), 'user-data'),
  headful: bool(process.env.HEADFUL, false),
  navigationTimeoutMs: parseInt(process.env.NAVIGATION_TIMEOUT_MS || '45000', 10),

  // Queue and execution
  concurrency: parseInt(process.env.CONCURRENCY || '2', 10),
  maxQueue: parseInt(process.env.MAX_QUEUE || '100', 10),
  requestTimeoutMs: parseInt(process.env.TIMEOUT_MS || '120000', 10),
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '1', 10),
  retryMinTimeoutMs: parseInt(process.env.RETRY_MIN_TIMEOUT_MS || '500', 10),
  retryFactor: parseFloat(process.env.RETRY_BACKOFF_FACTOR || '2'),

  // Auth and rate limit
  apiKeys: (process.env.API_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // SSE/streaming
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300', 10),
  stableChecks: parseInt(process.env.STABLE_CHECKS || '6', 10),
};

module.exports = { config };
