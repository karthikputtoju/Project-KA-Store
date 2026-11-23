describe('Store API with cy.request', () => {
  let auth;
  before(() => {
    cy.request('POST', '/api/auth/login', { email: 'user15@karthikautomation.test', password: 'Passw0rd!' })
      .then(r => { auth = { Authorization: `Bearer ${r.body.accessToken}` }; });
  });
  beforeEach(() => cy.request({ method: 'DELETE', url: '/api/cart', headers: auth }));

  it('GET /api/categories returns 8 categories', () => {
    cy.request('/api/categories').its('body').should('have.length', 8);
  });

  it('POST /api/cart/items computes totals', () => {
    cy.request({ method: 'POST', url: '/api/cart/items', headers: auth, body: { variantId: 1, qty: 2 } }).then(r => {
      expect(r.status).to.eq(201);
      expect(r.body).to.include({ subtotal: 96, deliveryFee: 30, total: 126 });
    });
  });

  it('negative: expired coupon → 410', () => {
    cy.request({ method: 'POST', url: '/api/cart/items', headers: auth, body: { variantId: 1 } });
    cy.request({ method: 'POST', url: '/api/cart/coupon', headers: auth, body: { code: 'EXPIRED25' }, failOnStatusCode: false })
      .its('status').should('eq', 410);
  });

  it('customer cannot call admin APIs (403)', () => {
    cy.request({ url: '/api/admin/stats', headers: auth, failOnStatusCode: false }).its('status').should('eq', 403);
  });
});
