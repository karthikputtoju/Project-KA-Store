// API tests with Playwright's request fixture (no browser needed).
const { test, expect } = require('@playwright/test');

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

test.describe('Store API', () => {
  test.beforeAll(async ({ request }) => {
    const r = await request.post('/api/auth/login', { data: { email: 'user11@karthikautomation.test', password: 'Passw0rd!' } });
    expect(r.status()).toBe(200);
    token = (await r.json()).accessToken;
  });
  test.beforeEach(async ({ request }) => { await request.delete('/api/cart', { headers: auth() }); });

  test('GET /api/products supports search + pagination', async ({ request }) => {
    const r = await request.get('/api/products', { params: { q: 'rice', pageSize: 5 } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body).toMatchObject({ page: 1, pageSize: 5 });
    expect(body.items[0]).toHaveProperty('variants');
    expect(body.items.map(p => p.name)).toContain('Basmati Rice');
  });

  test('POST /api/cart/items → 201 and correct totals', async ({ request }) => {
    const r = await request.post('/api/cart/items', { headers: auth(), data: { variantId: 1, qty: 2 } });
    expect(r.status()).toBe(201);
    const cart = await r.json();
    expect(cart.subtotal).toBe(96);
    expect(cart.deliveryFee).toBe(30);
    expect(cart.total).toBe(126);
  });

  test('negative: quantity above 10 → 422 QTY_LIMIT', async ({ request }) => {
    const r = await request.post('/api/cart/items', { headers: auth(), data: { variantId: 1, qty: 11 } });
    expect(r.status()).toBe(422);
    expect((await r.json()).error.code).toBe('QTY_LIMIT');
  });

  test('chained: add → checkout → get order → cancel', async ({ request }) => {
    await request.post('/api/cart/items', { headers: auth(), data: { variantId: 3, qty: 1 } });
    const addresses = await (await request.get('/api/account/addresses', { headers: auth() })).json();
    const days = await (await request.get('/api/delivery-slots')).json();
    const slot = days.flatMap(d => d.slots).find(s => s.available);
    const order = await request.post('/api/checkout', { headers: { ...auth(), 'Idempotency-Key': `pw-${Date.now()}` }, data: { addressId: addresses[0].id, slotId: slot.id, paymentMethod: 'COD' } });
    expect(order.status()).toBe(201);
    const { orderNo } = await order.json();

    const detail = await request.get(`/api/orders/${orderNo}`, { headers: auth() });
    expect((await detail.json()).payment).toMatchObject({ method: 'COD', status: 'pending' });

    const cancel = await request.post(`/api/orders/${orderNo}/cancel`, { headers: auth(), data: { reason: 'API test' } });
    expect((await cancel.json()).status).toBe('cancelled');
  });

  test('security: no token → 401, customer on admin API → 403', async ({ request }) => {
    expect((await request.get('/api/cart')).status()).toBe(401);
    expect((await request.get('/api/admin/stats', { headers: auth() })).status()).toBe(403);
  });

  test('response time of product search is under 500 ms', async ({ request }) => {
    const t = Date.now();
    await request.get('/api/products?q=milk');
    expect(Date.now() - t).toBeLessThan(500);
  });
});
