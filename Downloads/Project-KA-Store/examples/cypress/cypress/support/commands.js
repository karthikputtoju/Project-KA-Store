// cy.getByTestId('login-submit')
Cypress.Commands.add('getByTestId', (id, opts) => cy.get(`[data-testid="${id}"]`, opts));

// Fast login through the API. cy.request stores the session cookie, so cy.visit() is logged in.
// Saves the CSRF token as an alias (@csrf) for later cy.request writes.
Cypress.Commands.add('loginByApi', (email = 'demo@karthikautomation.test', password = 'Passw0rd!') => {
  return cy.request('POST', '/api/auth/login', { email, password }).then(res => {
    expect(res.status).to.eq(200);
    cy.wrap(res.body.csrfToken).as('csrf');
    cy.wrap(res.body.accessToken).as('token');
  });
});

// Empty the cart via API (cookie session => needs the CSRF header)
Cypress.Commands.add('emptyCart', () => {
  cy.get('@csrf').then(csrf => cy.request({ method: 'DELETE', url: '/api/cart', headers: { 'X-CSRF-Token': csrf } }));
});
