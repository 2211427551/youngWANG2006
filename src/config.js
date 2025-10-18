/*
 * 配置中心（支持 .env 环境变量覆盖）
 * - 目标站点 URL 与页面选择器
 * - Playwright 持久化会话目录与浏览器模式（headful/headless）
 * - 并发、队列、超时与重试
 * - API Key 鉴权与限流
 * - 日志等级与流式参数
 */
const path = require('path');
require('dotenv').config();

function bool(val, def = false) {
  if (val === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
}

const config = {
  // 服务监听配置
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // 目标站点与选择器（可通过环境变量覆盖）
  targetUrl: process.env.TARGET_URL || '',
  selectors: {
    // 聊天输入框：通常为 textarea 或 contenteditable
    chatInput: process.env.CHAT_INPUT_SELECTOR || 'textarea, [contenteditable="true"], input[type="text"]',
    // 发送按钮（可选）：若未配置则默认回车发送
    sendButton: process.env.SEND_BUTTON_SELECTOR || '',
    // 回复容器：用于检索最新的 AI 回复节点
    // 根据提供的 HTML，回复正文位于 <div class="wrap-anywhere"><p>...</p></div>
    // 因此将该选择器置于优先位置，并保留通用后备选择器。
    responseContainer: process.env.RESPONSE_CONTAINER_SELECTOR || 'div.wrap-anywhere p, div.wrap-anywhere, .response, .assistant, .message-bot, .ai-message, .bot-message, .response-container',
    // 新建对话按钮（可选）：用于清空上下文
    newChatButton: process.env.NEW_CHAT_BUTTON_SELECTOR || ''
  },

  // 对话清理（完成后自动删除，避免累计占用）
  autoDeleteAfterChat: bool(process.env.AUTO_DELETE_AFTER_CHAT, true),
  deleteTimeoutMs: parseInt(process.env.DELETE_TIMEOUT_MS || '10000', 10),
  deleteMenuText: process.env.DELETE_MENU_TEXT || 'Delete',
  confirmDeleteText: process.env.CONFIRM_DELETE_TEXT || 'Delete',

  // Playwright/浏览器配置
  userDataDir: process.env.USER_DATA_DIR || path.resolve(process.cwd(), 'user-data'),
  headful: bool(process.env.HEADFUL, false),
  navigationTimeoutMs: parseInt(process.env.NAVIGATION_TIMEOUT_MS || '45000', 10),

  // 队列与执行配置
  concurrency: parseInt(process.env.CONCURRENCY || '2', 10),
  maxQueue: parseInt(process.env.MAX_QUEUE || '100', 10),
  requestTimeoutMs: parseInt(process.env.TIMEOUT_MS || '120000', 10),
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '1', 10),
  retryMinTimeoutMs: parseInt(process.env.RETRY_MIN_TIMEOUT_MS || '500', 10),
  retryFactor: parseFloat(process.env.RETRY_BACKOFF_FACTOR || '2'),

  // 鉴权与限流
  apiKeys: (process.env.API_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),

  // 日志
  logLevel: process.env.LOG_LEVEL || 'info',

  // SSE/流式
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300', 10),
  stableChecks: parseInt(process.env.STABLE_CHECKS || '6', 10),
};

module.exports = { config };
