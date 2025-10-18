const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { logger } = require('./logger');

class BrowserManager {
  constructor() {
    this.context = null;
    this.isLaunching = false;
  }

  async launch() {
    if (this.context) return this.context;
    if (this.isLaunching) {
      // wait for ongoing launch
      while (!this.context) {
        await new Promise(r => setTimeout(r, 50));
      }
      return this.context;
    }

    this.isLaunching = true;
    const headless = !config.headful;
    logger.info({ headless, userDataDir: config.userDataDir }, 'Launching persistent Chromium context');
    this.context = await chromium.launchPersistentContext(config.userDataDir, {
      headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-setuid-sandbox',
      ],
      viewport: null,
      locale: 'en-US',
      acceptDownloads: false,
      bypassCSP: true,
    });
    this.context.setDefaultTimeout(config.navigationTimeoutMs);

    this.context.on('close', () => {
      logger.warn('Browser context closed');
      this.context = null;
    });

    this.isLaunching = false;
    return this.context;
  }

  async newPage() {
    const ctx = await this.launch();
    const page = await ctx.newPage();
    page.setDefaultTimeout(config.navigationTimeoutMs);
    return page;
  }

  async openLoginPage() {
    const page = await this.newPage();
    logger.info({ url: config.targetUrl }, 'Opening login page');
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
    return page;
  }
}

const browserManager = new BrowserManager();
module.exports = { BrowserManager, browserManager };
