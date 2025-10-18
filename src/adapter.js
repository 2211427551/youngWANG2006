/*
 * 站点适配器（页面交互与流式提取）：
 * - 通过配置的选择器定位输入框、发送按钮与回复容器
 * - 发送消息后，通过轮询最新回复节点的文本实现增量流式输出
 * - 使用“稳定检查”判断回复停止（多次轮询无增量视为完成）
 */
const { config } = require('./config');
const { logger } = require('./logger');

// 汇总并返回选择器（支持通过环境变量覆盖）
function getSelectors() {
  return {
    chatInput: config.selectors.chatInput,
    sendButton: config.selectors.sendButton || null,
    responseContainer: config.selectors.responseContainer,
    newChatButton: config.selectors.newChatButton || null,
  };
}

// 尝试在对话完成后自动删除当前会话（最佳努力，失败不影响主流程）
async function tryDeleteChat(page) {
  if (!config.autoDeleteAfterChat) return;
  const start = Date.now();
  try {
    // Step 1：点击下拉菜单中的 Delete（限定在 Radix 的 popover 内容区内）
    const popWrapper = page.locator('div[data-radix-popover-content-wrapper]');
    let menuOpen = await popWrapper.isVisible().catch(() => false);

    // 若菜单未开启，尝试触发常见的菜单打开按钮
    if (!menuOpen) {
      const triggers = [
        '[data-radix-dropdown-menu-trigger]',
        'button[aria-haspopup="menu"]',
        'button[aria-controls*="radix"]',
        'button[aria-expanded]',
        'button:has(svg.lucide-ellipsis)',
        'button:has(svg[class*="ellipsis"])',
        'button:has(svg.lucide-more-vertical)',
        // 顶部导航/工具栏区域常见按钮
        'div[class*="z-50"] button',
      ];
      for (const sel of triggers) {
        const btn = page.locator(sel).last();
        if (await btn.count()) {
          try {
            await btn.click({ timeout: 600 });
            const visible = await popWrapper
              .waitFor({ state: 'visible', timeout: 800 })
              .then(() => true)
              .catch(() => false);
            if (visible) { menuOpen = true; break; }
          } catch (_) {}
        }
      }
    }

    // 在已开启的下拉菜单中定位并点击 Delete 项
    let clickedMenuDelete = false;
    if (menuOpen) {
      let menuItem = popWrapper.getByRole('menuitem', { name: config.deleteMenuText, exact: true }).first();
      if (!(await menuItem.count())) {
        // 兜底：按文本匹配
        menuItem = popWrapper.getByText(config.deleteMenuText, { exact: true }).first();
      }
      if (await menuItem.count()) {
        await menuItem.click({ timeout: 1500 }).catch(() => {});
        clickedMenuDelete = true;
      }
    } else {
      // 兜底：在任意可见菜单中直接找 Delete 项
      const anyMenuItem = page.getByRole('menuitem', { name: config.deleteMenuText, exact: true }).first();
      if (await anyMenuItem.count()) {
        await anyMenuItem.click({ timeout: 1500 }).catch(() => {});
        clickedMenuDelete = true;
      }
    }

    // Step 2：在 Headless UI 的确认对话框中再次点击 Delete 确认
    if (clickedMenuDelete) {
      // 等待确认对话框出现
      const dialog = page.locator('[role="dialog"][data-headlessui-state="open"], div[data-headlessui-portal-root] [role="dialog"]');
      await dialog.waitFor({ state: 'visible', timeout: config.deleteTimeoutMs }).catch(() => {});

      // 在对话框范围内优先查找“Delete”按钮
      let confirmBtn = dialog.getByRole('button', { name: config.confirmDeleteText, exact: true }).first();
      if (!(await confirmBtn.count())) {
        // 兜底：全局查找一个可见的 Delete 按钮
        confirmBtn = page.getByRole('button', { name: config.confirmDeleteText, exact: true }).first();
      }
      if (await confirmBtn.count()) {
        await confirmBtn.click({ timeout: 2500 }).catch(() => {});
      }

      // 尝试等待对话框关闭，确保删除流程完成
      await dialog.waitFor({ state: 'detached', timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  } catch (e) {
    logger.debug({ err: e, elapsedMs: Date.now() - start }, 'Auto delete chat failed (two-step)');
  }
}

// 发送消息并以增量形式回调 onDelta（SSE 使用该函数）
async function sendMessageAndStream(page, prompt, onDelta, options = {}) {
  const selectors = getSelectors();
  const pollIntervalMs = config.pollIntervalMs;
  const stableChecks = config.stableChecks;

  // 打开目标对话页面
  await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });

  // 若配置了新对话按钮，尝试点击以清空上下文
  if (selectors.newChatButton) {
    try {
      await page.waitForSelector(selectors.newChatButton, { state: 'visible', timeout: 1500 });
      await page.click(selectors.newChatButton);
    } catch (e) {}
  }

  // 聚焦并填充输入框（兼容 textarea/input 与 contenteditable）
  const inputHandle = await page.waitForSelector(selectors.chatInput, { state: 'visible' });
  const tag = await inputHandle.evaluate(el => el.tagName.toLowerCase());
  if (tag === 'textarea' || tag === 'input') {
    await inputHandle.fill('');
    await inputHandle.type(prompt, { delay: 10 });
  } else {
    await inputHandle.evaluate((el) => {
      if ('value' in el) el.value = '';
      if (el.isContentEditable) el.textContent = '';
    });
    await inputHandle.focus();
    await page.keyboard.type(prompt, { delay: 10 });
  }

  // 发送前记录当前回复节点基线（数量与最后一个节点的文本）
  const baseline = await page.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    const last = nodes.length ? nodes[nodes.length - 1] : null;
    const lastText = last ? (last.innerText || last.textContent || '') : '';
    return { count: nodes.length, lastText };
  }, selectors.responseContainer);

  // 发送消息（优先点击发送按钮，否则回车）
  if (selectors.sendButton) {
    try {
      await page.click(selectors.sendButton, { timeout: 1000 });
    } catch (e) {
      await page.keyboard.press('Enter');
    }
  } else {
    await page.keyboard.press('Enter');
  }

  // 等待出现新回复或已有回复文本更新
  try {
    await page.waitForFunction(({ sel, baseCount, baseText }) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      if (nodes.length > baseCount) return true;
      if (nodes.length) {
        const last = nodes[nodes.length - 1];
        const text = last.innerText || last.textContent || '';
        if (text && text !== baseText) return true;
      }
      return false;
    }, { timeout: config.navigationTimeoutMs }, { sel: selectors.responseContainer, baseCount: baseline.count, baseText: baseline.lastText });
  } catch (_) {
    // 兜底：至少要能选中回复容器
    await page.waitForSelector(selectors.responseContainer, { state: 'attached' });
  }

  // 读取最新回复文本的工具函数
  async function getLastResponseText() {
    const text = await page.evaluate((sel) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      if (!nodes.length) return '';
      const last = nodes[nodes.length - 1];
      return last.innerText || last.textContent || '';
    }, selectors.responseContainer);
    return text || '';
  }

  // 轮询比对文本长度，产出增量；多次无变化则视为完成
  let lastText = '';
  let stable = 0;
  let total = '';

  while (true) {
    const text = await getLastResponseText();
    if (text.length > lastText.length) {
      const delta = text.slice(lastText.length);
      if (delta && typeof onDelta === 'function') await onDelta(delta);
      total = text;
      lastText = text;
      stable = 0;
    } else {
      stable += 1;
    }

    if (stable >= stableChecks) break;

    await page.waitForTimeout(pollIntervalMs);
  }

  // 最佳努力自动删除当前对话
  await tryDeleteChat(page).catch(() => {});

  return total.trim();
}

// 发送消息并聚合成完整文本（/chat 使用该函数）
async function sendMessageAndGetFull(page, prompt) {
  let full = '';
  await sendMessageAndStream(page, prompt, async (delta) => {
    full += delta;
  });
  // 最佳努力自动删除当前对话
  await tryDeleteChat(page).catch(() => {});
  return full.trim();
}

module.exports = {
  getSelectors,
  sendMessageAndStream,
  sendMessageAndGetFull,
  tryDeleteChat,
};
