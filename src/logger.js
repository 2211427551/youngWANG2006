/*
 * 结构化日志：使用 pino，默认输出 ISO 时间戳；日志等级由 LOG_LEVEL 控制
 */
const pino = require('pino');
const { config } = require('./config');

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = { logger };
