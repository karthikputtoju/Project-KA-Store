import './commands';
// Reset the database to seed data once per spec file
before(() => cy.request('POST', '/api/lab/reset'));
