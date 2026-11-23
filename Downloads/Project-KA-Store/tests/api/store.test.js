'use strict';
/*
 * API + DB tests using Node's built-in test runner (no dependencies).
 * Run: npm test
 * The server runs in-process against a temporary SQLite file, so tests never touch data/store.db.
 */
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ka-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.QUIET = '1';
const { server } = require('../../src/server');
const { db } = require('../../src/db'); // direct DB access for database assertions

let base;
before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise(r => server.close(() => { fs.rmSync(TMP, { recursive: true, force: true }); r(); })));
beforeEach(() => call('POST', '/api/lab/reset'));

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, redirect: 'manual', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}
async function login(email = 'demo@karthikautomation.test', password = 'Passw0rd!') {
  const r = await call('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const auth = { Authorization: `Bearer ${r.body.accessToken}` };
  return { ...r.body, auth, call: (m, u, b, h = {}) => call(m, u, b, { ...auth, ...h }) };
}
const variantStock = id => db.get('SELECT stock FROM variants WHERE id = ?', id).stock;
const slotId = () => db.get("SELECT id FROM delivery_slots WHERE slot_date > date('now','localtime') ORDER BY slot_date, start_time LIMIT 1").id;
async function placeOrder(s, extra = {}, headers = {}) {
  return s.call('POST', '/api/checkout', { addressId: db.get('SELECT id FROM addresses WHERE user_id = ? LIMIT 1', s.user.id).id, slotId: slotId(), paymentMethod: 'UPI', upiId: 'success@kaupi', ...extra }, headers);
}

// ===================================================================== system
describe('System', () => {
  test('health reports UP with database', async () => {
    const r = await call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'UP');
    assert.equal(r.body.database, 'UP');
  });
  test('every response carries security headers and a request id', async () => {
    const r = await call('GET', '/api/health');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy'));
    assert.ok(r.headers.get('x-request-id'));
  });
  test('unknown route → 404, wrong method → 405 with Allow header', async () => {
    assert.equal((await call('GET', '/api/nope')).status, 404);
    const r = await call('DELETE', '/api/categories');
    assert.equal(r.status, 405);
    assert.match(r.headers.get('allow'), /GET/);
  });
  test('non-JSON body → 415, malformed JSON → 400', async () => {
    const a = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' });
    assert.equal(a.status, 415);
    const b = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(b.status, 400);
  });
  test('OpenAPI spec lists the checkout endpoint', async () => {
    const r = await call('GET', '/api/openapi.json');
    assert.equal(r.body.openapi, '3.0.3');
    assert.ok(r.body.paths['/api/checkout'].post);
  });
});

// ===================================================================== auth
describe('Auth', () => {
  test('login returns a JWT with 3 parts and the user role', async () => {
    const s = await login();
    assert.equal(s.accessToken.split('.').length, 3);
    const payload = JSON.parse(Buffer.from(s.accessToken.split('.')[1], 'base64url').toString());
    assert.equal(payload.role, 'customer');
    assert.equal(s.user.email, 'demo@karthikautomation.test');
  });
  test('wrong password → 401, disabled account → 403', async () => {
    assert.equal((await call('POST', '/api/auth/login', { email: 'demo@karthikautomation.test', password: 'wrong' })).status, 401);
    const r = await call('POST', '/api/auth/login', { email: 'locked@karthikautomation.test', password: 'Passw0rd!' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'ACCOUNT_DISABLED');
  });
  test('6th wrong password within a minute is rate limited (429 + Retry-After)', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { email: 'user7@karthikautomation.test', password: 'bad' });
    const r = await call('POST', '/api/auth/login', { email: 'user7@karthikautomation.test', password: 'Passw0rd!' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  });
  test('register validates every field', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'A', email: 'bad', phone: '123', password: 'weak', confirmPassword: 'x', acceptTerms: false });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.body.error.details).sort(), ['acceptTerms', 'confirmPassword', 'email', 'name', 'password', 'phone']);
  });
  test('register creates the user in the DB, sends a welcome email, and rejects duplicates', async () => {
    const body = { name: 'Asha Verma', email: 'asha@example.com', phone: '9876501234', password: 'Secret@123' };
    const r = await call('POST', '/api/auth/register', body);
    assert.equal(r.status, 201);
    const row = db.get('SELECT * FROM users WHERE email = ?', 'asha@example.com');
    assert.equal(row.role, 'customer');
    assert.notEqual(row.password_hash, 'Secret@123', 'password must be hashed');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM emails WHERE to_email = ?', 'asha@example.com').n, 1);
    assert.equal((await call('POST', '/api/auth/register', { ...body, email: 'ASHA@example.com' })).status, 409);
  });
  test('forgot → OTP from mailbox → reset password → old sessions die', async () => {
    const old = await login();
    await call('POST', '/api/auth/forgot-password', { email: 'demo@karthikautomation.test' });
    const mail = (await call('GET', '/api/dev/mailbox?email=demo@karthikautomation.test')).body[0];
    const otp = mail.body.match(/\b(\d{6})\b/)[1];
    assert.equal((await call('POST', '/api/auth/reset-password', { email: 'demo@karthikautomation.test', otp: '000000', newPassword: 'NewPass@123' })).status, 400);
    const r = await call('POST', '/api/auth/reset-password', { email: 'demo@karthikautomation.test', otp, newPassword: 'NewPass@123' });
    assert.equal(r.status, 200);
    assert.equal((await old.call('GET', '/api/cart')).status, 401, 'old token must be revoked');
    await login('demo@karthikautomation.test', 'NewPass@123');
  });
  test('forgot-password gives the same answer for unknown emails (no user enumeration)', async () => {
    const a = await call('POST', '/api/auth/forgot-password', { email: 'demo@karthikautomation.test' });
    const b = await call('POST', '/api/auth/forgot-password', { email: 'nobody@karthikautomation.test' });
    assert.deepEqual(a.body, b.body);
  });
  test('logout revokes the token', async () => {
    const s = await login();
    await s.call('POST', '/api/auth/logout');
    assert.equal((await s.call('GET', '/api/cart')).status, 401);
  });
  test('a tampered JWT is rejected', async () => {
    const s = await login();
    const [h, p] = s.accessToken.split('.');
    const forged = `${h}.${p}.invalidsignature`;
    assert.equal((await call('GET', '/api/cart', undefined, { Authorization: `Bearer ${forged}` })).status, 401);
  });
});

// ===================================================================== catalog
describe('Catalog', () => {
  test('categories have product counts', async () => {
    const r = await call('GET', '/api/categories');
    assert.equal(r.body.length, 8);
    assert.ok(r.body.every(c => c.productCount > 0));
  });
  test('search is case-insensitive and paginated', async () => {
    const r = await call('GET', '/api/products?q=MILK&pageSize=5');
    assert.ok(r.body.total >= 1);
    assert.ok(r.body.items.some(p => p.name === 'Toned Milk'));
  });
  test('price filter + sort price-asc returns ascending prices within range', async () => {
    const r = await call('GET', '/api/products?minPrice=50&maxPrice=200&sort=price-asc&pageSize=48');
    const prices = r.body.items.map(p => Math.min(...p.variants.map(v => v.price)));
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
    assert.ok(prices.every(p => p >= 50 && p <= 200));
  });
  test('boundary: pageSize 48 ok, 49 rejected; minPrice > maxPrice rejected', async () => {
    assert.equal((await call('GET', '/api/products?pageSize=48')).status, 200);
    assert.equal((await call('GET', '/api/products?pageSize=49')).status, 400);
    assert.equal((await call('GET', '/api/products?minPrice=100&maxPrice=10')).status, 400);
  });
  test('product detail has variants with discount %', async () => {
    const r = await call('GET', '/api/products/1');
    assert.equal(r.body.name, 'Banana Robusta');
    assert.equal(r.body.variants[0].discountPct, 20);
  });
  test('a user can review once; rating average is recalculated in the DB', async () => {
    const s = await login('user9@karthikautomation.test');
    const r = await s.call('POST', '/api/products/13/reviews', { rating: 5, title: 'Fresh milk', body: 'Always fresh and on time.' });
    assert.equal(r.status, 201);
    const p = db.get('SELECT rating_avg, rating_count FROM products WHERE id = 13');
    assert.equal(p.rating_count, r.body.productRatingCount);
    assert.equal((await s.call('POST', '/api/products/13/reviews', { rating: 4, title: 'Again', body: 'Trying to review twice.' })).status, 409);
  });
});

// ===================================================================== cart & coupons
describe('Cart & coupons', () => {
  test('cart requires login', async () => assert.equal((await call('GET', '/api/cart')).status, 401));
  test('add to cart computes subtotal, savings and delivery fee', async () => {
    const s = await login();
    const r = await s.call('POST', '/api/cart/items', { variantId: 1, qty: 2 }); // 2 × ₹48 (MRP 60)
    assert.equal(r.status, 201);
    assert.equal(r.body.subtotal, 96);
    assert.equal(r.body.productSavings, 24);
    assert.equal(r.body.deliveryFee, 30);
    assert.equal(r.body.total, 126);
  });
  test('free delivery at ₹499 and above (boundary)', async () => {
    const s = await login();
    const r = await s.call('POST', '/api/cart/items', { variantId: db.get("SELECT id FROM variants WHERE sku = 'KA-STA-021-1'").id, qty: 2 }); // atta 5 kg ₹249 × 2 = ₹498
    assert.equal(r.body.deliveryFee, 30);
    const r2 = await s.call('POST', '/api/cart/items', { variantId: db.get("SELECT id FROM variants WHERE sku = 'KA-STA-025-1'").id, qty: 1 }); // + salt ₹25
    assert.equal(r2.body.deliveryFee, 0);
  });
  test('max 10 per item, out-of-stock and insufficient stock', async () => {
    const s = await login();
    assert.equal((await s.call('POST', '/api/cart/items', { variantId: 1, qty: 11 })).body.error.code, 'QTY_LIMIT');
    const mango = db.get("SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE p.name = 'Alphonso Mango'").id;
    assert.equal((await s.call('POST', '/api/cart/items', { variantId: mango })).status, 409);
    const xl = db.get("SELECT id, stock FROM variants WHERE label LIKE 'Size XL%'");
    assert.equal((await s.call('POST', '/api/cart/items', { variantId: xl.id, qty: xl.stock + 1 })).body.error.code, 'INSUFFICIENT_STOCK');
  });
  test('coupon rules: unknown 404, expired 410, minimum order 422, first-order-only', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 1 }); // ₹48
    assert.equal((await s.call('POST', '/api/cart/coupon', { code: 'NOPE' })).status, 404);
    assert.equal((await s.call('POST', '/api/cart/coupon', { code: 'EXPIRED25' })).status, 410);
    assert.equal((await s.call('POST', '/api/cart/coupon', { code: 'SAVE10' })).body.error.code, 'MIN_ORDER_NOT_MET');
    await s.call('PATCH', '/api/cart/items/1', { qty: 5 }); // ₹240
    assert.equal((await s.call('POST', '/api/cart/coupon', { code: 'WELCOME50' })).body.error.code, 'FIRST_ORDER_ONLY'); // demo has orders
  });
  test('FRESH20 discounts only fruit & veg items, capped at ₹150', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 2 });   // banana ₹96 (fruit)
    await s.call('POST', '/api/cart/items', { variantId: db.get("SELECT id FROM variants WHERE sku = 'KA-DAI-013-2'").id, qty: 2 }); // milk ₹108 (not fruit)
    const r = await s.call('POST', '/api/cart/coupon', { code: 'fresh20' });
    assert.equal(r.body.discount, 19.2); // 20% of 96
  });
});

// ===================================================================== checkout & orders (with DB checks)
describe('Checkout & orders', () => {
  test('checkout validates address, slot and payment fields', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    const r = await s.call('POST', '/api/checkout', { paymentMethod: 'CARD', card: { number: '1234', expiry: '13/99', cvv: '1', name: '' } });
    assert.equal(r.status, 422);
    for (const k of ['addressId', 'slotId', 'cardNumber', 'cardExpiry', 'cardCvv', 'cardName']) assert.ok(r.body.error.details[k], k);
  });
  test('successful order: 201, stock reduced, slot booked, cart emptied, email sent (DB verified)', async () => {
    const s = await login();
    const before = variantStock(1);
    const sid = slotId();
    const bookedBefore = db.get('SELECT booked FROM delivery_slots WHERE id = ?', sid).booked;
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 3 });
    const r = await placeOrder(s);
    assert.equal(r.status, 201);
    assert.match(r.body.orderNo, /^KA\d{8}-\d+$/);
    assert.equal(variantStock(1), before - 3);
    assert.equal(db.get('SELECT booked FROM delivery_slots WHERE id = ?', sid).booked, bookedBefore + 1);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?', s.user.id).n, 0);
    const order = db.get('SELECT * FROM orders WHERE order_no = ?', r.body.orderNo);
    assert.equal(order.payment_status, 'paid');
    const itemsSum = db.get('SELECT SUM(line_total) AS s FROM order_items WHERE order_id = ?', order.id).s;
    assert.equal(itemsSum, order.subtotal, 'order subtotal must equal the sum of its items');
    assert.ok(db.get("SELECT 1 FROM emails WHERE to_email = ? AND subject LIKE ?", s.user.email, `%${r.body.orderNo}%`));
  });
  test('payment failures: UPI declined 402, card declined 402, gateway 502 — cart kept', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    assert.equal((await placeOrder(s, { upiId: 'failure@kaupi' })).status, 402);
    assert.equal((await placeOrder(s, { paymentMethod: 'CARD', card: { number: '4000000000000002', expiry: '12/30', cvv: '123', name: 'Demo' } })).status, 402);
    assert.equal((await placeOrder(s, { paymentMethod: 'CARD', card: { number: '4000000000000119', expiry: '12/30', cvv: '123', name: 'Demo' } })).status, 502);
    assert.equal((await s.call('GET', '/api/cart')).body.itemCount, 1);
  });
  test('COD is refused above ₹3000', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: db.get("SELECT id FROM variants WHERE sku = 'KA-STA-022-2'").id, qty: 5 }); // rice 5 kg ₹649 × 5
    const r = await placeOrder(s, { paymentMethod: 'COD' });
    assert.equal(r.status, 422);
    assert.match(r.body.error.details.paymentMethod, /3000/);
  });
  test('Idempotency-Key prevents a duplicate order', async () => {
    const s = await login();
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    const a = await placeOrder(s, {}, { 'Idempotency-Key': 'retry-123' });
    const b = await placeOrder(s, {}, { 'Idempotency-Key': 'retry-123' });
    assert.equal(a.body.orderNo, b.body.orderNo);
    assert.equal(b.body.replayed, true);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?', 'retry-123').n, 1);
  });
  test('cancel restores stock; cancelling twice is refused', async () => {
    const s = await login();
    const before = variantStock(1);
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 2 });
    const o = (await placeOrder(s)).body;
    const r = await s.call('POST', `/api/orders/${o.orderNo}/cancel`, { reason: 'Ordered by mistake' });
    assert.equal(r.body.status, 'cancelled');
    assert.equal(r.body.payment.status, 'refunded');
    assert.equal(variantStock(1), before);
    assert.equal((await s.call('POST', `/api/orders/${o.orderNo}/cancel`, { reason: 'again' })).status, 409);
  });
  test('users cannot see each other’s orders (IDOR → 404)', async () => {
    const a = await login('user1@karthikautomation.test');
    await a.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    const o = (await placeOrder(a)).body;
    const b = await login('user2@karthikautomation.test');
    assert.equal((await b.call('GET', `/api/orders/${o.orderNo}`)).status, 404);
  });
  test('invoice downloads as an attachment', async () => {
    const s = await login();
    const order = db.get('SELECT order_no FROM orders WHERE user_id = ? LIMIT 1', s.user.id).order_no;
    const r = await s.call('GET', `/api/orders/${order}/invoice`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="invoice-/);
  });
});

// ===================================================================== admin & roles
describe('Admin', () => {
  test('customers get 403 on admin APIs', async () => {
    const s = await login();
    assert.equal((await s.call('GET', '/api/admin/stats')).status, 403);
  });
  test('admin moves an order through valid transitions only', async () => {
    const c = await login();
    await c.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    const o = (await placeOrder(c)).body;
    const a = await login('admin@karthikautomation.test', 'Admin@123');
    assert.equal((await a.call('PATCH', `/api/admin/orders/${o.orderNo}/status`, { status: 'delivered' })).status, 409);
    for (const st of ['confirmed', 'packed', 'out_for_delivery', 'delivered']) assert.equal((await a.call('PATCH', `/api/admin/orders/${o.orderNo}/status`, { status: st })).status, 200, st);
    assert.equal(db.get('SELECT status FROM orders WHERE order_no = ?', o.orderNo).status, 'delivered');
    // customer can now return it
    assert.equal((await c.call('POST', `/api/orders/${o.orderNo}/return`, { reason: 'Item damaged' })).body.status, 'return_requested');
  });
  test('admin creates a product; price above MRP is rejected', async () => {
    const a = await login('admin@karthikautomation.test', 'Admin@123');
    const bad = await a.call('POST', '/api/admin/products', { name: 'Honey', brand: 'Bee', categorySlug: 'staples', description: 'Raw honey', variants: [{ label: '500 g', mrp: 100, price: 120, stock: 5 }] });
    assert.equal(bad.status, 422);
    const ok = await a.call('POST', '/api/admin/products', { name: 'Organic Honey', brand: 'BeeNatural', categorySlug: 'staples', emoji: '🍯', description: 'Raw forest honey', variants: [{ label: '500 g', mrp: 399, price: 349, stock: 25 }] });
    assert.equal(ok.status, 201);
    assert.ok(db.get("SELECT 1 FROM audit_log WHERE action = 'admin.product_create' AND entity_id = ?", String(ok.body.id)));
  });
});

// ===================================================================== security & lab
describe('Security & Test Lab', () => {
  test('cookie session without X-CSRF-Token → 403', async () => {
    const r = await call('POST', '/api/auth/login', { email: 'demo@karthikautomation.test', password: 'Passw0rd!' });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const noCsrf = await call('POST', '/api/cart/items', { variantId: 1 }, { Cookie: cookie });
    assert.equal(noCsrf.status, 403);
    const withCsrf = await call('POST', '/api/cart/items', { variantId: 1 }, { Cookie: cookie, 'X-CSRF-Token': r.body.csrfToken });
    assert.equal(withCsrf.status, 201);
  });
  test('DB console only allows SELECT', async () => {
    assert.equal((await call('POST', '/api/dev/db/query', { sql: 'DELETE FROM users' })).status, 422);
    const r = await call('POST', '/api/dev/db/query', { sql: 'SELECT COUNT(*) AS n FROM users' });
    assert.ok(r.body.rows[0].n >= 50);
  });
  test('lab bug "stockNotRestoredOnCancel" is detectable with a DB check', async () => {
    await call('PUT', '/api/lab/config', { bugs: { stockNotRestoredOnCancel: true } });
    const s = await login();
    const before = variantStock(1);
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 2 });
    const o = (await placeOrder(s)).body;
    await s.call('POST', `/api/orders/${o.orderNo}/cancel`, { reason: 'testing' });
    assert.equal(variantStock(1), before - 2, 'bug active: stock was not restored');
  });
  test('lab errorRate=1 → 503 on APIs but health stays UP', async () => {
    await call('PUT', '/api/lab/config', { errorRate: 1 });
    assert.equal((await call('GET', '/api/products')).status, 503);
    assert.equal((await call('GET', '/api/health')).status, 200);
  });
  test('practice endpoints: basic auth, api key, status codes, redirect', async () => {
    assert.equal((await call('GET', '/api/practice/basic-auth')).status, 401);
    assert.equal((await call('GET', '/api/practice/basic-auth', undefined, { Authorization: 'Basic ' + Buffer.from('admin:admin').toString('base64') })).status, 200);
    assert.equal((await call('GET', '/api/practice/api-key', undefined, { 'X-API-Key': 'ka-practice-key' })).status, 200);
    assert.equal((await call('GET', '/api/practice/status/418')).status, 418);
    const red = await call('GET', '/api/practice/redirect');
    assert.equal(red.status, 302);
    assert.equal(red.headers.get('location'), '/api/health');
  });
});

// ===================================================================== seeded bugs used on the Coverage / Security pages
describe('Seeded bugs behave as documented', () => {
  test('caseSensitiveSearch: "milk" finds nothing, "Milk" still works', async () => {
    await call('PUT', '/api/lab/config', { bugs: { caseSensitiveSearch: true } });
    assert.equal((await call('GET', '/api/products?q=milk')).body.total, 0);
    assert.ok((await call('GET', '/api/products?q=Milk')).body.total >= 1);
  });
  test('discountOnMrp: FRESH20 gives ₹24 instead of ₹19.20 (BUG-101)', async () => {
    await call('PUT', '/api/lab/config', { bugs: { discountOnMrp: true } });
    const s = await login();
    await s.call('DELETE', '/api/cart');
    await s.call('POST', '/api/cart/items', { variantId: 1, qty: 2 });
    await s.call('POST', '/api/cart/items', { variantId: db.get("SELECT id FROM variants WHERE sku = 'KA-DAI-013-2'").id, qty: 2 });
    assert.equal((await s.call('POST', '/api/cart/coupon', { code: 'FRESH20' })).body.discount, 24);
  });
  test('idorOrders: another user can read the order only while the bug is ON (BUG-106)', async () => {
    const a = await login('user1@karthikautomation.test');
    await a.call('POST', '/api/cart/items', { variantId: 1, qty: 1 });
    const o = (await placeOrder(a)).body;
    const b = await login('user2@karthikautomation.test');
    assert.equal((await b.call('GET', `/api/orders/${o.orderNo}`)).status, 404);
    await call('PUT', '/api/lab/config', { bugs: { idorOrders: true } });
    const leak = await b.call('GET', `/api/orders/${o.orderNo}`);
    assert.equal(leak.status, 200);
    assert.equal(leak.body.shipTo.name, o.shipTo.name);
  });
  test('noLoginRateLimit: 10 wrong passwords never get 429', async () => {
    await call('PUT', '/api/lab/config', { bugs: { noLoginRateLimit: true } });
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/auth/login', { email: 'user8@karthikautomation.test', password: 'bad' })).status, 401);
  });
});
