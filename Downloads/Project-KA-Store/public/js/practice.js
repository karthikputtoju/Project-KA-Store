import { views, $, $$, app, esc, api, toast, modal, pager, bindPager, onLeave, every, setBusy } from './core.js';

const PAGES = [
  ['forms', '📝', 'Forms & inputs', 'Text, radio, checkbox, select, multi-select, custom dropdown, range, file and validation.', 'Beginner'],
  ['alerts', '⚠️', 'Alerts & modals', 'Native alert, confirm and prompt dialogs plus a custom HTML modal.', 'Beginner'],
  ['frames', '🪟', 'iFrames', 'A form inside an iframe, and an iframe nested inside another iframe.', 'Intermediate'],
  ['windows', '🗗', 'Tabs & windows', 'Open new tabs and pop-up windows, then switch between them.', 'Intermediate'],
  ['upload-download', '📁', 'Upload & download', 'Upload files (single & multiple) and download CSV / JSON / TXT files.', 'Intermediate'],
  ['drag-drop', '🖐️', 'Drag & drop', 'Drag items into a basket and re-order a sortable list.', 'Intermediate'],
  ['tables', '📋', 'Web tables', 'Server-side sorting, filtering and pagination over 100 rows, plus a selectable table.', 'Intermediate'],
  ['dynamic', '⏳', 'Waits & dynamic elements', 'Delayed elements, disabled buttons, spinners, changing IDs and slow APIs.', 'Intermediate'],
  ['infinite-scroll', '♾️', 'Infinite scroll', 'Load more items as you scroll — 200 items in pages of 10.', 'Intermediate'],
  ['mouse-keyboard', '🖱️', 'Mouse & keyboard', 'Double-click, right-click, hover menus, tooltips, key presses and sliders.', 'Intermediate'],
  ['date-picker', '📅', 'Date pickers', 'Native date input and a custom calendar widget with disabled dates.', 'Intermediate'],
  ['shadow-dom', '👻', 'Shadow DOM', 'Elements inside open shadow roots, including a nested shadow root.', 'Advanced'],
  ['broken', '🔗', 'Broken links & images', 'Find broken images and links that return 404 / 500.', 'Advanced'],
  ['storage', '🍪', 'Cookies & storage', 'Read and write cookies, localStorage and sessionStorage.', 'Advanced'],
  ['api-practice', '🔌', 'API playground', 'Status codes, retries, redirects, basic auth, API keys and JSON payloads.', 'Advanced'],
];

const shell = (key, title, inner) => `<div class="view" data-testid="practice-${key}"><div class="crumbs"><a href="#/practice">Practice</a> / <span>${title}</span></div><h1>${title}</h1>${inner}</div>`;

views.practice = async (params, key) => {
  if (!key) {
    app().innerHTML = `<div class="view" data-testid="page-practice"><h1>Automation practice playground</h1>
      <p class="muted" style="max-width:760px">Tricky UI patterns that real projects throw at you. Each page has stable <code>data-testid</code> locators so you can focus on the technique. The shopping site itself is your end-to-end playground.</p>
      <div class="pg-grid" data-testid="practice-list">${PAGES.map(([k, e, t, d, lv], i) => `<a class="pg-card" style="--i:${i}" href="#/practice/${k}" data-testid="practice-link-${k}"><span class="em">${e}</span><h3>${t}</h3><p>${d}</p><span class="lv">${lv}</span></a>`).join('')}</div></div>`;
    return;
  }
  const page = PAGES.find(p => p[0] === key);
  if (!page) return views.notFound();
  await RENDER[key](params, page[2]);
};

const RENDER = {
  // ---------------------------------------------------------------- forms
  forms: (_, title) => {
    app().innerHTML = shell('forms', title, `<form class="demo" id="pf" novalidate data-testid="practice-form"><h3>Student registration form</h3>
      <div class="row2"><div class="field"><label for="p-first">First name *</label><input id="p-first" name="firstName" data-testid="pf-first-name" required></div>
        <div class="field"><label for="p-last">Last name *</label><input id="p-last" name="lastName" data-testid="pf-last-name" required></div></div>
      <div class="row2"><div class="field"><label for="p-email">Email *</label><input id="p-email" name="email" type="email" data-testid="pf-email" required></div>
        <div class="field"><label for="p-mobile">Mobile (10 digits) *</label><input id="p-mobile" name="mobile" inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" data-testid="pf-mobile" required></div></div>
      <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:600;font-size:.85rem">Gender *</legend><div style="display:flex;gap:16px">${['Male', 'Female', 'Other'].map(g => `<label class="chk"><input type="radio" name="gender" value="${g}" data-testid="pf-gender-${g.toLowerCase()}" required> ${g}</label>`).join('')}</div></fieldset>
      <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:600;font-size:.85rem">Hobbies</legend><div style="display:flex;gap:16px;flex-wrap:wrap">${['Sports', 'Reading', 'Music', 'Coding'].map(h => `<label class="chk"><input type="checkbox" name="hobbies" value="${h}" data-testid="pf-hobby-${h.toLowerCase()}"> ${h}</label>`).join('')}</div></fieldset>
      <div class="row3" style="grid-template-columns:1fr 1fr 1fr"><div class="field"><label for="p-state">State (select)</label><select id="p-state" name="state" data-testid="pf-state"><option value="">Select state</option><option>Karnataka</option><option>Telangana</option><option>Maharashtra</option><option>Tamil Nadu</option></select></div>
        <div class="field"><label for="p-skills">Skills (multi-select)</label><select id="p-skills" name="skills" multiple size="4" data-testid="pf-skills"><option>Selenium</option><option>Cypress</option><option>Playwright</option><option>NeoLoad</option><option>Postman</option></select></div>
        <div class="field"><span style="font-weight:600;font-size:.85rem" id="ddLabel">Experience (custom dropdown)</span><div class="menu-wrap"><button type="button" class="btn ghost block" id="dd" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="ddLabel dd" data-testid="pf-custom-dropdown">Choose…</button>
          <ul class="menu" role="listbox" id="ddList" hidden style="left:0;right:auto;list-style:none" data-testid="pf-custom-options">${['0-1 years', '1-3 years', '3-5 years', '5+ years'].map(o => `<li role="option" tabindex="-1" data-val="${o}" style="padding:8px 12px;border-radius:8px;cursor:pointer" data-testid="pf-option-${o.replace(/\W+/g, '')}">${o}</li>`).join('')}</ul></div><input type="hidden" name="experience" id="expVal"></div></div>
      <div class="row2"><div class="field"><label for="p-range">Confidence: <output id="rangeOut" data-testid="pf-range-value">5</output>/10</label><input id="p-range" name="confidence" type="range" min="0" max="10" value="5" data-testid="pf-range"></div>
        <div class="field"><label for="p-color">Favourite colour</label><input id="p-color" name="color" type="color" value="#e10600" data-testid="pf-color" style="height:46px"></div></div>
      <div class="field"><label for="p-about">About you</label><textarea id="p-about" name="about" rows="3" maxlength="200" data-testid="pf-about"></textarea></div>
      <div class="field"><label for="p-readonly">Read-only field</label><input id="p-readonly" value="KA-STUDENT-001" readonly data-testid="pf-readonly"></div>
      <div class="field"><label for="p-disabled">Disabled field</label><input id="p-disabled" value="You cannot type here" disabled data-testid="pf-disabled"></div>
      <label class="checkline"><input type="checkbox" name="agree" data-testid="pf-agree" required> I agree to the practice terms *</label>
      <div style="display:flex;gap:10px"><button class="btn" data-testid="pf-submit">Submit</button><button type="reset" class="btn ghost" data-testid="pf-reset">Reset</button></div>
      <div class="out" id="pfOut" data-testid="pf-result" aria-live="polite"></div></form>`);
    const f = $('#pf');
    $('#p-range').oninput = e => ($('#rangeOut').textContent = e.target.value);
    const dd = $('#dd'), list = $('#ddList');
    dd.onclick = () => { list.hidden = !list.hidden; dd.setAttribute('aria-expanded', String(!list.hidden)); };
    $$('[data-val]', list).forEach(li => (li.onclick = () => { $('#expVal').value = li.dataset.val; dd.textContent = li.dataset.val; list.hidden = true; dd.setAttribute('aria-expanded', 'false'); }));
    f.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(f);
      const data = { ...Object.fromEntries(fd.entries()), hobbies: fd.getAll('hobbies'), skills: fd.getAll('skills') };
      const errs = [];
      if (!data.firstName) errs.push('First name is required');
      if (!data.lastName) errs.push('Last name is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) errs.push('Valid email is required');
      if (!/^[6-9]\d{9}$/.test(data.mobile || '')) errs.push('Mobile must be 10 digits starting with 6-9');
      if (!data.gender) errs.push('Gender is required');
      if (!data.agree) errs.push('You must agree to the terms');
      $('#pfOut').innerHTML = errs.length ? `<span style="color:var(--red)" data-testid="pf-errors">${errs.map(esc).join('<br>')}</span>` : `<span data-testid="pf-success">✅ Submitted!</span><br>${esc(JSON.stringify(data))}`;
    };
    f.onreset = () => setTimeout(() => { $('#rangeOut').textContent = '5'; dd.textContent = 'Choose…'; $('#pfOut').textContent = ''; });
  },

  // ---------------------------------------------------------------- alerts
  alerts: (_, title) => {
    app().innerHTML = shell('alerts', title, `<div class="demo"><h3>Browser dialogs</h3><div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="a1" data-testid="btn-alert">Show alert</button><button class="btn" id="a2" data-testid="btn-confirm">Show confirm</button><button class="btn" id="a3" data-testid="btn-prompt">Show prompt</button><button class="btn ghost" id="a4" data-testid="btn-delayed-alert">Alert after 3 seconds</button></div>
      <div class="out" id="aOut" data-testid="alert-result" aria-live="polite"></div></div>
      <div class="demo"><h3>Custom HTML modal (not a browser dialog)</h3><button class="btn ghost" id="a5" data-testid="btn-open-modal">Open modal</button></div>`);
    const out = t => ($('#aOut').textContent = t);
    $('#a1').onclick = () => { alert('Hello from KarthikAutomation!'); out('You closed the alert'); };
    $('#a2').onclick = () => out(confirm('Do you want to continue?') ? 'You clicked OK' : 'You clicked Cancel');
    $('#a3').onclick = () => { const n = prompt('What is your name?', ''); out(n === null ? 'You cancelled the prompt' : `Hello, ${n}!`); };
    $('#a4').onclick = () => { out('Waiting 3 seconds…'); setTimeout(() => { alert('This alert appeared after 3 seconds'); out('Delayed alert closed'); }, 3000); };
    $('#a5').onclick = () => modal({ title: 'Practice modal', testid: 'practice-modal', body: '<p>This is an HTML modal. Close it with the ✕, the Close button, the Escape key or by clicking outside.</p><div class="field"><label for="mIn">Type something</label><input id="mIn" data-testid="modal-input"></div>', footer: '<button class="btn" data-close data-testid="modal-ok">Close</button>' });
  },

  // ---------------------------------------------------------------- frames
  frames: (_, title) => {
    app().innerHTML = shell('frames', title, `<div class="two"><div class="demo"><h3>Single iframe (id="frame-one")</h3><iframe class="frame" id="frame-one" name="frameOne" title="Practice frame one" src="/practice/frame.html" data-testid="frame-one"></iframe></div>
      <div class="demo"><h3>Nested iframes (outer → inner)</h3><iframe class="frame" id="frame-outer" name="frameOuter" title="Outer frame" src="/practice/nested.html" data-testid="frame-outer" style="min-height:330px"></iframe></div></div>
      <div class="demo"><h3>Message from frames</h3><div class="out" id="fOut" data-testid="frame-message">No message yet. Submit the form inside the frame.</div></div>`);
    const onMsg = e => { if (e.origin === location.origin && e.data?.from === 'ka-frame') $('#fOut').textContent = e.data.text; };
    window.addEventListener('message', onMsg);
    onLeave(() => window.removeEventListener('message', onMsg));
  },

  // ---------------------------------------------------------------- windows
  windows: (_, title) => {
    app().innerHTML = shell('windows', title, `<div class="demo"><h3>Open new tabs and windows</h3><div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn" href="/practice/new-window.html" target="_blank" rel="noopener" data-testid="link-new-tab">Open link in new tab</a>
      <button class="btn ghost" id="w1" data-testid="btn-new-window">Open pop-up window</button>
      <button class="btn ghost" id="w2" data-testid="btn-multiple-tabs">Open 3 tabs</button></div>
      <p class="muted" style="margin-top:12px">Tip: Playwright uses <code>context.waitForEvent('page')</code>; Selenium uses <code>driver.getWindowHandles()</code>; Cypress removes <code>target</code> and visits the URL.</p></div>`);
    $('#w1').onclick = () => window.open('/practice/new-window.html?popup=1', 'kaPopup', 'width=520,height=420');
    $('#w2').onclick = () => [1, 2, 3].forEach(n => window.open(`/practice/new-window.html?tab=${n}`, '_blank'));
  },

  // ---------------------------------------------------------------- upload / download
  'upload-download': (_, title) => {
    app().innerHTML = shell('upload-download', title, `<div class="two"><div class="demo"><h3>Upload</h3>
      <div class="field"><label for="up1">Single file (max 1 MB, no .exe/.js/.sh)</label><input id="up1" type="file" data-testid="file-input"></div>
      <div class="field"><label for="up2">Multiple files</label><input id="up2" type="file" multiple data-testid="file-input-multiple"></div>
      <div class="drop-zone" id="upDrop" data-testid="file-drop-zone" style="min-height:90px;align-items:center;justify-content:center">or drag & drop a file here</div>
      <button class="btn" id="upBtn" style="margin-top:12px" data-testid="upload-button">Upload</button>
      <div class="out" id="upOut" data-testid="upload-result" aria-live="polite"></div></div>
      <div class="demo"><h3>Download</h3><div style="display:flex;flex-direction:column;gap:10px">${['sample.csv', 'sample.json', 'sample.txt'].map(f => `<a class="btn ghost" href="/api/practice/download/${f}" download data-testid="download-${f.replace('.', '-')}">⬇ ${f}</a>`).join('')}</div>
      <p class="muted">Order invoices can be downloaded from any order page too.</p></div></div>`);
    let files = [];
    const pick = list => { files = [...list]; $('#upOut').textContent = files.map(f => `${f.name} (${f.size} bytes)`).join(', ') || ''; };
    $('#up1').onchange = e => pick(e.target.files);
    $('#up2').onchange = e => pick(e.target.files);
    const dz = $('#upDrop');
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); pick(e.dataTransfer.files); };
    $('#upBtn').onclick = async e => {
      if (!files.length) { $('#upOut').innerHTML = '<span style="color:var(--red)" data-testid="upload-error">Choose a file first</span>'; return; }
      setBusy(e.currentTarget, true);
      const results = [];
      for (const file of files) {
        const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(file); });
        try { const r = await api('POST', '/api/practice/upload', { name: file.name, type: file.type, contentBase64: b64 }); results.push(`✅ ${esc(r.name)} · ${r.size} bytes · sha256 ${r.sha256.slice(0, 12)}…`); }
        catch (err) { results.push(`<span style="color:var(--red)">❌ ${esc(file.name)}: ${esc(err.message)}</span>`); }
      }
      if (!$('#upOut')) return;
      $('#upOut').innerHTML = `<div data-testid="upload-success">${results.join('<br>')}</div>`;
      setBusy(e.currentTarget, false);
    };
  },

  // ---------------------------------------------------------------- drag & drop
  'drag-drop': (_, title) => {
    const items = ['🍌 Banana', '🥛 Milk', '🍞 Bread', '🥚 Eggs'];
    app().innerHTML = shell('drag-drop', title, `<div class="two"><div class="demo"><h3>Drag groceries into the basket</h3><div class="drop-zone" id="src" data-testid="drag-source">${items.map((t, i) => `<div class="drag-item" draggable="true" id="item-${i}" data-testid="drag-item-${i}">${t}</div>`).join('')}</div>
      <p style="text-align:center;font-size:1.5rem;margin:8px">⬇</p><div class="drop-zone" id="basket" data-testid="drop-basket"><span class="muted">🧺 Basket</span></div><div class="out" id="ddOut" data-testid="drop-result">Basket: 0 items</div></div>
      <div class="demo"><h3>Sortable list (drag to re-order)</h3><ol class="sortable" id="sortable" data-testid="sortable-list">${['Write test plan', 'Automate login', 'Automate checkout', 'Run load test', 'Report bugs'].map((t, i) => `<li draggable="true" data-testid="sortable-item-${i}"><b>☰</b>${t}</li>`).join('')}</ol><div class="out" id="sortOut" data-testid="sortable-order"></div></div></div>`);
    let dragged = null;
    $$('.drag-item').forEach(el => { el.ondragstart = e => { dragged = el; el.classList.add('dragging'); e.dataTransfer.setData('text/plain', el.id); }; el.ondragend = () => el.classList.remove('dragging'); });
    const basket = $('#basket');
    basket.ondragover = e => { e.preventDefault(); basket.classList.add('over'); };
    basket.ondragleave = () => basket.classList.remove('over');
    basket.ondrop = e => {
      e.preventDefault(); basket.classList.remove('over');
      const el = document.getElementById(e.dataTransfer.getData('text/plain')) || dragged;
      if (el) basket.appendChild(el);
      $('#ddOut').textContent = `Basket: ${$$('.drag-item', basket).length} items (${$$('.drag-item', basket).map(x => x.textContent.slice(3)).join(', ')})`;
    };
    const list = $('#sortable');
    const order = () => ($('#sortOut').textContent = 'Order: ' + $$('li', list).map(li => li.textContent.slice(1)).join(' → '));
    let dragLi = null;
    $$('li', list).forEach(li => {
      li.ondragstart = () => { dragLi = li; li.style.opacity = '.4'; };
      li.ondragend = () => { li.style.opacity = ''; order(); };
      li.ondragover = e => { e.preventDefault(); const r = li.getBoundingClientRect(); if (dragLi && dragLi !== li) li.parentNode.insertBefore(dragLi, e.clientY < r.top + r.height / 2 ? li : li.nextSibling); };
    });
    order();
  },

  // ---------------------------------------------------------------- web tables
  tables: async (params, title) => {
    const st = { q: '', department: '', sort: 'id', order: 'asc', page: 1 };
    app().innerHTML = shell('tables', title, `<div class="demo"><h3>Employees (server-side sort, filter, paginate)</h3>
      <div class="toolbar"><input id="tq" placeholder="Search name, email or city" style="max-width:300px" data-testid="table-search" aria-label="Search employees">
        <select id="td" style="width:auto" data-testid="table-department" aria-label="Department"><option value="">All departments</option></select>
        <span class="muted" id="tInfo" data-testid="table-info"></span></div>
      <div class="tbl-wrap"><table class="tbl" id="empTable" data-testid="employee-table"><thead><tr>${[['id', 'ID'], ['name', 'Name'], ['department', 'Department'], ['city', 'City'], ['salary', 'Salary'], ['joined', 'Joined']].map(([k, l]) => `<th aria-sort="none" data-col="${k}"><button data-sort="${k}" data-testid="sort-${k}">${l}</button></th>`).join('')}<th>Status</th></tr></thead><tbody></tbody></table></div><div id="tPg"></div></div>
      <div class="demo"><h3>Selectable rows</h3><div class="tbl-wrap"><table class="tbl" data-testid="select-table"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Select all" data-testid="select-all"></th><th>Product</th><th>Price</th><th>Qty</th></tr></thead><tbody>
        ${[['Banana Robusta', 48, 2], ['Toned Milk', 27, 3], ['Brown Bread', 45, 1], ['Farm Eggs', 92, 1]].map(([n, p, q], i) => `<tr data-testid="select-row-${i}"><td><input type="checkbox" class="rowSel" data-price="${p * q}" aria-label="Select ${n}" data-testid="select-row-checkbox-${i}"></td><td>${n}</td><td>₹${p}</td><td>${q}</td></tr>`).join('')}</tbody></table></div>
        <div class="out" id="selOut" data-testid="selected-total">Selected: 0 · Total ₹0</div></div>`);
    const load = async () => {
      const qs = new URLSearchParams({ page: st.page, pageSize: 10, sort: st.sort, order: st.order });
      if (st.q) qs.set('q', st.q); if (st.department) qs.set('department', st.department);
      const d = await api('GET', '/api/practice/employees?' + qs);
      if (!$('#empTable')) return;
      if ($('#td').options.length === 1) $('#td').insertAdjacentHTML('beforeend', d.departments.map(x => `<option>${x}</option>`).join(''));
      $('#empTable tbody').innerHTML = d.items.map(e => `<tr data-testid="employee-row"><td>${e.id}</td><td>${esc(e.name)}<br><small class="muted">${e.email}</small></td><td>${e.department}</td><td>${e.city}</td><td data-testid="employee-salary">₹${e.salary.toLocaleString('en-IN')}</td><td>${e.joined}</td><td><span class="pill ${e.active ? 'on' : 'off'}">${e.active ? 'Active' : 'Inactive'}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center" data-testid="table-empty">No matching records</td></tr>';
      $('#tInfo').textContent = `${d.total} records · page ${d.page} of ${d.totalPages}`;
      $$('#empTable th[data-col]').forEach(th => th.setAttribute('aria-sort', th.dataset.col === st.sort ? (st.order === 'asc' ? 'ascending' : 'descending') : 'none'));
      $('#tPg').innerHTML = pager(d.page, d.totalPages, 'table-pagination');
      bindPager($('#tPg'), n => { st.page = n; load(); });
    };
    let t;
    $('#tq').oninput = e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; st.page = 1; load(); }, 300); };
    $('#td').onchange = e => { st.department = e.target.value; st.page = 1; load(); };
    $$('[data-sort]').forEach(b => (b.onclick = () => { st.order = st.sort === b.dataset.sort && st.order === 'asc' ? 'desc' : 'asc'; st.sort = b.dataset.sort; load(); }));
    const sum = () => { const s = $$('.rowSel:checked'); $('#selOut').textContent = `Selected: ${s.length} · Total ₹${s.reduce((a, c) => a + Number(c.dataset.price), 0)}`; $('#selAll').checked = s.length === $$('.rowSel').length; };
    $$('.rowSel').forEach(c => (c.onchange = sum));
    $('#selAll').onchange = e => { $$('.rowSel').forEach(c => (c.checked = e.target.checked)); sum(); };
    load();
  },

  // ---------------------------------------------------------------- dynamic / waits
  dynamic: (_, title) => {
    app().innerHTML = shell('dynamic', title, `<div class="two">
      <div class="demo"><h3>1. Element appears after 5 seconds</h3><button class="btn" id="d1" data-testid="btn-start-delay">Start</button><div id="d1Out" class="out" data-testid="delayed-area"></div></div>
      <div class="demo"><h3>2. Button enabled after 4 seconds</h3><button class="btn ghost" id="d2" data-testid="btn-enable-start">Start timer</button> <button class="btn" id="d2b" disabled data-testid="btn-will-enable">I'm disabled</button><div class="out" id="d2Out" data-testid="enable-result"></div></div>
      <div class="demo"><h3>3. Element disappears</h3><button class="btn ghost" id="d3" data-testid="btn-remove">Remove the box in 2s</button><div id="vanish" class="out" style="background:var(--red);color:#fff" data-testid="vanishing-box">I will disappear</div></div>
      <div class="demo"><h3>4. Dynamic ID (changes every reload)</h3><button class="btn" id="dyn-${Math.random().toString(36).slice(2, 8)}" data-testid="btn-dynamic-id">Click me (my id changes)</button><div class="out" id="d4Out" data-testid="dynamic-id-result"></div></div>
      <div class="demo"><h3>5. Slow API with spinner</h3><div style="display:flex;gap:10px;align-items:center"><select id="d5ms" style="width:auto" data-testid="slow-ms" aria-label="Delay"><option>1000</option><option selected>3000</option><option>8000</option></select><button class="btn" id="d5" data-testid="btn-slow-api">Call /api/practice/slow</button></div><div class="out" id="d5Out" data-testid="slow-result"></div></div>
      <div class="demo"><h3>6. Progress bar</h3><button class="btn" id="d6" data-testid="btn-progress-start">Start download</button><div class="progress" style="margin-top:12px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="prog" data-testid="progress-bar"><i></i></div><div class="out" id="d6Out" data-testid="progress-value">0%</div></div>
      <div class="demo"><h3>7. Text changes after 3s</h3><button class="btn ghost" id="d7" data-testid="btn-change-text">Start</button><div class="out" id="d7Out" data-testid="changing-text">Status: Pending</div></div>
      <div class="demo"><h3>8. Flaky API (50% failure)</h3><button class="btn ghost" id="d8" data-testid="btn-flaky">Call /api/practice/flaky</button><div class="out" id="d8Out" data-testid="flaky-result"></div></div></div>`);
    const timers = [];
    onLeave(() => timers.forEach(clearTimeout));
    $('#d1').onclick = () => { $('#d1Out').innerHTML = '<span class="spinner"></span> Loading…'; timers.push(setTimeout(() => ($('#d1Out').innerHTML = '<p data-testid="delayed-element">🎉 I appeared after 5 seconds!</p>'), 5000)); };
    $('#d2').onclick = () => { $('#d2Out').textContent = 'Wait for it…'; timers.push(setTimeout(() => { const b = $('#d2b'); b.disabled = false; b.textContent = 'Now click me'; }, 4000)); };
    $('#d2b').onclick = () => ($('#d2Out').textContent = 'Clicked the enabled button ✅');
    $('#d3').onclick = () => timers.push(setTimeout(() => $('#vanish')?.remove(), 2000));
    $('[data-testid="btn-dynamic-id"]').onclick = e => ($('#d4Out').textContent = `Clicked! My id was ${e.currentTarget.id}`);
    $('#d5').onclick = async e => { setBusy(e.currentTarget, true); $('#d5Out').innerHTML = '<span class="spinner" data-testid="spinner"></span>'; const r = await api('GET', '/api/practice/slow?ms=' + $('#d5ms').value); if (!$('#d5Out')) return; $('#d5Out').textContent = `${r.message} (waited ${r.waitedMs} ms)`; setBusy(e.currentTarget, false); };
    $('#d6').onclick = () => { let v = 0; const bar = $('#prog'); const tick = () => { v = Math.min(100, v + Math.ceil(Math.random() * 12)); bar.firstElementChild.style.width = v + '%'; bar.setAttribute('aria-valuenow', v); $('#d6Out').textContent = v === 100 ? 'Complete!' : v + '%'; if (v < 100) timers.push(setTimeout(tick, 250)); }; tick(); };
    $('#d7').onclick = () => { $('#d7Out').textContent = 'Status: Processing…'; timers.push(setTimeout(() => ($('#d7Out').textContent = 'Status: Completed'), 3000)); };
    $('#d8').onclick = async () => { try { const r = await api('GET', '/api/practice/flaky'); $('#d8Out').textContent = '✅ ' + r.message; } catch (err) { $('#d8Out').innerHTML = `<span style="color:var(--red)">❌ ${esc(err.message)}</span>`; } };
  },

  // ---------------------------------------------------------------- infinite scroll
  'infinite-scroll': (_, title) => {
    app().innerHTML = shell('infinite-scroll', title, `<p class="muted">Scroll down to load more. <b id="isCount" data-testid="feed-count">0</b> of 200 loaded.</p><div id="feed" data-testid="feed"></div><div id="sentinel" style="padding:20px;text-align:center" data-testid="feed-loader"><span class="spinner"></span></div>`);
    let cursor = 0, loading = false;
    const more = async () => {
      if (loading || cursor === null) return;
      loading = true;
      const d = await api('GET', `/api/practice/feed?cursor=${cursor}&limit=10`);
      if (!$('#feed')) return;
      $('#feed').insertAdjacentHTML('beforeend', d.items.map(i => `<div class="feed-item" data-testid="feed-item"><b>${i.title}</b><br><small class="muted">${i.text}</small></div>`).join(''));
      cursor = d.nextCursor; $('#isCount').textContent = $$('.feed-item').length;
      if (cursor === null) $('#sentinel').innerHTML = '<b data-testid="feed-end">🎉 You reached the end</b>';
      loading = false;
      // The observer only fires when visibility CHANGES. If the loader is still on screen, keep loading.
      const r = $('#sentinel')?.getBoundingClientRect();
      if (cursor !== null && r && r.top < innerHeight + 200) more();
    };
    const io = new IntersectionObserver(es => es.some(e => e.isIntersecting) && more(), { rootMargin: '200px' });
    io.observe($('#sentinel'));
    onLeave(() => io.disconnect());
  },

  // ---------------------------------------------------------------- mouse & keyboard
  'mouse-keyboard': (_, title) => {
    app().innerHTML = shell('mouse-keyboard', title, `<div class="two">
      <div class="demo"><h3>Double-click</h3><button class="btn" id="dbl" data-testid="btn-double-click">Double-click me</button><div class="out" id="dblOut" data-testid="double-click-result"></div></div>
      <div class="demo"><h3>Right-click (context menu)</h3><div id="ctx" class="drop-zone" style="min-height:90px;align-items:center;justify-content:center" data-testid="context-area">Right-click inside this box</div><div class="out" id="ctxOut" data-testid="context-result"></div></div>
      <div class="demo"><h3>Hover menu</h3><div class="hover-menu" data-testid="hover-menu"><button class="btn ghost">Categories ▾</button><div class="sub" data-testid="hover-submenu"><a href="#/shop?category=fruits-vegetables" data-testid="hover-item-fruits">Fruits & Vegetables</a><a href="#/shop?category=dairy-bakery" data-testid="hover-item-dairy">Dairy & Bakery</a><a href="#/shop?category=snacks" data-testid="hover-item-snacks">Snacks</a></div></div></div>
      <div class="demo"><h3>Tooltip</h3><span class="tip"><button class="btn ghost" aria-describedby="tt1" data-testid="tooltip-trigger">Hover or focus me</button><span class="tt" role="tooltip" id="tt1" data-testid="tooltip">Free delivery above ₹499</span></span></div>
      <div class="demo"><h3>Key presses</h3><input id="keyIn" placeholder="Click here and press any key" data-testid="key-input"><div class="out" id="keyOut" data-testid="key-result">Last key: none</div></div>
      <div class="demo"><h3>Slider</h3><input type="range" id="sl" min="0" max="1000" step="50" value="250" data-testid="price-slider" aria-label="Max price"><div class="out" data-testid="slider-value">Max price: ₹<span id="slv">250</span></div></div>
      <div class="demo"><h3>Click & hold (long press 1.5s)</h3><button class="btn" id="hold" data-testid="btn-long-press">Press and hold</button><div class="out" id="holdOut" data-testid="long-press-result"></div></div>
      <div class="demo"><h3>Scroll to element</h3><div style="height:120px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px" data-testid="scroll-box"><div style="height:400px">Scroll down inside this box…</div><button class="btn sm" id="deep" data-testid="btn-hidden-deep">Found me!</button></div><div class="out" id="deepOut" data-testid="scroll-result"></div></div></div>`);
    $('#dbl').ondblclick = () => ($('#dblOut').textContent = 'Double-click detected ✅');
    $('#dbl').onclick = () => ($('#dblOut').textContent = 'That was a single click. Try double-click.');
    const area = $('#ctx');
    area.oncontextmenu = e => {
      e.preventDefault();
      $('.ctx-menu')?.remove();
      const m = document.createElement('div');
      m.className = 'ctx-menu'; m.setAttribute('data-testid', 'context-menu'); m.setAttribute('role', 'menu');
      m.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
      m.innerHTML = ['Copy', 'Paste', 'Delete'].map(a => `<button role="menuitem" data-testid="ctx-${a.toLowerCase()}">${a}</button>`).join('');
      document.body.appendChild(m);
      m.onclick = ev => { const b = ev.target.closest('button'); if (b) { $('#ctxOut').textContent = `You chose: ${b.textContent}`; m.remove(); } };
      setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }));
    };
    onLeave(() => $('.ctx-menu')?.remove());
    $('#keyIn').onkeydown = e => ($('#keyOut').textContent = `Last key: ${e.key} (code ${e.code})${e.ctrlKey || e.metaKey ? ' with Ctrl/Cmd' : ''}${e.shiftKey ? ' with Shift' : ''}`);
    $('#sl').oninput = e => ($('#slv').textContent = e.target.value);
    let ht;
    const hold = $('#hold');
    hold.onpointerdown = () => { $('#holdOut').textContent = 'Holding…'; ht = setTimeout(() => ($('#holdOut').textContent = 'Long press complete ✅'), 1500); };
    hold.onpointerup = hold.onpointerleave = () => { clearTimeout(ht); if ($('#holdOut').textContent === 'Holding…') $('#holdOut').textContent = 'Released too early'; };
    $('#deep').onclick = () => ($('#deepOut').textContent = 'Clicked the button inside the scroll box ✅');
  },

  // ---------------------------------------------------------------- date pickers
  'date-picker': (_, title) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let view = new Date(today.getFullYear(), today.getMonth(), 1), picked = null;
    app().innerHTML = shell('date-picker', title, `<div class="two"><div class="demo"><h3>Native date input</h3><div class="field"><label for="nd">Delivery date</label><input type="date" id="nd" min="${today.toISOString().slice(0, 10)}" data-testid="native-date"></div><div class="field"><label for="nt">Time</label><input type="time" id="nt" data-testid="native-time"></div><div class="out" id="ndOut" data-testid="native-date-result"></div></div>
      <div class="demo"><h3>Custom calendar (past dates & Sundays disabled)</h3><div class="field"><label for="cdIn">Pick a date</label><input id="cdIn" readonly placeholder="DD/MM/YYYY" data-testid="custom-date-input"></div><div class="cal" id="cal" data-testid="calendar" hidden></div><div class="out" id="cdOut" data-testid="custom-date-result"></div></div></div>`);
    const out = () => ($('#ndOut').textContent = `Date: ${$('#nd').value || '-'} · Time: ${$('#nt').value || '-'}`);
    $('#nd').onchange = out; $('#nt').onchange = out;
    const cal = $('#cal');
    const paint = () => {
      const first = new Date(view), days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      cal.innerHTML = `<div class="cal-head"><button id="cp" aria-label="Previous month" data-testid="cal-prev">‹</button><span data-testid="cal-month">${view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span><button id="cn" aria-label="Next month" data-testid="cal-next">›</button></div>
        <div class="cal-grid">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => `<span>${d}</span>`).join('')}${'<i></i>'.repeat(first.getDay())}
        ${Array.from({ length: days }, (_, i) => { const d = new Date(view.getFullYear(), view.getMonth(), i + 1); const dis = d < today || d.getDay() === 0; return `<button ${dis ? 'disabled' : ''} aria-selected="${picked && +picked === +d}" data-d="${d.getTime()}" data-testid="cal-day-${i + 1}" aria-label="${d.toDateString()}">${i + 1}</button>`; }).join('')}</div>`;
      $('#cp').onclick = () => { view.setMonth(view.getMonth() - 1); paint(); };
      $('#cn').onclick = () => { view.setMonth(view.getMonth() + 1); paint(); };
      $$('[data-d]', cal).forEach(b => (b.onclick = () => { picked = new Date(Number(b.dataset.d)); const s = picked.toLocaleDateString('en-GB'); $('#cdIn').value = s; $('#cdOut').textContent = `Selected: ${s}`; cal.hidden = true; }));
    };
    $('#cdIn').onclick = () => { cal.hidden = !cal.hidden; paint(); };
  },

  // ---------------------------------------------------------------- shadow DOM
  'shadow-dom': (_, title) => {
    if (!customElements.get('ka-coupon-card')) {
      customElements.define('ka-coupon-card', class extends HTMLElement {
        connectedCallback() {
          const root = this.attachShadow({ mode: 'open' });
          root.innerHTML = `<style>.box{border:2px dashed #e10600;border-radius:14px;padding:16px;font-family:sans-serif}button{background:#e10600;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700}input{padding:8px;border:1px solid #ccc;border-radius:8px}</style>
            <div class="box"><p>Shadow DOM coupon card</p><input id="code" placeholder="Enter code" data-testid="shadow-input"> <button id="apply" data-testid="shadow-button">Apply</button><p id="msg" data-testid="shadow-message"></p><ka-inner-badge></ka-inner-badge></div>`;
          root.getElementById('apply').onclick = () => (root.getElementById('msg').textContent = root.getElementById('code').value.toUpperCase() === 'SAVE10' ? 'Coupon accepted ✅' : 'Invalid coupon ❌');
        }
      });
      customElements.define('ka-inner-badge', class extends HTMLElement {
        connectedCallback() { const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<span style="display:inline-block;background:#0a0a0a;color:#fff;padding:4px 10px;border-radius:999px;font:700 12px sans-serif" data-testid="nested-shadow-badge">Nested shadow root</span>'; }
      });
    }
    app().innerHTML = shell('shadow-dom', title, `<div class="demo"><h3>Open shadow root</h3><ka-coupon-card data-testid="shadow-host"></ka-coupon-card>
      <p class="muted" style="margin-top:12px">Playwright pierces open shadow roots automatically. Cypress needs <code>{ includeShadowDom: true }</code>. Selenium 4 uses <code>element.getShadowRoot()</code>. Try the code <code>SAVE10</code>.</p></div>`);
  },

  // ---------------------------------------------------------------- broken links
  broken: (_, title) => {
    app().innerHTML = shell('broken', title, `<div class="two"><div class="demo"><h3>Images (2 are broken)</h3><div style="display:flex;gap:12px;flex-wrap:wrap" data-testid="image-list">
      <img src="/favicon.svg" alt="Working logo" width="80" height="80" data-testid="img-ok-1"><img src="/images/missing-banana.png" alt="Broken banana" width="80" height="80" data-testid="img-broken-1" style="border:1px dashed var(--line)">
      <img src="/favicon.svg" alt="Working logo 2" width="80" height="80" data-testid="img-ok-2"><img src="/images/does-not-exist.jpg" alt="Broken image" width="80" height="80" data-testid="img-broken-2" style="border:1px dashed var(--line)"></div></div>
      <div class="demo"><h3>Links (check their status codes)</h3><ul data-testid="link-list" style="line-height:2">
        <li><a href="/api/practice/status/200" data-testid="link-200">OK link (200)</a></li><li><a href="/api/practice/status/301" data-testid="link-301">Moved (301)</a></li>
        <li><a href="/api/practice/status/404" data-testid="link-404">Not found (404)</a></li><li><a href="/api/practice/status/500" data-testid="link-500">Server error (500)</a></li>
        <li><a href="/api/practice/redirect" data-testid="link-redirect">Redirect (302 → /api/health)</a></li><li><a href="/this-page-does-not-exist.html" data-testid="link-missing">Missing page</a></li></ul></div></div>`);
  },

  // ---------------------------------------------------------------- storage
  storage: (_, title) => {
    app().innerHTML = shell('storage', title, `<div class="demo"><h3>Write values</h3><div class="row3" style="grid-template-columns:1fr 1fr auto auto auto;align-items:end">
      <div class="field"><label for="sk">Key</label><input id="sk" value="favouriteFruit" data-testid="storage-key"></div><div class="field"><label for="sv">Value</label><input id="sv" value="mango" data-testid="storage-value"></div>
      <button class="btn sm" id="s1" style="margin-bottom:14px" data-testid="save-local">localStorage</button><button class="btn sm ghost" id="s2" style="margin-bottom:14px" data-testid="save-session">sessionStorage</button><button class="btn sm ghost" id="s3" style="margin-bottom:14px" data-testid="save-cookie">Cookie</button></div>
      <button class="btn ghost sm" id="sClear" data-testid="storage-clear">Clear all practice values</button></div>
      <div class="demo"><h3>Current values</h3><pre class="code-block" id="sOut" data-testid="storage-dump"></pre><p class="muted">The login session cookie <code>ka_session</code> is <b>HttpOnly</b>, so JavaScript cannot read it. Your test tool can (e.g. Playwright <code>context.cookies()</code>).</p></div>`);
    const safe = fn => { try { return fn(); } catch { return '(unavailable)'; } };
    const dump = () => ($('#sOut').textContent = JSON.stringify({ localStorage: safe(() => ({ ...localStorage })), sessionStorage: safe(() => ({ ...sessionStorage })), cookies: document.cookie || '(none visible to JS)' }, null, 2));
    const k = () => $('#sk').value, v = () => $('#sv').value;
    $('#s1').onclick = () => { safe(() => localStorage.setItem(k(), v())); dump(); };
    $('#s2').onclick = () => { safe(() => sessionStorage.setItem(k(), v())); dump(); };
    $('#s3').onclick = () => { document.cookie = `${encodeURIComponent(k())}=${encodeURIComponent(v())}; path=/; max-age=3600`; dump(); };
    $('#sClear').onclick = () => { safe(() => localStorage.clear()); safe(() => sessionStorage.clear()); document.cookie.split(';').forEach(c => { const n = c.split('=')[0].trim(); if (n) document.cookie = `${n}=; path=/; max-age=0`; }); dump(); };
    dump();
  },

  // ---------------------------------------------------------------- API practice
  'api-practice': (_, title) => {
    const ex = [
      ['GET', '/api/practice/status/418', 'Any status code'], ['GET', '/api/practice/flaky', 'Retry until it passes'], ['GET', '/api/practice/slow?ms=2000', 'Timeouts'],
      ['GET', '/api/practice/redirect', 'Follow redirects'], ['GET', '/api/practice/headers', 'Echo request headers'], ['GET', '/api/practice/graph', 'JSONPath & schema'],
      ['GET', '/api/practice/basic-auth', 'Basic auth (admin / admin)'], ['GET', '/api/practice/api-key', 'Header X-API-Key: ka-practice-key'], ['POST', '/api/practice/echo', 'Echo JSON body'],
    ];
    app().innerHTML = shell('api-practice', title, `<div class="demo"><h3>Try it in the browser</h3><div class="row3" style="grid-template-columns:120px 1fr auto;align-items:end">
      <div class="field"><label for="am">Method</label><select id="am" data-testid="api-method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
      <div class="field"><label for="au">URL</label><input id="au" value="/api/practice/graph" data-testid="api-url"></div><button class="btn" id="ago" style="margin-bottom:14px" data-testid="api-send">Send</button></div>
      <div class="field"><label for="ah">Headers (JSON)</label><input id="ah" value='{"X-API-Key":"ka-practice-key"}' data-testid="api-headers"></div>
      <div class="field"><label for="ab">Body (JSON)</label><textarea id="ab" rows="3" class="sql-box" data-testid="api-body">{"hello":"world"}</textarea></div>
      <div class="out" id="aStatus" data-testid="api-status"></div><pre class="code-block" id="aRes" style="max-height:340px;overflow:auto" data-testid="api-response"></pre></div>
      <div class="demo"><h3>Practice endpoints</h3><div class="tbl-wrap"><table class="tbl"><tbody>${ex.map(([m, u, d]) => `<tr><td><span class="mth ${m}" style="font-family:monospace;font-weight:800;color:#fff;padding:2px 8px;border-radius:6px;font-size:.75rem">${m}</span></td><td><code>${u}</code></td><td>${d}</td><td><button class="btn sm ghost" data-try="${m} ${u}">Try</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted">The full store API is documented on the <a href="#/api-docs">API docs</a> page, with an OpenAPI spec and a Postman collection.</p></div>`);
    $$('[data-try]').forEach(b => (b.onclick = () => { const [m, u] = b.dataset.try.split(' '); $('#am').value = m; $('#au').value = u; $('#ago').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    $('#ago').onclick = async () => {
      const m = $('#am').value; let headers = {};
      try { headers = JSON.parse($('#ah').value || '{}'); } catch { toast('Headers must be valid JSON', 'error'); return; }
      const t = performance.now();
      const res = await fetch($('#au').value, { method: m, headers: { 'Content-Type': 'application/json', ...headers }, body: ['GET', 'HEAD'].includes(m) ? undefined : $('#ab').value });
      const text = await res.text();
      $('#aStatus').innerHTML = `<b style="color:${res.ok ? 'var(--ok)' : 'var(--red)'}">${res.status} ${esc(res.statusText)}</b> · ${Math.round(performance.now() - t)} ms${res.redirected ? ' · redirected to ' + esc(res.url) : ''}`;
      try { $('#aRes').textContent = JSON.stringify(JSON.parse(text), null, 2); } catch { $('#aRes').textContent = text; }
    };
  },
};
