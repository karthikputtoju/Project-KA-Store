// Performance testing and Security testing pages (they replace the old "Test Lab").
import { state, views, $, $$, app, esc, api, toast, confirmDialog, every, refreshCart, setBusy, refreshView } from './core.js';

// ---------------------------------------------------------------- shared helpers
export const BUG_INFO = {
  // functional / data bugs (shown on Coverage → Bug reporting)
  discountOnMrp: ['Functional', 'Percentage coupons are calculated on MRP instead of the selling price, so customers get too much discount.'],
  caseSensitiveSearch: ['Functional', 'Search becomes case-sensitive: "milk" no longer finds "Toned Milk".'],
  stockNotRestoredOnCancel: ['Database', 'Cancelling an order does not put the stock back. Verify with SQL on variants.stock.'],
  couponMinIgnored: ['Functional', 'Coupon minimum order values are not enforced (SAVE10 works on a ₹48 cart).'],
  wishlistDuplicates: ['Database', 'The same product can be wishlisted twice, creating duplicate rows.'],
  // performance bugs
  slotOverbooking: ['Performance', 'Delivery slot capacity (20 orders) is not enforced. Shows up under concurrent load.'],
  memoryLeak: ['Performance', 'Every request leaks about 50 KB. Heap memory keeps growing during a soak test.'],
  // security bugs
  unsafeSearchEcho: ['Security', 'The search term is rendered as raw HTML on the results page (reflected XSS). The CSP still blocks scripts.'],
  idorOrders: ['Security', 'Any logged-in user can open any order by its number (broken access control / IDOR).'],
  noLoginRateLimit: ['Security', 'Brute-force protection on login is switched off: unlimited password guesses.'],
};

export function bugToggles(keys, cfg) {
  return keys.map(k => `<label class="toggle"><span><b>${k}</b> <span class="pill">${BUG_INFO[k][0]}</span><small>${BUG_INFO[k][1]}</small></span>
    <span class="switch"><input type="checkbox" name="bug" value="${k}" ${cfg.bugs[k] ? 'checked' : ''} data-testid="bug-${k}"><span></span></span></label>`).join('');
}
export async function saveBugs(root) {
  const bugs = Object.fromEntries($$('input[name="bug"]', root).map(i => [i.value, i.checked]));
  state.lab = await api('PUT', '/api/lab/config', { bugs });
  const on = Object.entries(bugs).filter(([, v]) => v).map(([k]) => k);
  toast(on.length ? `Bug switches ON: ${on.join(', ')}` : 'All bug switches on this page are OFF', 'success', 4000);
}
export async function resetAll(after) {
  if (!(await confirmDialog('Reset the database?', 'The database is re-created from seed data (new users, orders and reviews are deleted), every bug switch and chaos setting is turned off and everyone is logged out.', 'Reset everything'))) return;
  await api('POST', '/api/lab/reset');
  state.user = null; state.csrf = null; state.cart = null;
  document.dispatchEvent(new CustomEvent('auth-changed')); await refreshCart();
  toast('Database, bug switches and chaos settings reset', 'success');
  after?.();
}
const header = (key, icon, title, intro) => `<div class="crumbs"><a href="#/coverage">Coverage</a> / <span>${title}</span></div>
  <div class="page-hero" data-testid="${key}-hero"><span class="ph-icon" aria-hidden="true">${icon}</span><div><h1>${title}</h1><p class="muted">${intro}</p></div></div>`;
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };

// ================================================================= PERFORMANCE
views.performance = async () => {
  const [cfg, m] = await Promise.all([api('GET', '/api/lab/config'), api('GET', '/api/metrics')]);
  state.lab = cfg;
  app().innerHTML = `<div class="view" data-testid="page-performance">
    ${header('performance', '📈', 'Performance testing', 'Watch live server metrics, inject latency and failures, switch on performance bugs and fire a quick load test from your browser. Then do it properly with NeoLoad, JMeter or k6.')}
    <div class="kpis" id="kpis" data-testid="perf-metrics"></div>

    <div class="lab-grid">
      <form class="panel" id="chaosForm" data-testid="chaos-form"><h2>1. Chaos controls</h2>
        <p class="muted" style="font-size:.88rem">Applied to every API call except <code>/api/health</code> and <code>/api/metrics</code>.</p>
        <div class="row2">
          <div class="field"><label for="latencyMs">Added latency (ms)</label><input id="latencyMs" type="number" min="0" max="30000" value="${cfg.latencyMs}" data-testid="chaos-latency"></div>
          <div class="field"><label for="jitterMs">Random jitter (ms)</label><input id="jitterMs" type="number" min="0" max="30000" value="${cfg.jitterMs}" data-testid="chaos-jitter"></div>
          <div class="field"><label for="errorRate">Error rate (0 – 1)</label><input id="errorRate" type="number" min="0" max="1" step="0.05" value="${cfg.errorRate}" data-testid="chaos-error-rate"></div>
          <div class="field"><label for="searchCost">Search CPU cost (bottleneck)</label><input id="searchCost" type="number" min="0" max="50000000" step="500000" value="${cfg.searchCost}" data-testid="chaos-search-cost"></div>
        </div>
        <div class="field"><label for="slowCheckout">Extra delay on /api/checkout (ms)</label><input id="slowCheckout" type="number" min="0" max="30000" value="${cfg.slowRoutes['/api/checkout'] || 0}" data-testid="chaos-slow-checkout"></div>
        <h2 style="margin-top:12px">Performance bugs</h2>${bugToggles(['memoryLeak', 'slotOverbooking'], cfg)}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" data-testid="chaos-apply">Apply</button><button type="button" class="btn danger" id="resetBtn" data-testid="reset-all">Reset database & settings</button></div>
      </form>

      <div class="panel" data-testid="quick-load"><h2>2. Quick load test (from your browser)</h2>
        <p class="muted" style="font-size:.88rem">A learning tool, not a real load generator: browsers allow only ~6 parallel connections per site. Use it to see how latency, errors and the CPU bottleneck change the numbers.</p>
        <div class="field"><label for="ltUrl">Endpoint</label><select id="ltUrl" data-testid="load-endpoint">
          <option value="/api/products?q=milk">GET /api/products?q=milk (search)</option><option value="/api/categories">GET /api/categories</option>
          <option value="/api/products/1">GET /api/products/1 (product detail)</option><option value="/api/delivery-slots">GET /api/delivery-slots</option><option value="/api/practice/flaky">GET /api/practice/flaky (50% errors)</option></select></div>
        <div class="row2"><div class="field"><label for="ltN">Total requests</label><input id="ltN" type="number" min="1" max="500" value="100" data-testid="load-requests"></div>
          <div class="field"><label for="ltC">Concurrency</label><input id="ltC" type="number" min="1" max="20" value="6" data-testid="load-concurrency"></div></div>
        <button class="btn" id="ltGo" data-testid="load-run">▶ Run</button>
        <div class="progress" style="margin-top:12px"><i id="ltBar"></i></div>
        <div id="ltOut" data-testid="load-result" style="margin-top:12px"></div>
      </div>
    </div>

    <div class="section-head"><h2>3. Types of performance testing on this store</h2></div>
    <div class="tbl-wrap"><table class="tbl wrap" data-testid="perf-types"><thead><tr><th>Type</th><th>Question it answers</th><th>How to run it here</th><th>Watch</th><th>Pass criteria (example SLA)</th></tr></thead><tbody>
      ${[
        ['Load', 'Does the store meet its SLAs at expected traffic?', 'Ramp 5 → 50 users: 60% browse (home, search, product) + 40% buy (login, cart, checkout).', 'Avg / p90 / p95 response time, throughput, errors', 'Search p95 < 500 ms, checkout p95 < 1.5 s, errors < 1%'],
        ['Stress', 'Where is the breaking point and what breaks first?', 'Set Search CPU cost to 3,000,000, then keep adding users until errors appear.', 'The response-time knee, first failing transaction', 'Fails gracefully (no 500 storm), recovers when load drops'],
        ['Spike', 'Can it survive a sudden rush (e.g. a flash sale)?', 'Jump from 5 to 50 users in 10 s, hold for 1 min, drop back. Repeat.', 'Error burst, recovery time', 'Back to baseline latency within 60 s'],
        ['Soak / endurance', 'Does it degrade over hours?', 'Turn on memoryLeak, run 20 users for 1–2 hours.', 'heapUsed in /api/metrics, latency trend', 'Heap flat, no upward latency trend'],
        ['Concurrency', 'Are shared resources protected?', '30 users book the SAME delivery slot at the same moment (rendezvous point).', 'delivery_slots.booked in the DB', 'Never more than 20 bookings (try with slotOverbooking ON)'],
        ['Scalability', 'How does throughput grow with users?', 'Repeat the load test at 10, 25, 50 users.', 'Throughput vs users, latency vs users', 'Throughput grows roughly linearly until the knee'],
        ['Volume', 'Does a big database slow it down?', 'Create thousands of orders, then load /api/orders and /api/admin/orders.', 'Response time vs table size', 'No more than +20% latency at 10× data'],
        ['Resilience / chaos', 'How do clients behave when the server is slow or failing?', 'Error rate 0.2 + latency 1500 ms, then run the UI tests.', 'Timeouts, retries, duplicate orders', 'No duplicate orders (Idempotency-Key), friendly errors'],
      ].map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${c}</b>` : esc(c)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>

    <div class="two" style="margin-top:20px">
      <div class="panel"><h2>4. Scripting checklist (NeoLoad, JMeter, k6, Gatling)</h2><ul class="list">
        <li><b>Correlation:</b> extract <code>accessToken</code> (login) → <code>Authorization: Bearer</code>; <code>addressId</code>, <code>slotId</code> (delivery-slots) and <code>orderNo</code> (checkout). Browser recordings also need <code>csrfToken</code> → <code>X-CSRF-Token</code>.</li>
        <li><b>Parameterisation:</b> <code>test-data/users.csv</code> (50 users), <code>variants.csv</code>, <code>search-terms.csv</code>.</li>
        <li><b>Validation:</b> assert <code>"total":</code> on search and <code>orderNo</code> on checkout, not just HTTP 200.</li>
        <li><b>Think time:</b> 2–5 s between steps; pacing for buyers.</li>
        <li><b>Transactions:</b> one per business step (T01_Home … T14_Checkout) so the report reads like the user journey.</li>
        <li><b>Data reset:</b> stock and slots run out under heavy load. Reset between runs.</li></ul></div>
      <div class="panel"><h2>5. Ready-made scripts & monitoring</h2><ul class="list">
        <li><b>NeoLoad as Code:</b> <code>examples/neoload/ka-store.nl.yaml</code> (smoke, load, soak, spike).</li>
        <li><b>k6:</b> <code>k6 run examples/k6/load-test.js</code> (thresholds included).</li>
        <li><b>JMeter:</b> record through the HTTP(S) Test Script Recorder, then add JSON Extractors for the values above.</li>
        <li><b>Server metrics:</b> <code>GET /api/metrics</code> (JSON) and <code>GET /metrics</code> (Prometheus format) for request counts, p50–p99 latency, heap and sessions.</li>
        <li><b>Run quietly:</b> start the store with <code>QUIET=1 npm start</code> so logging doesn't skew results.</li></ul></div>
    </div>
  </div>`;

  const paint = x => { const k = $('#kpis'); if (!k) return; k.innerHTML = [['Requests served', x.requests], ['p90 latency', x.latencyMs.p90 + ' ms'], ['p99 latency', x.latencyMs.p99 + ' ms'], ['Server errors', x.serverErrors], ['Active sessions', x.activeSessions], ['Heap used', x.memoryMB.heapUsed + ' MB'], ['Leaked chunks', x.leakedChunks], ['Uptime', x.uptimeSec + ' s']].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join(''); };
  paint(m);
  every(3000, () => api('GET', '/api/metrics').then(paint).catch(() => {}));

  $('#chaosForm').onsubmit = async e => {
    e.preventDefault();
    const slow = Number($('#slowCheckout').value);
    try {
      state.lab = await api('PUT', '/api/lab/config', { latencyMs: Number($('#latencyMs').value), jitterMs: Number($('#jitterMs').value), errorRate: Number($('#errorRate').value), searchCost: Number($('#searchCost').value), slowRoutes: slow ? { '/api/checkout': slow } : {}, bugs: Object.fromEntries($$('input[name="bug"]').map(i => [i.value, i.checked])) });
      toast('Performance settings applied', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#resetBtn').onclick = () => resetAll(refreshView);

  $('#ltGo').onclick = async e => {
    const btn = e.currentTarget, url = $('#ltUrl').value;
    const n = Math.min(500, Math.max(1, Number($('#ltN').value) || 1)), c = Math.min(20, Math.max(1, Number($('#ltC').value) || 1));
    setBusy(btn, true);
    const times = [], codes = {};
    let next = 0, done = 0;
    const t0 = performance.now();
    const worker = async () => {
      while (next < n) {
        next++;
        const s = performance.now();
        let code = 0;
        try { code = (await fetch(url, { cache: 'no-store' })).status; } catch { code = 0; }
        times.push(performance.now() - s);
        codes[code] = (codes[code] || 0) + 1;
        done++;
        const bar = $('#ltBar'); if (bar) bar.style.width = (done / n * 100) + '%';
      }
    };
    await Promise.all(Array.from({ length: c }, worker));
    const total = (performance.now() - t0) / 1000;
    const errors = Object.entries(codes).filter(([k]) => Number(k) >= 400 || Number(k) === 0).reduce((s, [, v]) => s + v, 0);
    const f = v => v.toFixed(1) + ' ms';
    const buckets = [50, 100, 250, 500, 1000, Infinity].map((lim, i, a) => ({ label: i === 0 ? `< ${lim} ms` : lim === Infinity ? `≥ ${a[i - 1]} ms` : `${a[i - 1]}–${lim} ms`, n: times.filter(t => t >= (i ? a[i - 1] : 0) && t < lim).length }));
    const maxB = Math.max(1, ...buckets.map(b => b.n));
    const out = $('#ltOut'); if (!out) return;
    out.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">${[['Throughput', (n / total).toFixed(1) + ' req/s'], ['Average', f(times.reduce((a, b) => a + b, 0) / n)], ['p90', f(pct(times, 90))], ['p95', f(pct(times, 95))], ['Min', f(Math.min(...times))], ['Max', f(Math.max(...times))], ['Errors', `${errors} (${(errors / n * 100).toFixed(1)}%)`], ['Duration', total.toFixed(2) + ' s']].map(([l, v]) => `<div class="kpi"><b data-testid="load-${l.toLowerCase()}">${v}</b><span>${l}</span></div>`).join('')}</div>
      <p style="font-size:.85rem"><b>Status codes:</b> ${Object.entries(codes).map(([k, v]) => `<code>${k === '0' ? 'network error' : k}</code> × ${v}`).join(' · ')}</p>
      <div data-testid="load-histogram">${buckets.map(b => `<div class="bar-row" style="grid-template-columns:110px 1fr 40px"><small>${b.label}</small><div class="bar"><i style="width:${b.n / maxB * 100}%"></i></div><small>${b.n}</small></div>`).join('')}</div>`;
    setBusy(btn, false);
  };
};

// ================================================================= SECURITY
views.security = async () => {
  const cfg = await api('GET', '/api/lab/config');
  state.lab = cfg;
  app().innerHTML = `<div class="view" data-testid="page-security">
    ${header('security', '🛡️', 'Security testing', 'Practise the checks security testers run every day: access control, authentication, session handling, input handling and security headers. Switch on a vulnerability, find it, report it, switch it off.')}
    <div class="form-error" style="margin-bottom:18px" role="note">⚠️ Only test <b>your own local copy</b> of this store. Never run security tools against websites you don't own or have written permission to test.</div>

    <div class="lab-grid">
      <form class="panel" id="secForm" data-testid="security-bugs"><h2>1. Vulnerability switches</h2>
        ${bugToggles(['idorOrders', 'noLoginRateLimit', 'unsafeSearchEcho'], cfg)}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" data-testid="security-apply">Apply</button><button type="button" class="btn danger" id="resetBtn" data-testid="reset-all">Reset database & settings</button></div>
        <h3 style="font-family:var(--font);font-size:.95rem;margin-top:18px">How to prove each one</h3><ul class="list" style="font-size:.88rem">
          <li><b>idorOrders:</b> log in as <code>user1</code> and place an order. Log in as <code>user2</code> and open <code>/#/order/&lt;user1's order no&gt;</code>. It should be 404. With the bug ON you see user1's address and phone.</li>
          <li><b>noLoginRateLimit:</b> send 10 wrong passwords in a row. The 6th should get <code>429 Too Many Requests</code>. With the bug ON every attempt gets 401.</li>
          <li><b>unsafeSearchEcho:</b> search for <code>&lt;b style="color:red"&gt;hi&lt;/b&gt;</code>. Normally it shows as text. With the bug ON it renders as red HTML. A <code>&lt;script&gt;</code> is still blocked by the CSP: that's defence in depth.</li></ul>
      </form>

      <div>
        <div class="panel" data-testid="header-check"><h2>2. Security headers check</h2><p class="muted" style="font-size:.88rem">Fetches <code>/api/health</code> and checks the response headers.</p>
          <button class="btn sm" id="hdrGo" data-testid="headers-run">Run check</button><div id="hdrOut" style="margin-top:12px" data-testid="headers-result"></div></div>
        <div class="panel" style="margin-top:16px" data-testid="jwt-tool"><h2>3. JWT decoder</h2><p class="muted" style="font-size:.88rem">Paste the <code>accessToken</code> from <code>POST /api/auth/login</code>. Decoding is NOT verifying: anyone can read a JWT, so never put secrets inside one.</p>
          <textarea id="jwtIn" class="sql-box" rows="3" placeholder="eyJhbGciOi..." data-testid="jwt-input"></textarea>
          <div style="display:flex;gap:10px;margin-top:8px"><button class="btn sm" id="jwtGo" data-testid="jwt-decode">Decode</button><button class="btn sm ghost" id="jwtGet" data-testid="jwt-sample">Get a demo token</button></div>
          <pre class="code-block" id="jwtOut" style="margin-top:10px;white-space:pre-wrap" data-testid="jwt-output">Header and payload will appear here.</pre></div>
      </div>
    </div>

    <div class="section-head"><h2>4. OWASP Top 10 (2021) mapped to this store</h2></div>
    <div class="tbl-wrap"><table class="tbl wrap" data-testid="owasp-table"><thead><tr><th>OWASP risk</th><th>Where to test here</th><th>How to test</th><th>Expected (secure) result</th></tr></thead><tbody>
      ${[
        ['A01 Broken access control', 'Orders, admin APIs, addresses', 'Open another user\'s order number; call /api/admin/* with a customer token; edit another user\'s address id', '404 for other users\' data, 403 for admin APIs'],
        ['A02 Cryptographic failures', 'users table, session cookie, JWT', 'SELECT password_hash FROM users; inspect cookie flags; decode the JWT', 'Passwords hashed (scrypt + salt), HttpOnly + SameSite cookie, no secrets in the token'],
        ['A03 Injection', 'Search, review form, SQL console', 'Search for <code>\' OR 1=1 --</code>; put <code>&lt;img src=x onerror=alert(1)&gt;</code> in a review title', 'Queries are parameterised (0 results, no error); HTML is shown as text'],
        ['A04 Insecure design', 'Coupons, COD limit, slots', 'Reuse WELCOME50; COD above ₹3,000; book a full slot via the API', 'Business rules enforced on the server, not just the UI'],
        ['A05 Security misconfiguration', 'Response headers, error messages', 'Run the headers check; trigger errors and read the message', 'CSP, X-Frame-Options, nosniff present; no stack traces leaked'],
        ['A06 Vulnerable components', 'examples/* projects', 'npm audit in examples/playwright and examples/cypress', 'No high or critical advisories'],
        ['A07 Identification & auth failures', 'Login, reset password', 'Brute force the login; brute force the OTP; reuse an old token after logout', '429 after 5 failures; OTP locks after 5 tries; old token → 401'],
        ['A08 Software & data integrity', 'JWT signature', 'Change the payload (role: "admin") and resend', '401: signature check fails, and the session row is checked too'],
        ['A09 Logging & monitoring failures', 'audit_log table, admin → Audit log', 'Fail a login, change a price, then look for the events', 'Every security-relevant action is logged with user and time'],
        ['A10 Server-side request forgery', 'n/a', 'The store never fetches URLs supplied by users', 'Not applicable: note it as out of scope in your test plan'],
      ].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
    </tbody></table></div>

    <div class="two" style="margin-top:20px">
      <div class="panel"><h2>5. Security test checklist</h2><ul class="list checks">
        ${['Passwords need 8+ chars with upper, lower, digit and symbol', 'Login errors don\'t reveal whether the email exists', 'Forgot password answers the same for unknown emails', 'Sessions expire (2 h, or 7 days with Remember me)', 'Logout and "log out everywhere" revoke tokens', 'Password change logs out other devices', 'Cookie writes need an X-CSRF-Token header', 'Customers get 403 on every /api/admin/* route', 'Users only see their own orders and addresses', 'Inputs are validated on the server, not only in the UI', 'HTML in user input is escaped when displayed', 'Error responses carry a requestId but no stack trace', 'Disabled accounts cannot log in', 'Request bodies over 2 MB are rejected (413)'].map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="panel"><h2>6. Tools</h2><ul class="list">
        <li><b>Browser DevTools:</b> Network tab for headers and cookies; Application tab for storage.</li>
        <li><b>OWASP ZAP:</b> baseline (passive) scan of <code>http://localhost:3000</code>, then an authenticated scan using the Bearer token.</li>
        <li><b>Burp Suite Community:</b> intercept the checkout request and tamper with <code>addressId</code>, <code>slotId</code> and prices.</li>
        <li><b>Postman / Playwright request / cy.request:</b> automate the access-control and rate-limit checks as regression tests.</li>
        <li><b>jwt.io:</b> the practice JWT secret is public (<code>karthikautomation-practice-secret</code>). Forge an admin token and explain why it still fails.</li>
        <li><b>npm audit:</b> dependency vulnerabilities in the example projects.</li></ul></div>
    </div>
  </div>`;

  $('#secForm').onsubmit = async e => { e.preventDefault(); try { await saveBugs($('#secForm')); } catch (err) { toast(err.message, 'error'); } };
  $('#resetBtn').onclick = () => resetAll(refreshView);
  $('#hdrGo').onclick = async () => {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const h = n => r.headers.get(n);
    const checks = [
      ['Content-Security-Policy', h('content-security-policy'), v => !!v && /default-src 'self'/.test(v), 'Restricts where scripts and styles can load from'],
      ['X-Frame-Options', h('x-frame-options'), v => /DENY|SAMEORIGIN/i.test(v || ''), 'Stops click-jacking in other sites\' iframes'],
      ['X-Content-Type-Options', h('x-content-type-options'), v => v === 'nosniff', 'Stops MIME-type sniffing'],
      ['Referrer-Policy', h('referrer-policy'), v => !!v, 'Limits what URLs leak to other sites'],
      ['Cache-Control (API)', h('cache-control'), v => /no-store/.test(v || ''), 'Private data is not cached'],
      ['X-Request-Id', h('x-request-id'), v => !!v, 'Lets you trace a request in the logs'],
      ['Server banner', h('server') || h('x-powered-by'), v => !v, 'No technology fingerprint (Server / X-Powered-By)'],
    ];
    $('#hdrOut').innerHTML = `<div class="tbl-wrap"><table class="tbl wrap"><thead><tr><th></th><th>Header</th><th>Value</th><th>Why</th></tr></thead><tbody>${checks.map(([n, v, ok, why]) => `<tr data-testid="header-row"><td>${ok(v) ? '✅' : '❌'}</td><td><b>${n}</b></td><td><code style="word-break:break-all">${esc(v || '(not sent)')}</code></td><td><small>${why}</small></td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:.85rem">The session cookie <code>ka_session</code> is set with <b>HttpOnly</b> and <b>SameSite=Lax</b>. JavaScript can't read it; check it in DevTools → Application → Cookies.</p>`;
  };
  const decode = () => {
    const t = $('#jwtIn').value.trim();
    const parts = t.split('.');
    if (parts.length !== 3) { $('#jwtOut').textContent = '❌ Not a JWT: it must have 3 parts separated by dots.'; return; }
    try {
      const b = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
      const head = b(parts[0]), pay = b(parts[1]);
      const exp = pay.exp ? new Date(pay.exp * 1000) : null;
      $('#jwtOut').textContent = `HEADER\n${JSON.stringify(head, null, 2)}\n\nPAYLOAD\n${JSON.stringify(pay, null, 2)}\n\n${exp ? `Expires: ${exp.toLocaleString()} (${exp > new Date() ? 'still valid' : 'EXPIRED'})` : 'No expiry claim!'}\nSignature: ${parts[2].slice(0, 16)}… (verified only by the server)`;
    } catch { $('#jwtOut').textContent = '❌ Could not decode. Is the token complete?'; }
  };
  $('#jwtGo').onclick = decode;
  $('#jwtGet').onclick = async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user30@karthikautomation.test', password: 'Passw0rd!' }), credentials: 'omit' });
    const j = await r.json();
    $('#jwtIn').value = j.accessToken || '';
    decode();
  };
};
