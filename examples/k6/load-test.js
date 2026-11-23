// k6 load test — install k6 (https://k6.io) then:  k6 run examples/k6/load-test.js
// Options: BASE_URL=http://localhost:3000 k6 run -e VUS=20 examples/k6/load-test.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const users = new SharedArray('users', () => open('../../test-data/users.csv').split('\n').slice(1).filter(Boolean).map(l => l.split(',')));

export const options = {
  scenarios: {
    browse: { executor: 'ramping-vus', exec: 'browse', startVUs: 0, stages: [{ duration: '1m', target: Number(__ENV.VUS || 20) }, { duration: '3m', target: Number(__ENV.VUS || 20) }, { duration: '30s', target: 0 }] },
    buy: { executor: 'constant-vus', exec: 'buy', vus: 5, duration: '4m', startTime: '30s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:search}': ['p(95)<500'],
    'http_req_duration{name:checkout}': ['p(95)<1500'],
  },
};

export function browse() {
  group('home', () => {
    check(http.get(`${BASE}/api/categories`), { 'categories 200': r => r.status === 200 });
    http.get(`${BASE}/api/products?sort=relevance&pageSize=10`);
  });
  sleep(1);
  const terms = ['milk', 'rice', 'banana', 'atta', 'tea'];
  const res = http.get(`${BASE}/api/products?q=${terms[Math.floor(Math.random() * terms.length)]}`, { tags: { name: 'search' } });
  check(res, { 'search 200': r => r.status === 200, 'has results': r => r.json('total') > 0 });
  sleep(2);
  http.get(`${BASE}/api/products/${1 + Math.floor(Math.random() * 55)}`, { tags: { name: 'product' } });
  sleep(1);
}

export function buy() {
  const [email, password] = users[(__VU - 1) % users.length];
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } });
  check(login, { 'login 200': r => r.status === 200 });
  const auth = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.json('accessToken')}` } };
  const addressId = http.get(`${BASE}/api/account/addresses`, auth).json('0.id');
  http.del(`${BASE}/api/cart`, null, auth);
  http.post(`${BASE}/api/cart/items`, JSON.stringify({ variantId: 1 + Math.floor(Math.random() * 20), qty: 1 }), auth);
  sleep(1);
  const slots = http.get(`${BASE}/api/delivery-slots`).json();
  const slot = slots.flatMap(d => d.slots).find(s => s.available);
  const order = http.post(`${BASE}/api/checkout`, JSON.stringify({ addressId, slotId: slot.id, paymentMethod: 'UPI', upiId: 'success@kaupi' }), { ...auth, tags: { name: 'checkout' } });
  check(order, { 'order 201 (or 409 when stock/slot runs out)': r => r.status === 201 || r.status === 409 });
  sleep(3);
}
