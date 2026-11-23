describe('Practice playground', () => {
  it('works inside an iframe', () => {
    cy.visit('/#/practice/frames');
    cy.get('#frame-one').its('0.contentDocument.body').should('not.be.empty').then(cy.wrap).within(() => {
      cy.getByTestId('frame-name').type('Karthik');
      cy.getByTestId('frame-submit').click();
    });
    cy.getByTestId('frame-message').should('contain', 'Karthik');
  });

  it('handles confirm and prompt dialogs', () => {
    cy.visit('/#/practice/alerts');
    cy.on('window:confirm', () => false);
    cy.getByTestId('btn-confirm').click();
    cy.getByTestId('alert-result').should('have.text', 'You clicked Cancel');
    cy.window().then(win => cy.stub(win, 'prompt').returns('Cypress'));
    cy.getByTestId('btn-prompt').click();
    cy.getByTestId('alert-result').should('have.text', 'Hello, Cypress!');
  });

  it('reaches into shadow DOM', () => {
    cy.visit('/#/practice/shadow-dom');
    cy.getByTestId('shadow-input', { includeShadowDom: true }).type('SAVE10');
    cy.getByTestId('shadow-button', { includeShadowDom: true }).click();
    cy.getByTestId('shadow-message', { includeShadowDom: true }).should('have.text', 'Coupon accepted ✅');
  });

  it('opens a "new tab" link in the same tab (Cypress pattern)', () => {
    cy.visit('/#/practice/windows');
    cy.getByTestId('link-new-tab').invoke('removeAttr', 'target').click();
    cy.getByTestId('new-window-title').should('contain', 'new tab');
  });

  it('uploads a file', () => {
    cy.visit('/#/practice/upload-download');
    cy.getByTestId('file-input').selectFile({ contents: Cypress.Buffer.from('hello automation'), fileName: 'notes.txt', mimeType: 'text/plain' });
    cy.getByTestId('upload-button').click();
    cy.getByTestId('upload-success').should('contain', 'notes.txt · 16 bytes');
  });

  it('waits for a delayed element', () => {
    cy.visit('/#/practice/dynamic');
    cy.getByTestId('btn-start-delay').click();
    cy.getByTestId('delayed-element', { timeout: 8000 }).should('be.visible');
  });
});
