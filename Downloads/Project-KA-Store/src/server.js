'use strict';
/*
 * KarthikAutomation Practice Store
 * A realistic daily-needs supermarket built for automation learning: UI, API, DB and performance testing.
 * Product designed by Karthik Puttoju. For learning purposes only.
 *
 * Zero npm dependencies. Requires Node.js 22.13+ (uses the built-in node:sqlite module).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const { HttpError, send, readBody, parseCookies, routes, securityHeaders, verifyJwt } = require('./lib/http');
const { state, metrics } = require('./lib/state');
const { db, init } = require('./db');

init();
// Register routes (order matters only for identical patterns)
require('./routes/auth');
require('./routes/account');
require('./routes/catalog');
require('./routes/cart');
require('./routes/orders');
require('./routes/admin');
require('./routes/practice');
const { VERSION, dbStats } = require('./routes/dev');
const { COOKIE } = require('./routes/auth');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const QUIET = process.env.QUIET === '1';

// ---------------------------------------------------------------- auth resolution
function resolveSession(req) {
  const bearer = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || parseCookies(req)[COOKIE];
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return { invalid: true };
  const row = db.get('SELECT s.*, s.id AS sid FROM sessions s WHERE s.id = ? AND s.expires_at > ?', payload.sid, new Date().toISOString());
  if (!row) return { invalid: true };
  const user = db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', row.user_id);
  if (!user) return { invalid: true };
  return { session: { id: row.sid, csrf_token: row.csrf_token, expires_at: row.expires_at }, user, via: bearer ? 'bearer' : 'cookie' };
}

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.csv': 'text/csv', '.txt': 'text/plain' };
const cache = new Map();
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { send(req, res, 403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } }); return 403; }
  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  if (!exists) {
    if (path.extname(rel)) { send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain' }); return 404; }
    file = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback
  }
  const stat = fs.statSync(file);
  let entry = cache.get(file);
  if (!entry || entry.mtime !== stat.mtimeMs) {
    const data = fs.readFileSync(file);
    entry = { mtime: stat.mtimeMs, data, gz: zlib.gzipSync(data), etag: '"' + crypto.createHash('md5').update(data).digest('hex') + '"' };
    cache.set(file, entry);
  }
  const ext = path.extname(file);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: entry.etag, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', ...securityHeaders() };
  if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); res.end(); return 304; }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html', '.css', '.js', '.svg', '.json'].includes(ext);
  const body = gz ? entry.gz : entry.data;
  if (gz) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return 200;
}

// ---------------------------------------------------------------- request handler
async function handle(req, res) {
  const t0 = process.hrtime.bigint();
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const reqId = req.headers['x-request-id'] || crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', reqId);
  let routeName = 'static', status = 200;
  try {
    if (state.lab.bugs.memoryLeak) state.leak.push(Buffer.alloc(50 * 1024, 1));
    if (pathname === '/metrics') { routeName = 'GET /metrics'; send(req, res, 200, metrics.prometheus(dbStats()), { 'Content-Type': 'text/plain; version=0.0.4' }); return; }
    if (!pathname.startsWith('/api/')) { status = serveStatic(req, res, pathname); return; }

    const matched = routes.filter(r => r.re.test(pathname));
    const r = matched.find(x => x.method === req.method || (req.method === 'HEAD' && x.method === 'GET'));
    routeName = r ? `${r.method} ${r.pattern}` : `${req.method} (unmatched)`;
    if (req.method === 'OPTIONS' && matched.length) { status = 204; res.writeHead(204, { Allow: [...new Set(matched.map(x => x.method)), 'OPTIONS'].join(', ') }); res.end(); return; }
    if (!matched.length) throw new HttpError(404, 'NOT_FOUND', `No API route for ${req.method} ${pathname}`);
    if (!r) { res.setHeader('Allow', matched.map(x => x.method).join(', ')); throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed on ${pathname}`); }

    // chaos (never on health / lab / metrics so you can always recover)
    if (!/^\/api\/(lab|health|metrics)/.test(pathname)) {
      const extra = (state.lab.latencyMs || 0) + Math.random() * (state.lab.jitterMs || 0) + ((Object.entries(state.lab.slowRoutes || {}).find(([p]) => pathname.startsWith(p)) || [0, 0])[1]);
      if (extra > 0) await new Promise(ok => setTimeout(ok, extra));
      if (state.lab.errorRate > 0 && Math.random() < state.lab.errorRate) throw new HttpError(503, 'CHAOS_INJECTED', 'Service temporarily unavailable (Test Lab errorRate)');
    }

    const params = {};
    const m = r.re.exec(pathname);
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const len = Number(req.headers['content-length'] || 0);
      if ((len > 0 || req.headers['transfer-encoding']) && !/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as JSON with Content-Type: application/json');
      body = await readBody(req);
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_JSON', 'Body must be a JSON object');
    }

    const ctx = { req, res, params, body, query: Object.fromEntries(url.searchParams), user: null, session: null };
    if (r.meta.auth !== 'none') {
      const s = resolveSession(req);
      if (s && !s.invalid) { ctx.user = s.user; ctx.session = s.session; ctx.via = s.via; }
      if (['user', 'admin'].includes(r.meta.auth) && !ctx.user) throw new HttpError(401, s?.invalid ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED', s?.invalid ? 'Your session has expired. Please log in again' : 'Please log in to continue');
      if (r.meta.auth === 'admin' && ctx.user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Admins only');
      // CSRF protection applies to cookie-based sessions only (Bearer tokens are not sent automatically by browsers)
      if (ctx.user && ctx.via === 'cookie' && !['GET', 'HEAD'].includes(req.method) && r.meta.csrf !== false && req.headers['x-csrf-token'] !== ctx.session.csrf_token) {
        throw new HttpError(403, 'CSRF_INVALID', 'Missing or invalid X-CSRF-Token header');
      }
    }

    const result = await r.handler(ctx);
    if (result && typeof result === 'object' && 'raw' in result) {
      status = result.status || 200;
      send(req, res, status, result.raw, result.headers || {});
    } else {
      const wrapped = result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 2 && 'status' in result && 'body' in result;
      status = wrapped ? result.status : 200;
      send(req, res, status, wrapped ? result.body : result);
    }
  } catch (err) {
    status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    const extra = err.code === 'TOO_MANY_ATTEMPTS' ? { 'Retry-After': String(err.details.retryAfterSec) } : {};
    if (!res.headersSent) send(req, res, status, { error: { code: err.code || 'INTERNAL_ERROR', message: status === 500 ? 'Something went wrong on our side' : err.message, details: err.details, requestId: reqId } }, extra);
  } finally {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    metrics.record(routeName, status, ms);
    if (!QUIET && routeName !== 'static') console.log(`${new Date().toISOString()} ${req.method} ${pathname} ${status} ${ms.toFixed(1)}ms`);
  }
}

const server = http.createServer((req, res) => { handle(req, res); });
server.keepAliveTimeout = 65000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`
  ┌──────────────────────────────────────────────────────────────────┐
  │  KarthikAutomation Practice Store v${VERSION}                          │
  │  Learning website for automation practice only                   │
  │  Product designed by Karthik Puttoju                             │
  └──────────────────────────────────────────────────────────────────┘
  Store        http://localhost:${PORT}
  API docs     http://localhost:${PORT}/#/api-docs
  Customer     demo@karthikautomation.test  /  Passw0rd!
  Admin        admin@karthikautomation.test /  Admin@123
  Database     ${db.path}
`);
  });
}

module.exports = { server };
