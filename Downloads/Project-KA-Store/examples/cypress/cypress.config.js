const { defineConfig } = require('cypress');
const path = require('path');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    viewportWidth: 1400,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    video: false,
    setupNodeEvents(on) {
      on('task', {
        // Read-only SQL against the store's SQLite file. Needs Node 22.13+ installed on your machine.
        dbQuery({ sql, params = [] }) {
          const { DatabaseSync } = require('node:sqlite');
          const file = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'store.db');
          const db = new DatabaseSync(file, { readOnly: true });
          try { return db.prepare(sql).all(...params).map(r => ({ ...r })); } finally { db.close(); }
        },
      });
    },
  },
});
