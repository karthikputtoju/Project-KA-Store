// Runs once before all tests: make sure the store is up and reset the database to seed data.
module.exports = async config => {
  const base = config.projects[0].use.baseURL;
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) {
    try { ok = (await fetch(base + '/api/health')).ok; } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!ok) throw new Error(`Store is not running at ${base}. Start it with "npm start" in the project root.`);
  const r = await fetch(base + '/api/lab/reset', { method: 'POST' });
  if (!r.ok) throw new Error('Could not reset the database: ' + r.status);
};
