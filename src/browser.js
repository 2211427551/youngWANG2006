/*
 * 浏览器管理：基于 Playwright 的持久化上下文
 * - 使用 launchPersistentContext(userDataDir) 保持登录会话
 * - 支持 headful/headless 模式（通过 HEADFUL 控制）
 * - 提供 newPage() 与 openLoginPage() 便捷方法
 */
const { chromium } = require('playwright');
const { config } = require('./config');
const { logger } = require('./logger');

class BrowserManager {
  constructor() {
    this.context = null;
    this.isLaunching = false;
  }

  // 启动持久化浏览器上下文（单例）
  async launch() {
    if (this.context) return this.context;
    if (this.isLaunching) {
      // 等待并复用正在启动的上下文
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

  // 创建新页面（继承默认超时）
  async newPage() {
    const ctx = await this.launch();
    const page = await ctx.newPage();
    page.setDefaultTimeout(config.navigationTimeoutMs);
    return page;
  }

  // 打开登录页以便手动登录（cookie 将持久化）
  async openLoginPage() {
    const page = await this.newPage();
    logger.info({ url: config.targetUrl }, 'Opening login page');
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
    return page;
  }
}

const browserManager = new BrowserManager();
module.exports = { BrowserManager, browserManager };
