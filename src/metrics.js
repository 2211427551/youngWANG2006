const metrics = {
  requestsTotal: 0,
  requestsErrored: 0,
  durationsMs: [],
  get avgDurationMs() {
    if (!this.durationsMs.length) return 0;
    return Math.round(this.durationsMs.reduce((a, b) => a + b, 0) / this.durationsMs.length);
  },
  record(durationMs, ok = true) {
    this.requestsTotal += 1;
    if (!ok) this.requestsErrored += 1;
    this.durationsMs.push(durationMs);
    if (this.durationsMs.length > 1000) this.durationsMs.shift();
  }
};

module.exports = { metrics };
