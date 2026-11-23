'use strict';
// Tiny zero-dependency HTTP toolkit: errors, router (with OpenAPI metadata), body parsing, responses, JWT.
const zlib = require('zlib');
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const bad = (code, message, details) => new HttpError(422, code, message, details);

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'self'",
  };
}

function send(req, res, status, body, extra = {}) {
  if (status === 204 || status === 304) { res.writeHead(status, { ...securityHeaders(), ...extra }); res.end(); return; }
  const isText = typeof body === 'string' || Buffer.isBuffer(body);
  let payload = isText ? body : JSON.stringify(body);
  const headers = { 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...securityHeaders(), ...extra };
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && Buffer.byteLength(payload) > 1024) {
    payload = zlib.gzipSync(payload); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = Buffer.byteLength(payload);
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function readBody(req, max = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${Math.round(max / 1024)} KB`)); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'INVALID_JSON', 'Body must be valid JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

// ---- router
const routes = [];
/**
 * route('GET', '/api/products/:id', { tag, summary, auth: 'none'|'optional'|'user'|'admin', csrf, query, body }, handler)
 */
function route(method, pattern, meta, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, pattern, re, keys, meta: { auth: 'none', ...meta }, handler });
}

// ---- JWT (HS256). The secret is intentionally well-known: decoding/forging tokens is a security-testing exercise.
const JWT_SECRET = process.env.JWT_SECRET || 'karthikautomation-practice-secret';
const b64u = b => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (sig.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]))) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    return p;
  } catch { return null; }
}

module.exports = { HttpError, bad, send, readBody, parseCookies, route, routes, securityHeaders, signJwt, verifyJwt };
