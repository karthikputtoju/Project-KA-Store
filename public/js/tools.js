import { state, views, $, $$, app, esc, api, toast, confirmDialog, every, refreshCart } from './core.js';

// The old Test Lab is now split into Performance and Security pages (testing.js). Keep the URL working.
views.lab = () => { location.replace('#/performance'); };

// ---------------------------------------------------------------- DB explorer
const SAMPLE_SQL = [
  ['Latest orders', 'SELECT order_no, status, total, payment_method, created_at FROM orders ORDER BY created_at DESC LIMIT 10'],
  ['Stock of a product', "SELECT p.name, v.label, v.sku, v.stock FROM variants v JOIN products p ON p.id = v.product_id WHERE p.name LIKE '%Banana%'"],
  ['Order with items', "SELECT o.order_no, oi.product_name, oi.variant_label, oi.qty, oi.line_total FROM orders o JOIN order_items oi ON oi.order_id = o.id ORDER BY o.id DESC LIMIT 15"],
  ['Users & order counts', 'SELECT u.email, u.role, u.is_active, COUNT(o.id) AS orders FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id ORDER BY orders DESC LIMIT 10'],
  ['Duplicate wishlist rows (bug check)', 'SELECT user_id, product_id, COUNT(*) AS n FROM wishlist GROUP BY user_id, product_id HAVING n > 1'],
  ['Order total check', 'SELECT o.order_no, o.subtotal, SUM(oi.line_total) AS items_sum, o.subtotal - SUM(oi.line_total) AS diff FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id HAVING ABS(diff) > 0.01'],
  ['Latest emails', 'SELECT to_email, subject, created_at FROM emails ORDER BY id DESC LIMIT 10'],
  ['Audit trail', 'SELECT a.action, u.email, a.entity, a.entity_id, a.created_at FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 15'],
];
views.db = async () => {
  const schema = await api('GET', '/api/dev/db/schema');
  app().innerHTML = `<div class="view" data-testid="page-db"><h1>Database explorer</h1>
    <p class="muted">The store uses a real <b>SQLite</b> database file (<code>data/store.db</code>). Run read-only queries here, or connect any SQLite client (DB Browser for SQLite, DBeaver, VS Code SQLite extension) to the same file.</p>
    <div class="co-grid" style="grid-template-columns:280px 1fr"><aside class="panel" style="max-height:72vh;overflow:auto" data-testid="db-schema"><h2>Tables</h2>${schema.map(t => `<details data-testid="db-table-${t.table}"><summary style="cursor:pointer;padding:6px 0;font-weight:700">${t.table} <small class="muted">(${t.rows})</small></summary><ul style="margin:0 0 8px;padding-left:18px;font-size:.82rem">${t.columns.map(c => `<li>${c.pk ? '🔑 ' : ''}<code>${c.name}</code> <small class="muted">${c.type}${c.notNull ? ' NOT NULL' : ''}</small></li>`).join('')}</ul><button class="btn sm ghost" data-peek="${t.table}">SELECT * LIMIT 20</button></details>`).join('')}</aside>
    <section><div class="panel"><div class="field"><label for="sql">SQL (SELECT only)</label><textarea id="sql" class="sql-box" data-testid="sql-input">${SAMPLE_SQL[0][1]}</textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn" id="run" data-testid="sql-run">▶ Run query</button><select id="samples" style="width:auto" data-testid="sql-samples" aria-label="Sample queries"><option value="">Sample queries…</option>${SAMPLE_SQL.map(([l], i) => `<option value="${i}">${l}</option>`).join('')}</select><span class="muted" id="sqlInfo" data-testid="sql-info"></span></div></div>
      <div id="sqlOut" style="margin-top:16px" data-testid="sql-result"></div></section></div></div>`;
  const run = async () => {
    try {
      const r = await api('POST', '/api/dev/db/query', { sql: $('#sql').value });
      if (!$('#sqlOut')) return;
      $('#sqlInfo').textContent = `${r.rowCount} row(s) in ${r.timeMs} ms${r.truncated ? ' (showing 500)' : ''}`;
      $('#sqlOut').innerHTML = r.rows.length ? `<div class="tbl-wrap"><table class="tbl" data-testid="sql-table"><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(row => `<tr>${r.columns.map(c => `<td>${esc(row[c] ?? 'NULL')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted" data-testid="sql-empty">Query returned no rows.</p>';
    } catch (err) { if (!$('#sqlOut')) return; $('#sqlInfo').textContent = ''; $('#sqlOut').innerHTML = `<div class="form-error" data-testid="sql-error">${esc(err.message)}</div>`; }
  };
  $('#run').onclick = run;
  $('#sql').onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); };
  $('#samples').onchange = e => { if (e.target.value) { $('#sql').value = SAMPLE_SQL[e.target.value][1]; run(); } };
  $$('[data-peek]').forEach(b => (b.onclick = () => { $('#sql').value = `SELECT * FROM ${b.dataset.peek} LIMIT 20`; run(); }));
  run();
};

// ---------------------------------------------------------------- API docs
views['api-docs'] = async () => {
  const spec = await api('GET', '/api/openapi.json');
  const groups = {};
  for (const [p, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) (groups[op.tags[0]] = groups[op.tags[0]] || []).push({ m: m.toUpperCase(), p, op });
  const base = location.origin;
  app().innerHTML = `<div class="view" data-testid="page-api-docs"><h1>API documentation</h1>
    <p class="muted">${Object.values(groups).flat().length} endpoints. Everything the UI does goes through this REST API, so you can test the same flows with Postman, REST Assured, Playwright <code>request</code> or <code>cy.request()</code>.</p>
    <div class="two"><div class="panel"><h2>Quick start</h2><pre class="code-block" data-testid="api-quickstart">curl -X POST ${base}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"demo@karthikautomation.test","password":"Passw0rd!"}'

# use the accessToken from the response:
curl ${base}/api/cart -H "Authorization: Bearer &lt;accessToken&gt;"</pre></div>
      <div class="panel"><h2>Downloads & rules</h2><p><a class="btn sm ghost" href="/api/openapi.json" target="_blank" data-testid="openapi-link">OpenAPI 3 spec</a> <a class="btn sm ghost" href="/api/postman.json" download="karthikautomation.postman_collection.json" data-testid="postman-link">Postman collection</a></p>
        <ul style="font-size:.9rem;line-height:1.7;padding-left:18px"><li>Send JSON with <code>Content-Type: application/json</code> (else <b>415</b>).</li><li>Bearer token auth needs <b>no</b> CSRF header. Cookie sessions (browser) need <code>X-CSRF-Token</code> on writes.</li><li>Errors look like <code>{"error":{"code","message","details","requestId"}}</code>.</li><li><code>POST /api/checkout</code> accepts an <code>Idempotency-Key</code> header.</li><li>The JWT secret is public (<code>karthikautomation-practice-secret</code>) — try forging a token as a security exercise.</li></ul></div></div>
    ${Object.entries(groups).map(([tag, list]) => `<div class="section-head"><h2>${esc(tag)}</h2></div>${list.map(({ m, p, op }) => `<details class="endpoint" data-testid="endpoint"><summary><span class="mth ${m}">${m}</span><code>${esc(p)}</code><span class="muted" style="font-size:.85rem">${esc(op.summary)}</span>${op.security ? `<span class="lock">🔒 ${op.description ? 'admin' : 'login'}</span>` : ''}</summary>
      <div class="ebody">${op.parameters.length ? `<p><b>Parameters:</b> ${op.parameters.map(x => `<code>${esc(x.name)}</code> <small class="muted">(${x.in}${x.description ? ': ' + esc(x.description) : ''})</small>`).join(', ')}</p>` : ''}${op.requestBody ? `<p><b>Example body</b></p><pre class="code-block">${esc(JSON.stringify(op.requestBody.content['application/json'].example, null, 2))}</pre>` : ''}</div></details>`).join('')}`).join('')}
  </div>`;
};

views.notFound = (msg = 'The page you are looking for does not exist.') => {
  app().innerHTML = `<div class="view" data-testid="page-not-found"><div class="empty panel"><span class="big">🧺</span><h1>404</h1><p class="muted">${esc(msg)}</p><a class="btn" href="#/">Back to home</a></div></div>`;
};
