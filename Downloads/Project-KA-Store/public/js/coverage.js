// Coverage hub: the whole software testing life cycle (STLC) for this store, ready to execute.
import { state, views, $, $$, app, esc, api, toast, refreshView } from './core.js';
import { STLC, MATRIX, TYPES, BUSINESS, SCENARIOS, CASES, REQUIREMENTS, SAMPLE_BUGS, LIFECYCLE, LIFECYCLE_SIDE } from './coverage-data.js';
import { bugToggles, saveBugs, resetAll } from './testing.js';

const TABS = [
  ['overview', '🧭 Overview'], ['plan', '📄 Test plan'], ['business', '💼 Business cases'], ['scenarios', '🗺️ Scenarios'],
  ['cases', '✅ Test cases'], ['data', '🧾 Test data'], ['bugs', '🐞 Bug reporting'], ['traceability', '🔗 Traceability'],
];
const TYPE_COLS = ['Manual', 'Automation', 'Security', 'API', 'Performance', 'AI'];
const automated = c => !/^Manual$/.test(c[9]);
const shell = (tab, inner) => `<div class="view" data-testid="page-coverage">
  <div class="page-hero"><span class="ph-icon" aria-hidden="true">📋</span><div><h1>Test coverage</h1>
    <p class="muted">Everything a tester produces across the testing life cycle for this store: plan, business cases, scenarios, test cases, test data, bug reports and traceability. Written for this exact app, so you can execute every line.</p></div></div>
  <div class="cov-stats" data-testid="coverage-stats">${[[REQUIREMENTS.length, 'Requirements'], [BUSINESS.length, 'Business cases'], [SCENARIOS.length, 'Scenarios'], [CASES.length, 'Test cases'], [CASES.filter(automated).length, 'Automated / scripted'], [SAMPLE_BUGS.length, 'Sample bug reports']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
  <nav class="cov-tabs" role="tablist" aria-label="Coverage sections" data-testid="coverage-tabs">${TABS.map(([k, l]) => `<a role="tab" href="#/coverage/${k}" aria-selected="${k === tab}" data-testid="coverage-tab-${k}">${l}</a>`).join('')}</nav>
  <div class="cov-body" data-testid="coverage-${tab}">${inner}</div></div>`;

const table = (heads, rows, testid, cls = '') => `<div class="tbl-wrap"><table class="tbl wrap ${cls}" data-testid="${testid}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

views.coverage = async (params, tab = 'overview') => {
  if (!RENDER[tab]) return views.notFound('Unknown coverage section.');
  await RENDER[tab](params);
};

const RENDER = {
  // ============================================================== overview
  overview: () => {
    app().innerHTML = shell('overview', `
      <h2 class="cov-h">Software testing life cycle (STLC)</h2>
      <ol class="stlc" data-testid="stlc">${STLC.map(([n, name, what, out, entry, exit]) => `<li><span class="n">${n}</span><b>${name}</b><p>${what}</p><small><b>Deliverables:</b> ${out}</small><small><b>Entry:</b> ${entry}</small><small><b>Exit:</b> ${exit}</small></li>`).join('')}</ol>

      <h2 class="cov-h">Coverage matrix: what each testing type covers</h2>
      <p class="muted">Rows are the store's features; columns are the six testing types. "—" means the type adds little value for that feature. Click a column heading for the detailed explanation below.</p>
      ${table(['Feature', ...TYPE_COLS.map((t, i) => `<a href="#type-${TYPES[i].key}" data-jump="${TYPES[i].key}">${TYPES[i].icon} ${t}</a>`)], MATRIX.map(r => `<tr data-testid="matrix-row"><td><b>${esc(r[0])}</b></td>${r.slice(1).map(c => `<td class="${c === '—' ? 'muted' : ''}">${c === '—' ? '—' : '✔ ' + esc(c)}</td>`).join('')}</tr>`), 'coverage-matrix', 'matrix')}

      <h2 class="cov-h">The six testing types explained</h2>
      ${table(['Type', 'What it is', 'Best for', 'Tools'], TYPES.map(t => `<tr><td><a href="#type-${t.key}" data-jump="${t.key}"><b>${t.icon} ${t.name}</b></a></td><td>${esc(t.what)}</td><td>${esc(t.when)}</td><td>${esc(t.tools)}</td></tr>`), 'types-summary')}
      <div class="type-cards">${TYPES.map(t => `<article class="panel type-card" id="type-${t.key}" data-testid="type-${t.key}">
        <h3>${t.icon} ${t.name}</h3>
        <dl class="def"><dt>What</dt><dd>${esc(t.what)}</dd><dt>Why it matters</dt><dd>${esc(t.why)}</dd><dt>When to use it</dt><dd>${esc(t.when)}</dd>
          <dt>Techniques</dt><dd><ul>${t.techniques.map(x => `<li>${esc(x)}</li>`).join('')}</ul></dd>
          <dt>Tools</dt><dd>${esc(t.tools)}</dd>
          <dt>Practise it on this store</dt><dd><ul>${t.here.map(x => `<li>${esc(x)}</li>`).join('')}</ul></dd>
          <dt>Deliverable</dt><dd>${esc(t.deliverable)}</dd></dl>
        ${{ performance: '<a class="btn sm" href="#/performance">Open Performance testing →</a>', security: '<a class="btn sm" href="#/security">Open Security testing →</a>', api: '<a class="btn sm" href="#/api-docs">Open API docs →</a>', automation: '<a class="btn sm" href="#/practice">Open Practice playground →</a>', manual: '<a class="btn sm" href="#/coverage/cases">Open test cases →</a>', ai: '<a class="btn sm" href="#/coverage/data">Copy the business rules →</a>' }[t.key]}
      </article>`).join('')}</div>`);
    $$('[data-jump]').forEach(a => (a.onclick = e => { e.preventDefault(); document.getElementById('type-' + a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  },

  // ============================================================== test plan
  plan: () => {
    const sec = (n, title, body) => `<section class="doc-sec" data-testid="plan-section"><h3><span class="n">${n}</span>${title}</h3>${body}</section>`;
    app().innerHTML = shell('plan', `<div class="panel doc" data-testid="test-plan">
      <div class="doc-head"><div><h2 style="margin:0">Test plan: KarthikAutomation Practice Store v2.0</h2><small class="muted">Document ID TP-KA-001 · Version 1.0 · Author: QA team · Status: Approved</small></div><button class="btn sm ghost" id="printPlan" data-testid="print-plan">🖨 Print / save as PDF</button></div>
      ${sec(1, 'Objective', '<p>Confirm that customers can register, shop, pay and manage orders correctly, securely and fast enough, and that admins can run the store, before release.</p>')}
      ${sec(2, 'Scope', table(['In scope', 'Out of scope'], [`<tr><td><ul><li>Registration, login, password reset, sessions</li><li>Search, filters, product pages, reviews, wishlist</li><li>Cart, coupons, checkout, payments (simulated), delivery slots</li><li>Orders: tracking, cancel, return, reorder, invoice</li><li>Account: profile, addresses, security</li><li>Admin panel, emails (test mailbox), database integrity</li><li>REST API, security (OWASP Top 10), performance (50 users)</li></ul></td><td><ul><li>Real payment gateways and real deliveries</li><li>Native mobile apps (responsive web only)</li><li>Localisation (English / INR only)</li><li>Third-party fonts and CDN availability</li><li>SSRF (the app never fetches user URLs)</li></ul></td></tr>`], 'plan-scope'))}
      ${sec(3, 'Test approach', table(['Level / type', 'Approach', 'Owner'], [
        ['Unit / component', 'Developers (not part of this plan)', 'Dev'], ['API', 'Automated first: tests/api + Postman; every endpoint positive, negative, boundary', 'QA'],
        ['UI functional', 'Manual first for new features, then Playwright/Cypress for stable P1/P2 flows', 'QA'], ['Database', 'SQL checks after each business case; integrity queries after every run', 'QA'],
        ['Security', 'OWASP Top 10 checklist, ZAP baseline scan, access-control regression tests', 'QA + Security'], ['Performance', 'NeoLoad/k6: load, stress, spike, soak, concurrency (see Performance page)', 'Perf engineer'],
        ['Accessibility', 'Keyboard-only pass + axe/Lighthouse on key pages', 'QA'], ['Exploratory', '60-minute charters per feature, especially checkout and admin', 'QA'], ['AI-assisted', 'AI drafts scenarios/data/code; a tester reviews and runs everything', 'QA'],
      ].map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`), 'plan-approach'))}
      ${sec(4, 'Test environment', '<ul><li><b>App:</b> local build, <code>npm start</code> on http://localhost:3000, Node.js 22.13+</li><li><b>Database:</b> SQLite <code>data/store.db</code>, reset to seed data before each cycle (<code>POST /api/lab/reset</code>)</li><li><b>Browsers:</b> Chrome (primary), Firefox, Safari, Edge; mobile emulation 390 px</li><li><b>Accounts:</b> see the Test data tab (customer, admin, 50 load users, disabled user)</li></ul>')}
      ${sec(5, 'Entry and exit criteria', table(['Entry criteria', 'Exit criteria'], [`<tr><td><ul><li>Requirements reviewed</li><li>Build deployed and smoke test passes</li><li>Test data seeded</li><li>Test cases reviewed</li></ul></td><td><ul><li>100% of P1 and ≥ 95% of P2 test cases executed</li><li>No open Critical/High bugs (or accepted by the product owner)</li><li>All performance SLAs met</li><li>No High OWASP findings open</li><li>Test summary report signed off</li></ul></td></tr>`], 'plan-criteria'))}
      ${sec(6, 'Suspension and resumption', '<p>Suspend testing if the smoke test fails, the database cannot be reset, or a blocker stops more than 30% of the cases. Resume after a new build passes the smoke test.</p>')}
      ${sec(7, 'Schedule (6 weeks)', table(['Week', 'Activities'], [['1', 'Requirement analysis, test plan, environment setup'], ['2', 'Test design: scenarios, cases, data, RTM'], ['3', 'Functional + API execution, cycle 1'], ['4', 'Automation of P1/P2 flows, DB checks, bug fixing'], ['5', 'Security + performance testing, regression cycle 2'], ['6', 'Final regression, exit criteria review, test summary report']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`), 'plan-schedule'))}
      ${sec(8, 'Roles and responsibilities', '<ul><li><b>QA lead:</b> plan, estimates, reporting, sign-off</li><li><b>QA engineers:</b> design, manual + automated execution, bug reporting</li><li><b>Performance engineer:</b> workload model, scripts, analysis</li><li><b>Developers:</b> fix bugs, unit tests, support environment</li><li><b>Product owner:</b> clarify rules, prioritise bugs, accept risks</li></ul>')}
      ${sec(9, 'Risks and mitigation', table(['Risk', 'Impact', 'Mitigation'], [['Shared test data changes between runs', 'Flaky results', 'Reset the DB before each cycle; create unique data per test'], ['Time-based logic (slot cut-off, OTP expiry)', 'Results differ by time of day', 'Pick tomorrow\'s slots; document the time of each run'], ['Stock and slots run out during load tests', 'False failures', 'Reset between runs; count 409s separately'], ['Limited automation skills', 'Slow automation', 'Page objects + examples in /examples'], ['AI-generated tests are wrong', 'False confidence', 'Every AI artefact is reviewed and executed before use']].map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`), 'plan-risks'))}
      ${sec(10, 'Deliverables', '<ul><li>Test plan (this document)</li><li>Business cases, scenarios and test cases (CSV export on the Test cases tab)</li><li>Test data sheet</li><li>Requirement traceability matrix</li><li>Bug reports</li><li>Automation suites and CI reports</li><li>Performance and security reports</li><li>Test summary report</li></ul>')}
      ${sec(11, 'Defect management', '<p>Bugs are logged with the template on the Bug reporting tab, triaged daily by severity and priority, fixed, retested and closed. A Critical/High bug blocks release unless the product owner accepts the risk in writing.</p>')}
      ${sec(12, 'Metrics reported', '<ul><li>Test cases planned / executed / passed / failed / blocked</li><li>Requirement and automation coverage % (Traceability tab)</li><li>Defects by severity, module and status; defect density; reopen rate</li><li>Performance: p90/p95 per transaction, throughput, error rate</li></ul>')}
    </div>`);
    $('#printPlan').onclick = () => window.print();
  },

  // ============================================================== business cases
  business: () => {
    app().innerHTML = shell('business', `<p class="muted">End-to-end business cases follow a real customer or admin goal across UI, API, database and email. They are the backbone of UAT and of the most valuable automated E2E tests.</p>
      <div class="bc-grid">${BUSINESS.map(([id, title, actor, steps, layers, outcome, types], i) => `<article class="panel bc" style="--i:${i}" data-testid="business-case">
        <div class="bc-head"><span class="pill">${id}</span><small class="muted">Actor: ${esc(actor)}</small></div>
        <h3>${esc(title)}</h3>
        <ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <p><b>Layers verified:</b> ${esc(layers)}</p><p><b>Expected outcome:</b> ${esc(outcome)}</p>
        <p class="bc-types">${types.split(', ').map(t => `<span class="tag-type">${esc(t)}</span>`).join('')}</p></article>`).join('')}</div>`);
  },

  // ============================================================== scenarios
  scenarios: () => {
    app().innerHTML = shell('scenarios', `<p class="muted">A test scenario is a one-line <i>what to test</i>. Each one expands into several test cases (<i>how to test</i>). Click a linked test case to jump to it.</p>
      ${table(['ID', 'Module', 'Scenario', 'Type', 'Priority', 'Test cases'], SCENARIOS.map(r => `<tr data-testid="scenario-row"><td><b>${r[0]}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td><span class="prio ${r[4].toLowerCase()}">${r[4]}</span></td><td>${r[5].split(', ').map(t => `<a href="#/coverage/cases?q=${t}">${t}</a>`).join(', ')}</td></tr>`), 'scenarios-table')}`);
  },

  // ============================================================== test cases
  cases: params => {
    const modules = [...new Set(CASES.map(c => c[1]))];
    const types = [...new Set(CASES.map(c => c[8]))];
    const f = { q: params.get('q') || '', module: '', type: '', prio: '' };
    app().innerHTML = shell('cases', `<div class="toolbar" style="align-items:flex-end">
        <div class="field" style="margin:0;flex:1;min-width:200px"><label for="tcQ">Search</label><input id="tcQ" value="${esc(f.q)}" placeholder="ID, title, data…" data-testid="cases-search"></div>
        <div class="field" style="margin:0"><label for="tcM">Module</label><select id="tcM" data-testid="cases-module"><option value="">All</option>${modules.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label for="tcT">Type</label><select id="tcT" data-testid="cases-type"><option value="">All</option>${types.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label for="tcP">Priority</label><select id="tcP" data-testid="cases-priority"><option value="">All</option><option>P1</option><option>P2</option><option>P3</option></select></div>
        <button class="btn ghost" id="csv" data-testid="cases-download">⬇ Download CSV</button></div>
      <p class="muted" id="tcInfo" data-testid="cases-count"></p>
      <div class="tbl-wrap"><table class="tbl wrap cases" data-testid="cases-table"><thead><tr><th>ID</th><th>Module</th><th>Title</th><th>Precondition</th><th>Steps</th><th>Test data</th><th>Expected result</th><th>Priority</th><th>Type</th><th>Automation</th></tr></thead><tbody id="tcBody"></tbody></table></div>
      <div class="panel" style="margin-top:18px"><h2>Writing good test cases</h2><ul class="list"><li>One objective per case; a title that starts with a verb.</li><li>Preconditions and test data written out, so anyone can run it.</li><li>Numbered steps; one observable expected result per check.</li><li>Priority = business impact (P1 money / security / login; P3 cosmetic).</li><li>Link every case to a scenario and requirement (see Traceability).</li></ul></div>`);
    const rows = () => CASES.filter(c => (!f.module || c[1] === f.module) && (!f.type || c[8] === f.type) && (!f.prio || c[7] === f.prio) && (!f.q || c.join(' ').toLowerCase().includes(f.q.toLowerCase())));
    const paint = () => {
      const list = rows();
      $('#tcInfo').textContent = `Showing ${list.length} of ${CASES.length} test cases · ${list.filter(automated).length} automated or scripted`;
      $('#tcBody').innerHTML = list.map(c => `<tr data-testid="case-row" id="${c[0]}"><td><b>${c[0]}</b></td><td>${esc(c[1])}</td><td>${esc(c[2])}</td><td>${esc(c[3])}</td><td><ol class="tc-steps">${c[4].split(' | ').map(s => `<li>${esc(s)}</li>`).join('')}</ol></td><td><code class="td">${esc(c[5])}</code></td><td>${esc(c[6])}</td><td><span class="prio ${c[7].toLowerCase()}">${c[7]}</span></td><td>${esc(c[8])}</td><td>${c[9] === 'Manual' ? '<span class="pill">Manual</span>' : `<span class="pill on">${esc(c[9])}</span>`}</td></tr>`).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">No test cases match.</td></tr>';
    };
    $('#tcQ').oninput = e => { f.q = e.target.value; paint(); };
    $('#tcM').onchange = e => { f.module = e.target.value; paint(); };
    $('#tcT').onchange = e => { f.type = e.target.value; paint(); };
    $('#tcP').onchange = e => { f.prio = e.target.value; paint(); };
    $('#csv').onclick = () => {
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const csv = ['ID,Module,Title,Precondition,Steps,Test data,Expected result,Priority,Type,Automation,Status,Actual result'].concat(rows().map(c => [...c.map((v, i) => (i === 4 ? v.split(' | ').map((s, j) => `${j + 1}. ${s}`).join('\n') : v)), '', ''].map(q).join(','))).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      a.download = 'karthikautomation-test-cases.csv';
      document.body.appendChild(a); a.click(); a.remove();
      toast('Test cases downloaded (open in Excel or Google Sheets)', 'success');
    };
    paint();
  },

  // ============================================================== test data
  data: () => {
    const t = (title, heads, rows, id) => `<div class="panel" style="margin-bottom:16px"><h2>${title}</h2>${table(heads, rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`), id)}</div>`;
    app().innerHTML = shell('data', `<p class="muted">All data below exists after a database reset. Never depend on data another test creates: create your own (e.g. a unique email with a timestamp) or reset first.</p>
      ${t('Accounts', ['Role', 'Email', 'Password', 'Use for'], [
        ['Customer', '<code>demo@karthikautomation.test</code>', '<code>Passw0rd!</code>', 'Has past orders and 2 addresses (WELCOME50 is NOT allowed)'],
        ['Admin', '<code>admin@karthikautomation.test</code>', '<code>Admin@123</code>', 'Admin panel, role checks'],
        ['Load users', '<code>user1</code> … <code>user50@karthikautomation.test</code>', '<code>Passw0rd!</code>', 'Parallel / load tests (test-data/users.csv)'],
        ['Disabled', '<code>locked@karthikautomation.test</code>', '<code>Passw0rd!</code>', 'Negative login test (403)'],
        ['New customer', 'any unique email, e.g. <code>student+&lt;timestamp&gt;@example.com</code>', 'e.g. <code>Secret@123</code>', 'First-order coupon WELCOME50'],
      ], 'data-accounts')}
      ${t('Payments', ['Method', 'Value', 'Result'], [
        ['UPI', '<code>success@kaupi</code>', 'Paid'], ['UPI', '<code>failure@kaupi</code>', '402 "UPI payment was declined by your bank"'], ['UPI', '<code>timeout@kaupi</code>', '504 timeout, not charged'],
        ['Card', '<code>4111 1111 1111 1111</code> · any future MM/YY · any 3-digit CVV', 'Paid'], ['Card', '<code>4000 0000 0000 0002</code>', '402 declined'], ['Card', '<code>4000 0000 0000 9995</code>', '402 insufficient funds'],
        ['Card', '<code>4000 0000 0000 0119</code>', '502 gateway error'], ['Card', '<code>4111 1111 1111 1112</code> (fails Luhn)', '422 invalid number'], ['Card', 'Expiry in the past, e.g. <code>01/20</code>', '422 expired'], ['COD', 'Order total ≤ ₹3,000', 'Allowed; payment "pending" until delivered'],
      ], 'data-payments')}
      ${t('Business rules (copy these into an AI assistant to generate test ideas)', ['Rule', 'Value', 'Boundary values to test'], [
        ['Free delivery', 'Subtotal after coupon ≥ ₹499, else ₹30 fee', '₹498 · ₹499 · ₹500'], ['Max units per item', '10', '9 · 10 · 11'], ['COD limit', 'Total ≤ ₹3,000', '₹3,000 · ₹3,000.01'],
        ['Slot cut-off', 'Book ≥ 60 min before the slot starts', '61 min · 59 min before'], ['Slot capacity', '20 orders', '19 · 20 · 21st order'], ['Cancel allowed', 'Placed, confirmed, packed', 'Out for delivery → refused'],
        ['Return window', '≤ 7 days after delivery', 'Day 7 · day 8'], ['Saved addresses', 'Max 5', '5th · 6th'], ['Login lockout', '5 failures in 60 s', '5th · 6th attempt'], ['OTP', '6 digits, 10 minutes, 5 attempts', '5 digits · 11 minutes · 6th attempt'],
        ['Password', '8+ chars, upper, lower, digit, symbol', '7 · 8 chars; each rule missing'], ['Mobile', '10 digits starting 6–9', '9 digits · starts with 5'], ['PIN code', '6 digits, not starting with 0', '5 · 6 · 7 digits · 012345'], ['Review title / body', '3–80 / 10–1000 chars', '2 · 3 · 80 · 81 chars'], ['Product list pageSize', '1–48', '0 · 48 · 49'],
      ], 'data-rules')}
      ${t('Coupons', ['Code', 'Rule', 'Example'], [
        ['<code>WELCOME50</code>', '₹50 off, first order only, min ₹199', 'New user, cart ₹200 → −₹50'], ['<code>SAVE10</code>', '10% off up to ₹100, min ₹299', 'Cart ₹300 → −₹30; cart ₹1,500 → −₹100 (cap)'],
        ['<code>FRESH20</code>', '20% off Fruits & Vegetables items only, max ₹150', 'Banana ₹96 + Milk ₹108 → −₹19.20'], ['<code>FREEDEL</code>', 'Free delivery', 'Cart ₹100 → delivery ₹0'], ['<code>EXPIRED25</code>', 'Expired', '410 "This coupon has expired"'], ['<code>NOPE</code>', 'Does not exist', '404 "This coupon code does not exist"'],
      ], 'data-coupons')}
      ${t('Products with special states', ['Product', 'Why it is useful'], [
        ['Alphonso Mango (1 kg)', 'Out of stock (stock 0): negative add-to-cart'], ['Baby Diaper Pants, Size XL', 'Only 3 in stock: insufficient-stock test'], ['Green Grapes, Tender Coconut Water', 'Low stock (8, 6): "Hurry, only N left!"'],
		['Banana Robusta', 'Two pack sizes; fruit category (FRESH20)'], ['Farm Eggs', 'Non-veg marker; three pack sizes'], ['Detergent, Shampoo…', 'No veg marker (not food)'],
      ], 'data-products')}
      ${t('Addresses', ['Field', 'Valid', 'Invalid'], [
        ['Full name', '<code>Asha Verma</code>', '<code>A</code> (too short)'], ['Mobile', '<code>9876543210</code>', '<code>12345</code>, <code>5876543210</code>'], ['House / street', '<code>Flat 402, Sunrise Apts</code>', '<code>12</code> (under 5 chars)'],
        ['State', 'One of the 18 listed states', 'Empty / not in list'], ['PIN code', '<code>560001</code>', '<code>56001</code>, <code>012345</code>'],
      ], 'data-addresses')}
      ${t('CSV files in test-data/', ['File', 'Columns', 'Used by'], [
        ['<code>users.csv</code>', 'email, password (50 rows)', 'NeoLoad, k6, data-driven login'], ['<code>variants.csv</code>', 'variantId, productId, name', 'Load tests (add to cart)'], ['<code>search-terms.csv</code>', 'term, expectedMin', 'Data-driven search tests'], ['<code>cards.csv</code>', 'cardNumber, expiry, cvv, expectedStatus, expectedCode', 'Data-driven payment tests'],
      ], 'data-files')}`);
  },

  // ============================================================== bugs
  bugs: async () => {
    const cfg = await api('GET', '/api/lab/config');
    state.lab = cfg;
    app().innerHTML = shell('bugs', `<div class="two">
      <div class="panel"><h2>Bug report template</h2>${table(['Field', 'What to write'], [
        ['Bug ID', 'Auto-generated by the tracker (e.g. BUG-107)'], ['Title', 'What is wrong + where, in one line. Not "checkout broken".'], ['Environment', 'Build / version, browser + version, OS, test data used'],
        ['Preconditions', 'State needed before step 1 (logged in as…, cart contains…)'], ['Steps to reproduce', 'Numbered, minimal, exact values'], ['Expected result', 'From the requirement / test case'], ['Actual result', 'What happened, with exact messages and numbers'],
        ['Severity', 'Technical impact (Critical → Low)'], ['Priority', 'How soon to fix (P1 → P3), set with the product owner'], ['Evidence', 'Screenshot, video, HAR / trace, request id (X-Request-Id), SQL output'], ['Linked', 'Test case, scenario and requirement IDs'],
      ].map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td></tr>`), 'bug-template')}</div>
      <div><div class="panel"><h2>Severity vs priority</h2>${table(['Severity', 'Meaning', 'Example here'], [
        ['<span class="sev critical">Critical</span>', 'Data leak, money loss, no workaround', 'Users can read other users\' orders'], ['<span class="sev high">High</span>', 'Core feature wrong', 'Wrong coupon discount; stock not restored'],
        ['<span class="sev medium">Medium</span>', 'Feature partly broken, workaround exists', 'Search is case-sensitive'], ['<span class="sev low">Low</span>', 'Cosmetic / minor', 'Typo, misaligned badge'],
      ].map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`), 'severity-table')}
        <p class="muted" style="font-size:.88rem">High severity doesn't always mean high priority: a crash on a hidden admin page used once a year can be High severity but P3.</p></div>
        <div class="panel" style="margin-top:16px"><h2>Bug life cycle</h2><div class="lifecycle" data-testid="bug-lifecycle">${LIFECYCLE.map(s => `<span>${s}</span>`).join('<i>→</i>')}</div>
          <ul class="list" style="font-size:.88rem">${LIFECYCLE_SIDE.map(([s, d]) => `<li><b>${s}:</b> ${d}</li>`).join('')}</ul></div></div></div>

      <h2 class="cov-h">Sample bug reports (reproducible here)</h2>
      <p class="muted">Each bug below is real once you switch it on. Turn one on, reproduce it, write your own report, then compare it with ours.</p>
      <div class="bc-grid">${SAMPLE_BUGS.map(([id, title, key, sev, prio, steps, exp, act, impact]) => `<article class="panel bug" data-testid="sample-bug">
        <div class="bc-head"><span class="pill">${id}</span><span><span class="sev ${sev.toLowerCase()}">${sev}</span> <span class="prio ${prio === 'P1' ? 'high' : prio === 'P2' ? 'medium' : 'low'}">${prio}</span></span></div>
        <h3>${esc(title)}</h3>
        <p><b>Environment:</b> v2.0 local · Chrome · switch <code>${key}</code> ON</p>
        <p><b>Steps:</b></p><ol>${steps.split(' | ').map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <p><b>Expected:</b> ${esc(exp)}</p><p><b>Actual:</b> ${esc(act)}</p><p><b>Impact:</b> ${esc(impact)}</p>
        <button class="btn sm ${cfg.bugs[key] ? 'danger' : 'ghost'}" data-bug="${key}" data-on="${!!cfg.bugs[key]}" data-testid="toggle-${key}">${cfg.bugs[key] ? 'Switch bug OFF' : 'Switch bug ON to reproduce'}</button></article>`).join('')}</div>

      <h2 class="cov-h">Defect injection for regression practice</h2>
      <form class="panel" id="bugForm" data-testid="defect-injection"><p class="muted" style="font-size:.88rem">Ask a friend to switch on one bug without telling you which. Run your regression suite and find it. Security and performance bugs are on their own pages.</p>
        ${bugToggles(['discountOnMrp', 'caseSensitiveSearch', 'stockNotRestoredOnCancel', 'couponMinIgnored', 'wishlistDuplicates'], cfg)}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" data-testid="bugs-apply">Apply</button><button type="button" class="btn danger" id="resetBtn" data-testid="reset-all">Reset database & settings</button>
          <a class="btn ghost" href="#/security">Security bugs →</a><a class="btn ghost" href="#/performance">Performance bugs →</a></div></form>`);
    $('#bugForm').onsubmit = async e => { e.preventDefault(); try { await saveBugs($('#bugForm')); refreshView(); } catch (err) { toast(err.message, 'error'); } };
    $('#resetBtn').onclick = () => resetAll(refreshView);
    $$('[data-bug]').forEach(b => (b.onclick = async () => {
      const on = b.dataset.on !== 'true';
      state.lab = await api('PUT', '/api/lab/config', { bugs: { [b.dataset.bug]: on } });
      toast(`${b.dataset.bug} is now ${on ? 'ON' : 'OFF'}`, on ? 'error' : 'success');
      refreshView();
    }));
  },

  // ============================================================== traceability
  traceability: () => {
    const scen = Object.fromEntries(SCENARIOS.map(s => [s[0], s]));
    const rows = REQUIREMENTS.map(([id, text, ts]) => {
      const tcs = ts.flatMap(t => scen[t][5].split(', '));
      const cases = CASES.filter(c => tcs.includes(c[0]));
      const auto = cases.filter(automated).length;
      const p = Math.round(auto / cases.length * 100);
      return { id, text, ts, tcs, n: cases.length, auto, p };
    });
    const tot = rows.reduce((a, r) => ({ n: a.n + r.n, auto: a.auto + r.auto }), { n: 0, auto: 0 });
    app().innerHTML = shell('traceability', `<p class="muted">The requirement traceability matrix (RTM) proves every requirement is tested, and shows how much is automated. A requirement with no test cases is a gap; a test case with no requirement is a question.</p>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><b>${REQUIREMENTS.length}/${REQUIREMENTS.length}</b><span>Requirements covered</span></div><div class="kpi"><b>${tot.n}</b><span>Linked test cases</span></div><div class="kpi"><b>${Math.round(tot.auto / tot.n * 100)}%</b><span>Automated / scripted</span></div><div class="kpi"><b>${tot.n - tot.auto}</b><span>Manual only</span></div></div>
      ${table(['Requirement', 'Description', 'Scenarios', 'Test cases', 'Automation coverage'], rows.map(r => `<tr data-testid="rtm-row"><td><b>${r.id}</b></td><td>${esc(r.text)}</td><td>${r.ts.join(', ')}</td><td>${r.tcs.map(t => `<a href="#/coverage/cases?q=${t}">${t}</a>`).join(', ')}</td>
        <td style="min-width:170px"><div class="bar-row" style="grid-template-columns:1fr 48px"><div class="bar"><i style="width:${r.p}%"></i></div><b>${r.p}%</b></div><small class="muted">${r.auto} of ${r.n} cases</small></td></tr>`), 'rtm-table')}`);
  },
};
