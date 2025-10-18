const express = require('express');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const pRetry = require('p-retry');
const { config } = require('./config');
const { logger } = require('./logger');
const { metrics } = require('./metrics');
const { queue } = require('./queue');
const { browserManager } = require('./browser');
const { sendMessageAndGetFull, sendMessageAndStream } = require('./adapter');
const { idempotencyCache } = require('./idempotency');

if (!config.targetUrl) {
  logger.warn('TARGET_URL not set. Please set TARGET_URL to the chat page of the target site.');
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// Rate limit per IP/key
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
});
app.use(limiter);

// API key auth
app.use((req, res, next) => {
  if (!config.apiKeys.length) return next();
  const key = req.headers['x-api-key'];
  if (!key || !config.apiKeys.includes(String(key))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Queue backpressure
app.use((req, res, next) => {
  const queued = queue.size + queue.pending;
  if (queued >= config.maxQueue) {
    return res.status(429).json({ error: 'Queue full', queue: { size: queue.size, pending: queue.pending, max: config.maxQueue } });
  }
  next();
});

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    up: true,
    queue: { size: queue.size, pending: queue.pending },
    metrics: {
      requestsTotal: metrics.requestsTotal,
      requestsErrored: metrics.requestsErrored,
      avgDurationMs: metrics.avgDurationMs,
    },
    config: {
      concurrency: config.concurrency,
      requestTimeoutMs: config.requestTimeoutMs,
      targetUrl: !!config.targetUrl,
    }
  });
});

app.get('/metrics', (req, res) => {
  res.type('text/plain').send(
    `proxy_requests_total ${metrics.requestsTotal}\n` +
    `proxy_requests_error_total ${metrics.requestsErrored}\n` +
    `proxy_request_avg_duration_ms ${metrics.avgDurationMs}\n` +
    `proxy_queue_size ${queue.size}\n` +
    `proxy_queue_pending ${queue.pending}\n`
  );
});

// Login helpers
app.get('/login/start', async (req, res) => {
  try {
    const page = await browserManager.openLoginPage();
    res.json({ message: 'Login page opened in browser context. Complete login manually. Cookies will persist in userDataDir.', url: config.targetUrl, headful: config.headful });
  } catch (err) {
    req.log.error({ err }, 'Failed to open login page');
    res.status(500).json({ error: 'Failed to open login page', details: err.message });
  }
});

app.get('/login/screenshot', async (req, res) => {
  try {
    const page = await browserManager.newPage();
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
    const buf = await page.screenshot({ fullPage: true });
    await page.close();
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, 'Failed to take screenshot');
    res.status(500).json({ error: 'Failed to take screenshot', details: err.message });
  }
});

// Chat - full response
app.post('/chat', async (req, res) => {
  const started = Date.now();
  const { prompt } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'];

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  const cached = idempotencyCache.get(idempotencyKey);
  if (cached) {
    return res.json({ cached: true, reply: cached });
  }

  try {
    const job = async () => {
      const page = await browserManager.newPage();
      try {
        const text = await sendMessageAndGetFull(page, prompt);
        return text;
      } finally {
        await page.close().catch(() => {});
      }
    };

    const task = () => pRetry(job, {
      retries: config.retryAttempts,
      minTimeout: config.retryMinTimeoutMs,
      factor: config.retryFactor,
    });

    const result = await queue.add(task, { throwOnTimeout: true });
    idempotencyCache.set(idempotencyKey, result);

    const duration = Date.now() - started;
    metrics.record(duration, true);
    res.json({ reply: result, durationMs: duration });
  } catch (err) {
    const duration = Date.now() - started;
    metrics.record(duration, false);
    req.log.error({ err }, 'Chat request failed');
    res.status(500).json({ error: 'Request failed', details: err.message, durationMs: duration });
  }
});

// Chat - streaming SSE
app.post('/chat/stream', async (req, res) => {
  const started = Date.now();
  const { prompt } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'];
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  const cached = idempotencyCache.get(idempotencyKey);
  if (cached) {
    sseHeaders(res);
    sseSend(res, 'delta', { delta: cached });
    sseSend(res, 'done', {});
    return res.end();
  }

  sseHeaders(res);

  const sendError = (err) => {
    try {
      sseSend(res, 'error', { message: err.message });
      res.end();
    } catch (_) {}
  };

  const job = async () => {
    const page = await browserManager.newPage();
    let full = '';
    try {
      const text = await sendMessageAndStream(page, prompt, async (delta) => {
        full += delta;
        sseSend(res, 'delta', { delta });
      });
      return { text, full };
    } finally {
      await page.close().catch(() => {});
    }
  };

  const task = () => pRetry(job, {
    retries: config.retryAttempts,
    minTimeout: config.retryMinTimeoutMs,
    factor: config.retryFactor,
  });

  queue.add(task, { throwOnTimeout: true }).then(({ text, full }) => {
    idempotencyCache.set(idempotencyKey, text || full || '');
    const duration = Date.now() - started;
    metrics.record(duration, true);
    sseSend(res, 'done', { durationMs: duration });
    res.end();
  }).catch((err) => {
    const duration = Date.now() - started;
    metrics.record(duration, false);
    logger.error({ err }, 'Streaming chat request failed');
    sendError(err);
  });
});

const server = app.listen(config.port, config.host, async () => {
  logger.info({ port: config.port, host: config.host }, 'Starting server');
  try {
    await browserManager.launch();
    logger.info('Browser ready');
  } catch (err) {
    logger.error({ err }, 'Failed to launch browser');
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
