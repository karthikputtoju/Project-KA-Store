describe('Authentication', () => {
  it('logs in and out through the UI', () => {
    cy.visit('/#/login');
    cy.getByTestId('input-email').type('demo@karthikautomation.test');
    cy.getByTestId('input-password').type('Passw0rd!', { log: false });
    cy.getByTestId('login-submit').click();
    cy.getByTestId('user-name').should('have.text', 'Demo');
    cy.getByTestId('account-menu').click();
    cy.getByTestId('logout').click();
    cy.getByTestId('nav-login').should('be.visible');
  });

  it('shows an error for a wrong password', () => {
    cy.visit('/#/login');
    cy.getByTestId('input-email').type('demo@karthikautomation.test');
    cy.getByTestId('input-password').type('nope');
    cy.getByTestId('login-submit').click();
    cy.getByTestId('login-error').should('have.text', 'Invalid email or password');
  });

  it('registers a new account (data-driven unique email)', () => {
    const email = `cy${Date.now()}@example.com`;
    cy.visit('/#/register');
    cy.getByTestId('input-name').type('Cypress Student');
    cy.getByTestId('input-email').type(email);
    cy.getByTestId('input-phone').type('9876512345');
    cy.getByTestId('input-password').type('Secret@123');
    cy.getByTestId('input-confirmPassword').type('Secret@123');
    cy.getByTestId('input-acceptTerms').check();
    cy.getByTestId('register-submit').click();
    cy.getByTestId('user-name').should('have.text', 'Cypress');
    // DB check: user row exists with role customer
    cy.task('dbQuery', { sql: 'SELECT role FROM users WHERE email = ?', params: [email] }).its('0.role').should('eq', 'customer');
  });
});
