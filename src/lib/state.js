'use strict';
// Runtime state that is NOT in the database: lab (chaos) config and metrics.

const DEFAULT_LAB = () => ({
  latencyMs: 0,
  jitterMs: 0,
  errorRate: 0,
  slowRoutes: {},       // e.g. { "/api/checkout": 1500 }
  searchCost: 0,        // extra CPU loops per search request (stress-test bottleneck)
  bugs: {
    discountOnMrp: false,          // % coupons calculated on MRP instead of selling price
    caseSensitiveSearch: false,    // search becomes case-sensitive
    stockNotRestoredOnCancel: false, // cancelling an order does not return stock (DB check)
    couponMinIgnored: false,       // coupon minimum order value not enforced
    wishlistDuplicates: false,     // same product can be wishlisted twice (DB integrity bug)
    slotOverbooking: false,        // delivery slot capacity not enforced
    memoryLeak: false,             // each request leaks ~50 KB (soak testing)
    unsafeSearchEcho: false,       // search term rendered as raw HTML (XSS lab)
    idorOrders: false,             // any logged-in user can open any order by its number (broken access control)
    noLoginRateLimit: false,       // brute-force protection on login is switched off
  },
});

const state = { lab: DEFAULT_LAB(), leak: [] };

const metrics = {
  startedAt: Date.now(), requests: 0, errors: 0, byStatus: {}, byRoute: {}, durations: [],
  record(route, status, ms) {
    this.requests++;
    if (status >= 500) this.errors++;
    this.byStatus[status] = (this.byStatus[status] || 0) + 1;
    const r = (this.byRoute[route] = this.byRoute[route] || { count: 0, totalMs: 0, maxMs: 0, errors: 0 });
    r.count++; r.totalMs += ms; r.maxMs = Math.max(r.maxMs, ms); if (status >= 500) r.errors++;
    this.durations.push(ms);
    if (this.durations.length > 10000) this.durations.shift();
  },
  pct(p) {
    if (!this.durations.length) return 0;
    const s = [...this.durations].sort((a, b) => a - b);
    return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(2);
  },
  snapshot(extra = {}) {
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      requests: this.requests, serverErrors: this.errors, byStatus: this.byStatus,
      latencyMs: { p50: this.pct(50), p90: this.pct(90), p95: this.pct(95), p99: this.pct(99) },
      routes: Object.fromEntries(Object.entries(this.byRoute).map(([k, v]) => [k, { count: v.count, avgMs: +(v.totalMs / v.count).toFixed(2), maxMs: +v.maxMs.toFixed(2), errors: v.errors }])),
      memoryMB: { rss: +(mem.rss / 1048576).toFixed(1), heapUsed: +(mem.heapUsed / 1048576).toFixed(1) },
      leakedChunks: state.leak.length,
      ...extra,
    };
  },
  prometheus(extra) {
    const s = this.snapshot(extra);
    const lines = [
      '# HELP ka_requests_total Total HTTP requests', '# TYPE ka_requests_total counter', `ka_requests_total ${s.requests}`,
      '# TYPE ka_server_errors_total counter', `ka_server_errors_total ${s.serverErrors}`,
      '# TYPE ka_active_sessions gauge', `ka_active_sessions ${s.activeSessions ?? 0}`,
      '# TYPE ka_orders_total counter', `ka_orders_total ${s.orders ?? 0}`,
      '# TYPE ka_heap_used_mb gauge', `ka_heap_used_mb ${s.memoryMB.heapUsed}`,
      '# TYPE ka_latency_ms summary',
      ...['50', '90', '95', '99'].map(q => `ka_latency_ms{quantile="0.${q}"} ${s.latencyMs['p' + q]}`),
    ];
    for (const [route, v] of Object.entries(s.routes)) lines.push(`ka_route_requests_total{route="${route}"} ${v.count}`, `ka_route_avg_ms{route="${route}"} ${v.avgMs}`);
    return lines.join('\n') + '\n';
  },
  reset() { this.requests = 0; this.errors = 0; this.byStatus = {}; this.byRoute = {}; this.durations = []; this.startedAt = Date.now(); },
};

module.exports = { state, metrics, DEFAULT_LAB };
