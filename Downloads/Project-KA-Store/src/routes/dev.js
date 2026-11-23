'use strict';
// Health, metrics, test mailbox, DB explorer, Test Lab, OpenAPI and Postman.
const { route, routes, HttpError } = require('../lib/http');
const { str } = require('../lib/util');
const { state, metrics, DEFAULT_LAB } = require('../lib/state');
const { db, reset, readOnly } = require('../db');

const VERSION = '2.0.0';
const LAB_KEY = process.env.LAB_KEY || '';
function requireLab(ctx) {
  if (LAB_KEY && ctx.req.headers['x-lab-key'] !== LAB_KEY) throw new HttpError(403, 'LAB_LOCKED', 'X-Lab-Key header required');
}
const dbStats = () => ({
  activeSessions: db.get("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?", new Date().toISOString()).n,
  orders: db.get('SELECT COUNT(*) AS n FROM orders').n,
});

route('GET', '/api/health', { tag: 'System', summary: 'Liveness + database check (never affected by chaos)' }, () => {
  let dbOk = true;
  try { db.get('SELECT 1'); } catch { dbOk = false; }
  return { status: dbOk ? 'UP' : 'DEGRADED', version: VERSION, database: dbOk ? 'UP' : 'DOWN', uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
});

route('GET', '/api/metrics', { tag: 'System', summary: 'JSON metrics: request counts, latency percentiles, heap, sessions' }, () => metrics.snapshot(dbStats()));

// ---- test mailbox
route('GET', '/api/dev/mailbox', { tag: 'Dev tools', summary: 'Emails "sent" to an address (welcome, OTP, order updates)', query: ['email'] }, ctx => {
  const email = str(ctx.query.email).toLowerCase();
  if (!email) throw new HttpError(400, 'BAD_QUERY', 'email query parameter is required');
  return db.all('SELECT id, to_email AS "to", subject, body, created_at AS sentAt FROM emails WHERE to_email = ? ORDER BY id DESC LIMIT 50', email);
});
route('DELETE', '/api/dev/mailbox', { tag: 'Dev tools', summary: 'Clear the mailbox for an address', csrf: false, query: ['email'] }, ctx => {
  const n = db.run('DELETE FROM emails WHERE to_email = ?', str(ctx.query.email).toLowerCase()).changes;
  return { ok: true, deleted: n };
});

// ---- DB explorer (read-only)
route('GET', '/api/dev/db/schema', { tag: 'Dev tools', summary: 'Tables, columns and row counts' }, ctx => {
  requireLab(ctx);
  return db.all("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t => ({
    table: t.name,
    rows: db.get(`SELECT COUNT(*) AS n FROM "${t.name}"`).n,
    columns: db.all(`PRAGMA table_info("${t.name}")`).map(c => ({ name: c.name, type: c.type, notNull: !!c.notnull, pk: !!c.pk, default: c.dflt_value })),
  }));
});

route('POST', '/api/dev/db/query', { tag: 'Dev tools', summary: 'Run a read-only SELECT query (max 500 rows)', csrf: false, body: { sql: 'SELECT order_no, status, total FROM orders ORDER BY created_at DESC LIMIT 5' } }, ctx => {
  requireLab(ctx);
  const sql = str(ctx.body.sql).replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) throw new HttpError(422, 'READ_ONLY', 'Only SELECT (or WITH ... SELECT) queries are allowed here');
  if (sql.includes(';')) throw new HttpError(422, 'SINGLE_STATEMENT', 'Run one statement at a time');
  const t = process.hrtime.bigint();
  let rows;
  try { rows = readOnly().prepare(sql).all(); } catch (e) { throw new HttpError(400, 'SQL_ERROR', e.message); }
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return { columns: rows[0] ? Object.keys(rows[0]) : [], rows: rows.slice(0, 500), rowCount: rows.length, truncated: rows.length > 500, timeMs: +ms.toFixed(2) };
});

// ---- Test Lab
route('GET', '/api/lab/config', { tag: 'Test Lab', summary: 'Current chaos settings and bug switches' }, ctx => { requireLab(ctx); return state.lab; });
route('PUT', '/api/lab/config', { tag: 'Test Lab', summary: 'Change chaos settings or bug switches', csrf: false, body: { latencyMs: 0, jitterMs: 0, errorRate: 0, searchCost: 0, slowRoutes: { '/api/checkout': 2000 }, bugs: { discountOnMrp: true } } }, ctx => {
  requireLab(ctx);
  const b = ctx.body;
  const num = (v, min, max) => typeof v === 'number' && v >= min && v <= max;
  const e = {};
  if (b.latencyMs !== undefined && !num(b.latencyMs, 0, 30000)) e.latencyMs = '0–30000';
  if (b.jitterMs !== undefined && !num(b.jitterMs, 0, 30000)) e.jitterMs = '0–30000';
  if (b.errorRate !== undefined && !num(b.errorRate, 0, 1)) e.errorRate = '0–1';
  if (b.searchCost !== undefined && !num(b.searchCost, 0, 50000000)) e.searchCost = '0–50000000';
  if (b.bugs && Object.keys(b.bugs).some(k => !(k in state.lab.bugs))) e.bugs = 'Unknown bug switch. Valid: ' + Object.keys(state.lab.bugs).join(', ');
  if (Object.keys(e).length) throw new HttpError(422, 'VALIDATION_FAILED', 'Invalid lab settings', e);
  state.lab = { ...state.lab, ...b, bugs: { ...state.lab.bugs, ...(b.bugs || {}) }, slowRoutes: b.slowRoutes || state.lab.slowRoutes };
  return state.lab;
});
route('POST', '/api/lab/reset', { tag: 'Test Lab', summary: 'Reset the DATABASE to seed data, clear chaos settings and metrics', csrf: false }, ctx => {
  requireLab(ctx);
  reset();
  state.lab = DEFAULT_LAB(); state.leak.length = 0; metrics.reset();
  require('./auth').resetLoginFailures();
  return { ok: true, message: 'Database re-seeded, lab config and metrics reset. Everyone has been logged out.' };
});

// ---- OpenAPI + Postman, generated from the route table
function openapi(host) {
  const paths = {};
  for (const r of routes) {
    if (r.pattern.startsWith('/api/openapi') || r.pattern.startsWith('/api/postman')) continue;
    const p = r.pattern.replace(/:(\w+)/g, '{$1}');
    const op = {
      tags: [r.meta.tag || 'Other'], summary: r.meta.summary || '',
      parameters: [
        ...r.keys.map(k => ({ name: k, in: 'path', required: true, schema: { type: 'string' } })),
        ...(r.meta.query || []).map(q => ({ name: q.split(/[ =]/)[0], in: 'query', required: false, description: q, schema: { type: 'string' } })),
      ],
      responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' }, 401: { description: 'Not logged in' }, 403: { description: 'Forbidden' }, 404: { description: 'Not found' }, 422: { description: 'Validation failed' } },
    };
    if (['user', 'admin'].includes(r.meta.auth)) op.security = [{ bearerAuth: [] }];
    if (r.meta.auth === 'admin') op.description = 'Admin only.';
    if (r.meta.body) op.requestBody = { content: { 'application/json': { example: r.meta.body } } };
    (paths[p] = paths[p] || {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'KarthikAutomation Practice Store API', version: VERSION, description: 'Learning API for automation practice only. Designed by Karthik Puttoju.\n\nAuth: POST /api/auth/login, then send `Authorization: Bearer <accessToken>`. Browser sessions use the ka_session cookie plus an X-CSRF-Token header on writes.' },
    servers: [{ url: `http://${host}` }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
route('GET', '/api/openapi.json', { tag: 'System', summary: 'OpenAPI 3 specification' }, ctx => openapi(ctx.req.headers.host || 'localhost:3000'));

route('GET', '/api/postman.json', { tag: 'System', summary: 'Postman collection (import into Postman)' }, ctx => {
  const groups = {};
  for (const r of routes) {
    if (r.pattern.startsWith('/api/openapi') || r.pattern.startsWith('/api/postman')) continue;
    const tag = r.meta.tag || 'Other';
    const url = '{{baseUrl}}' + r.pattern.replace(/:(\w+)/g, '{{$1}}');
    const item = {
      name: `${r.method} ${r.pattern} — ${r.meta.summary || ''}`.slice(0, 120),
      request: {
        method: r.method, url,
        header: [{ key: 'Content-Type', value: 'application/json' }, ...(['user', 'admin'].includes(r.meta.auth) ? [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }] : [])],
        ...(r.meta.body ? { body: { mode: 'raw', raw: JSON.stringify(r.meta.body, null, 2) } } : {}),
      },
    };
    if (r.pattern === '/api/auth/login') item.event = [{ listen: 'test', script: { exec: ['const j = pm.response.json();', "pm.collectionVariables.set('accessToken', j.accessToken);", "pm.test('status is 200', () => pm.response.to.have.status(200));"] } }];
    (groups[tag] = groups[tag] || []).push(item);
  }
  return {
    info: { name: 'KarthikAutomation Practice Store', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Run "Auth > POST /api/auth/login" first; it stores accessToken automatically.' },
    variable: [{ key: 'baseUrl', value: `http://${ctx.req.headers.host || 'localhost:3000'}` }, { key: 'accessToken', value: '' }, { key: 'id', value: '1' }, { key: 'orderNo', value: '' }, { key: 'variantId', value: '1' }, { key: 'productId', value: '1' }],
    item: Object.entries(groups).map(([name, item]) => ({ name, item })),
  };
});

module.exports = { VERSION, dbStats };
