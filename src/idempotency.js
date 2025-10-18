class IdempotencyCache {
  constructor(ttlMs = 10 * 60 * 1000, max = 1000) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.map = new Map();
  }
  set(key, value) {
    if (!key) return;
    const now = Date.now();
    this.map.set(key, { value, ts: now });
    if (this.map.size > this.max) this.cleanup();
  }
  get(key) {
    if (!key) return undefined;
    const item = this.map.get(key);
    if (!item) return undefined;
    if (Date.now() - item.ts > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return item.value;
  }
  cleanup() {
    const now = Date.now();
    for (const [k, v] of this.map.entries()) {
      if (now - v.ts > this.ttlMs) this.map.delete(k);
    }
  }
}

const idempotencyCache = new IdempotencyCache();
module.exports = { idempotencyCache, IdempotencyCache };
