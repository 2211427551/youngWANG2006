/*
 * 并发与排队：基于 p-queue
 * - concurrency：并发页面任务数
 * - timeout：单任务超时（触发异常）
 * - 结合 /server.js 的“队列回压”中间件，在队列过载时返回 429
 */
const PQueue = require('p-queue').default;
const { config } = require('./config');

const queue = new PQueue({
  concurrency: config.concurrency,
  timeout: config.requestTimeoutMs,
  throwOnTimeout: true,
  autoStart: true,
});

module.exports = { queue };
