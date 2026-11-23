'use strict';
// Endpoints that back the "Practice" pages (automation playground) and HTTP-level API exercises.
const crypto = require('crypto');
const { route, HttpError } = require('../lib/http');
const { paging, str } = require('../lib/util');

const T = { tag: 'Practice' };

// ---- web table data: 100 deterministic employees
const DEPTS = ['Engineering', 'QA', 'Sales', 'HR', 'Finance', 'Support'];
const CITIES = ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Mumbai', 'Delhi'];
const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Isha', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Karthik', 'Priya'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Patel', 'Khan', 'Das', 'Nair', 'Gupta', 'Singh', 'Rao'];
const EMPLOYEES = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1, name: `${FIRST[i % 12]} ${LAST[(i * 7) % 10]}`, email: `emp${i + 1}@karthikautomation.test`,
  department: DEPTS[(i * 5) % 6], city: CITIES[(i * 3) % 6], salary: 30000 + ((i * 7919) % 120) * 1000,
  joined: new Date(2015 + (i % 10), (i * 5) % 12, 1 + (i % 27)).toISOString().slice(0, 10), active: i % 7 !== 0,
}));

route('GET', '/api/practice/employees', { ...T, summary: 'Web-table data: search, sort, filter, paginate', query: ['q', 'department', 'sort=name|salary|joined|city', 'order=asc|desc', 'page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 10, 100);
  let rows = EMPLOYEES;
  const q = str(ctx.query.q).toLowerCase();
  if (q) rows = rows.filter(e => (e.name + e.email + e.city).toLowerCase().includes(q));
  if (ctx.query.department) rows = rows.filter(e => e.department === ctx.query.department);
  const sort = ctx.query.sort || 'id';
  if (!['id', 'name', 'salary', 'joined', 'city', 'department'].includes(sort)) throw new HttpError(400, 'BAD_QUERY', 'Invalid sort field');
  const dir = ctx.query.order === 'desc' ? -1 : 1;
  rows = [...rows].sort((a, b) => (a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : 0) * dir);
  return { items: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), departments: DEPTS };
});

route('GET', '/api/practice/feed', { ...T, summary: 'Infinite-scroll feed (cursor pagination, 200 items)', query: ['cursor', 'limit'] }, ctx => {
  const cursor = Number(ctx.query.cursor || 0), limit = Math.min(Number(ctx.query.limit || 10), 50);
  const items = Array.from({ length: Math.max(0, Math.min(limit, 200 - cursor)) }, (_, i) => ({ id: cursor + i + 1, title: `Feed item #${cursor + i + 1}`, text: `Tip ${cursor + i + 1}: prefer stable locators like data-testid over CSS classes.` }));
  return { items, nextCursor: cursor + items.length < 200 ? cursor + items.length : null };
});

route('GET', '/api/practice/slow', { ...T, summary: 'Responds after ?ms= milliseconds (max 15000) — practise waits and timeouts', query: ['ms'] }, async ctx => {
  const ms = Math.min(Math.max(Number(ctx.query.ms) || 2000, 0), 15000);
  await new Promise(r => setTimeout(r, ms));
  return { waitedMs: ms, message: 'Thanks for waiting!' };
});

route('GET', '/api/practice/status/:code', { ...T, summary: 'Returns any HTTP status code (100-599)' }, ctx => {
  const code = Number(ctx.params.code);
  if (!Number.isInteger(code) || code < 200 || code > 599) throw new HttpError(400, 'BAD_STATUS', 'Status must be 200–599');
  return { status: code, body: { status: code, message: `You asked for HTTP ${code}` } };
});

route('GET', '/api/practice/flaky', { ...T, summary: 'Fails 50% of the time with 503 — practise retries' }, () => {
  if (Math.random() < 0.5) throw new HttpError(503, 'FLAKY', 'Random failure. Retry me!');
  return { ok: true, message: 'Lucky! This time it worked.' };
});

route('GET', '/api/practice/headers', { ...T, summary: 'Echoes the request headers, method and query' }, ctx => ({ method: ctx.req.method, query: ctx.query, headers: ctx.req.headers }));
route('POST', '/api/practice/echo', { ...T, summary: 'Echoes any JSON body back', csrf: false, body: { hello: 'world', items: [1, 2, 3] } }, ctx => ({ received: ctx.body, receivedAt: new Date().toISOString(), contentType: ctx.req.headers['content-type'] || null }));

route('GET', '/api/practice/redirect', { ...T, summary: '302 redirect to /api/health' }, () => ({ raw: '', status: 302, headers: { Location: '/api/health' } }));

route('GET', '/api/practice/basic-auth', { ...T, summary: 'HTTP Basic auth protected (user: admin / pass: admin)' }, ctx => {
  const h = ctx.req.headers.authorization || '';
  const [user, pass] = Buffer.from(h.replace(/^Basic\s+/i, ''), 'base64').toString().split(':');
  if (!/^Basic /i.test(h) || user !== 'admin' || pass !== 'admin') return { raw: 'Authentication required', status: 401, headers: { 'WWW-Authenticate': 'Basic realm="KarthikAutomation Practice"', 'Content-Type': 'text/plain' } };
  return { authenticated: true, user };
});

route('GET', '/api/practice/api-key', { ...T, summary: 'Requires header X-API-Key: ka-practice-key' }, ctx => {
  if (ctx.req.headers['x-api-key'] !== 'ka-practice-key') throw new HttpError(401, 'API_KEY_INVALID', 'Missing or invalid X-API-Key header');
  return { ok: true, message: 'API key accepted' };
});

route('POST', '/api/practice/upload', {
  ...T, summary: 'Upload a file as JSON {name, type, contentBase64} (max 1 MB)', csrf: false, body: { name: 'hello.txt', type: 'text/plain', contentBase64: 'SGVsbG8gS2FydGhpa0F1dG9tYXRpb24h' },
}, ctx => {
  const name = str(ctx.body.name), b64 = String(ctx.body.contentBase64 || '');
  if (!name) throw new HttpError(422, 'VALIDATION_FAILED', 'File name is required', { name: 'Required' });
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new HttpError(422, 'VALIDATION_FAILED', 'File is empty', { contentBase64: 'Empty file' });
  if (buf.length > 1024 * 1024) throw new HttpError(413, 'FILE_TOO_LARGE', 'Files must be 1 MB or smaller');
  const blocked = /\.(exe|bat|sh|cmd|js)$/i.test(name);
  if (blocked) throw new HttpError(415, 'FILE_TYPE_BLOCKED', 'Executable files are not allowed');
  return { status: 201, body: { name, type: str(ctx.body.type) || 'application/octet-stream', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: new Date().toISOString() } };
});

const FILES = {
  'sample.csv': ['text/csv', 'id,name,price\n1,Banana Robusta,48\n2,Apple Shimla,99\n3,Toned Milk,27\n'],
  'sample.json': ['application/json', JSON.stringify({ store: 'KarthikAutomation', items: [{ id: 1, name: 'Banana Robusta' }, { id: 2, name: 'Apple Shimla' }] }, null, 2)],
  'sample.txt': ['text/plain', 'Hello from KarthikAutomation Practice Store!\nVerify this file was downloaded correctly.\n'],
};
route('GET', '/api/practice/download/:file', { ...T, summary: 'Download sample.csv, sample.json or sample.txt' }, ctx => {
  const f = FILES[ctx.params.file];
  if (!f) throw new HttpError(404, 'NOT_FOUND', 'File not found. Try sample.csv, sample.json or sample.txt');
  return { raw: f[1], headers: { 'Content-Type': f[0] + '; charset=utf-8', 'Content-Disposition': `attachment; filename="${ctx.params.file}"` } };
});

route('GET', '/api/practice/cookies', { ...T, summary: 'Sets a cookie named practice_cookie' }, ctx => {
  ctx.res.setHeader('Set-Cookie', `practice_cookie=ka-${Date.now()}; Path=/; SameSite=Lax; Max-Age=3600`);
  return { ok: true, cookiesReceived: ctx.req.headers.cookie || '' };
});

route('GET', '/api/practice/graph', { ...T, summary: 'Nested JSON for JSONPath / schema-validation practice' }, () => ({
  store: { name: 'KarthikAutomation', open: true, rating: 4.6, address: { city: 'Bengaluru', pincode: '560001' } },
  departments: [
    { name: 'Fruits', manager: { name: 'Asha', since: 2019 }, items: [{ sku: 'F1', price: 48, tags: ['fresh'] }, { sku: 'F2', price: 99, tags: ['fresh', 'imported'] }] },
    { name: 'Dairy', manager: { name: 'Ravi', since: 2021 }, items: [{ sku: 'D1', price: 27, tags: [] }] },
  ],
  nullable: null, emptyList: [], generatedAt: new Date().toISOString(),
}));
