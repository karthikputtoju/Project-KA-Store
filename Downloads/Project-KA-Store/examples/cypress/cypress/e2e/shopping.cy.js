describe('Shopping journey', () => {
  beforeEach(() => {
    cy.loginByApi();
    cy.emptyCart();
  });

  it('search → add → coupon → checkout with UPI → order in DB', () => {
    cy.visit('/');
    cy.getByTestId('search-input').type('banana{enter}');
    cy.getByTestId('result-count').should('contain', 'for “banana”');
    cy.contains('[data-testid="product-card"]', 'Banana Robusta').within(() => {
      cy.getByTestId('add-to-cart').click();
      cy.getByTestId('qty-increase').click();
      cy.getByTestId('qty-value').should('have.text', '2');
    });
    cy.getByTestId('cart-count').should('have.text', '2');

    cy.getByTestId('nav-cart').click();
    cy.getByTestId('coupon-input').type('FRESH20');
    cy.getByTestId('coupon-apply').click();
    cy.getByTestId('summary-discount').should('have.text', '−₹19.20');
    cy.getByTestId('checkout-button').click();

    cy.get('[data-testid^="slot-day-"]').eq(1).click();
    cy.get('[data-testid="slot-list"] input:not(:disabled)').first().check({ force: true });
    cy.getByTestId('pay-upi').check();
    cy.getByTestId('input-upiId').clear().type('success@kaupi');
    cy.getByTestId('place-order').click();

    cy.getByTestId('order-success').should('be.visible');
    cy.getByTestId('order-number').invoke('text').then(orderNo => {
      cy.task('dbQuery', { sql: 'SELECT status, payment_status, coupon_code FROM orders WHERE order_no = ?', params: [orderNo.trim()] })
        .its(0).should('deep.equal', { status: 'placed', payment_status: 'paid', coupon_code: 'FRESH20' });
    });
  });

  it('stubs the products API to show the empty state (network mocking)', () => {
    cy.intercept('GET', '/api/products?*', { statusCode: 200, body: { items: [], page: 1, pageSize: 12, total: 0, totalPages: 1 } }).as('products');
    cy.visit('/#/shop?q=anything');
    cy.wait('@products');
    cy.getByTestId('no-results').should('be.visible');
  });

  it('shows an error when the API fails (500 stub)', () => {
    cy.intercept('GET', '/api/products?*', { statusCode: 500, body: { error: { code: 'BOOM', message: 'Server exploded' } } });
    cy.visit('/#/shop');
    cy.getByTestId('load-error').should('contain', 'Server exploded');
  });
});
