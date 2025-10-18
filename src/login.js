const { browserManager } = require('./browser');
const { config } = require('./config');
const { logger } = require('./logger');

async function main() {
  logger.info({ headful: config.headful, targetUrl: config.targetUrl }, 'Login helper starting');
  if (!config.headful) {
    logger.warn('HEADFUL is false. Set HEADFUL=1 to open a visible browser window for manual login.');
  }
  const page = await browserManager.openLoginPage();
  logger.info('Please complete login in the opened browser window. Close the window to finish.');
  page.on('close', () => process.exit(0));
}

main().catch((err) => {
  logger.error({ err }, 'Login helper failed');
  process.exit(1);
});
