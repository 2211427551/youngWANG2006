const PQueue = require('p-queue').default;
const { config } = require('./config');

const queue = new PQueue({
  concurrency: config.concurrency,
  timeout: config.requestTimeoutMs,
  throwOnTimeout: true,
  autoStart: true,
});

module.exports = { queue };
