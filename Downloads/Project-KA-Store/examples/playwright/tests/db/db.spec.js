// Database tests: act through the API, then verify rows directly in SQLite.
// Uses Node's built-in node:sqlite (Node 22.13+). DB path: DB_PATH env or ../../data/store.db
const { test, expect } = require('@playwright/test');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', '..', 'data', 'store.db');
let db;
test.beforeAll(() => { db = new DatabaseSync(DB_FILE, { readOnly: true }); });
test.afterAll(() => db?.close());

async function session(request, email = 'user12@karthikautomation.test') {
  const r = await request.post('/api/auth/login', { data: { email, password: 'Passw0rd!' } });
  const { accessToken, user } = await r.json();
  return { headers: { Authorization: `Bearer ${accessToken}` }, user };
}

test('placing an order writes orders, order_items and reduces stock', async ({ request }) => {
  const { headers, user } = await session(request);
  await request.delete('/api/cart', { headers });
  const variant = db.prepare("SELECT id, stock, price FROM variants WHERE sku = 'KA-DAI-013-2'").get(); // Toned Milk 1 L
  await request.post('/api/cart/items', { headers, data: { variantId: variant.id, qty: 3 } });
  const addr = (await (await request.get('/api/account/addresses', { headers })).json())[0];
  const slot = (await (await request.get('/api/delivery-slots')).json()).flatMap(d => d.slots).find(s => s.available);
  const res = await request.post('/api/checkout', { headers, data: { addressId: addr.id, slotId: slot.id, paymentMethod: 'UPI', upiId: 'success@kaupi' } });
  expect(res.status()).toBe(201);
  const { orderNo } = await res.json();

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  expect(order.user_id).toBe(user.id);
  expect(order.status).toBe('placed');
  expect(order.payment_status).toBe('paid');

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  expect(items).toHaveLength(1);
  expect(items[0].qty).toBe(3);
  expect(items[0].line_total).toBe(variant.price * 3);

  const after = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variant.id).stock;
  expect(after).toBe(variant.stock - 3);
});

test('data integrity: every order subtotal equals the sum of its items', () => {
  const bad = db.prepare(`SELECT o.order_no FROM orders o JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id HAVING ABS(o.subtotal - SUM(oi.line_total)) > 0.01`).all();
  expect(bad).toEqual([]);
});

test('data integrity: no variant has negative stock or price above MRP', () => {
  expect(db.prepare('SELECT COUNT(*) AS n FROM variants WHERE stock < 0 OR price > mrp').get().n).toBe(0);
});

test('passwords are never stored in plain text', () => {
  const plain = db.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash IN ('Passw0rd!', 'Admin@123')").get().n;
  expect(plain).toBe(0);
});
