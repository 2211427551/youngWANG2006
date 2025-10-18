const { config } = require('./config');
const { logger } = require('./logger');

function getSelectors() {
  return {
    chatInput: config.selectors.chatInput,
    sendButton: config.selectors.sendButton || null,
    responseContainer: config.selectors.responseContainer,
    newChatButton: config.selectors.newChatButton || null,
  };
}

async function sendMessageAndStream(page, prompt, onDelta, options = {}) {
  const selectors = getSelectors();
  const pollIntervalMs = config.pollIntervalMs;
  const stableChecks = config.stableChecks;

  await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });

  if (selectors.newChatButton) {
    try {
      await page.waitForSelector(selectors.newChatButton, { state: 'visible', timeout: 1500 });
      await page.click(selectors.newChatButton);
    } catch (e) {}
  }

  // Focus and fill input
  const inputHandle = await page.waitForSelector(selectors.chatInput, { state: 'visible' });
  const tag = await inputHandle.evaluate(el => el.tagName.toLowerCase());
  if (tag === 'textarea' || tag === 'input') {
    await inputHandle.fill('');
    await inputHandle.type(prompt, { delay: 10 });
  } else {
    await inputHandle.evaluate((el, text) => {
      if ('value' in el) el.value = '';
      if (el.isContentEditable) el.textContent = '';
    }, '');
    await inputHandle.focus();
    await page.keyboard.type(prompt, { delay: 10 });
  }

  // Capture baseline response nodes
  const baseline = await page.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    const last = nodes.length ? nodes[nodes.length - 1] : null;
    const lastText = last ? (last.innerText || last.textContent || '') : '';
    return { count: nodes.length, lastText };
  }, selectors.responseContainer);

  // Send message
  if (selectors.sendButton) {
    try {
      await page.click(selectors.sendButton, { timeout: 1000 });
    } catch (e) {
      await page.keyboard.press('Enter');
    }
  } else {
    await page.keyboard.press('Enter');
  }

  // Wait for new/updated response container
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
    await page.waitForSelector(selectors.responseContainer, { state: 'attached' });
  }

  // Helper to get last response text
  async function getLastResponseText() {
    const text = await page.evaluate((sel) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      if (!nodes.length) return '';
      const last = nodes[nodes.length - 1];
      return last.innerText || last.textContent || '';
    }, selectors.responseContainer);
    return text || '';
  }

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

  return total.trim();
}

async function sendMessageAndGetFull(page, prompt) {
  let full = '';
  await sendMessageAndStream(page, prompt, async (delta) => {
    full += delta;
  });
  return full.trim();
}

module.exports = {
  getSelectors,
  sendMessageAndStream,
  sendMessageAndGetFull,
};
