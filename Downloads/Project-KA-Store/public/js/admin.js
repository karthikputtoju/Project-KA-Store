import { state, views, $, $$, app, esc, inr, api, toast, setBusy, field, selectField, showFieldErrors, modal, confirmDialog, needLogin, dateTime, pager, bindPager, refreshView } from './core.js';

const NAV = [['dashboard', '📊 Dashboard'], ['products', '🛍️ Products'], ['orders', '📦 Orders'], ['returns', '↩️ Returns'], ['users', '👥 Users'], ['audit', '📝 Audit log']];
const shell = (active, inner) => `<div class="view" data-testid="page-admin"><div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Admin</h1><span class="role-tag">Store manager</span></div><p class="muted">Manage the practice store. Every change is written to the database and the audit log.</p>
  <div class="admin"><nav class="side-nav" aria-label="Admin" data-testid="admin-nav">${NAV.map(([k, l]) => `<a href="#/admin/${k}" class="${k === active ? 'active' : ''}" data-testid="admin-tab-${k}">${l}</a>`).join('')}</nav><section>${inner}</section></div></div>`;

views.admin = async (params, tab = 'dashboard') => {
  if (needLogin('Admins please log in')) return;
  if (state.user.role !== 'admin') {
    app().innerHTML = `<div class="view empty panel" data-testid="page-forbidden"><span class="big">⛔</span><h1>403 – Admins only</h1><p class="muted">You are logged in as a customer. Log in as <code>admin@karthikautomation.test</code> to access the admin panel.</p><a class="btn" href="#/">Back to store</a></div>`;
    return;
  }
  const page = Number(params.get('page') || 1);
  const q = params.get('q') || '';
  const go = (extra = {}) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(extra)) { if (v) n.set(k, v); else n.delete(k); } location.hash = `#/admin/${tab}?${n}`; };

  if (tab === 'dashboard') {
    const s = await api('GET', '/api/admin/stats');
    const max = Math.max(1, ...s.last7.map(d => d.revenue));
    app().innerHTML = shell('dashboard', `
      <div class="kgrid" data-testid="admin-kpis">${[['Total orders', s.totalOrders, 'kpi-orders'], ['Orders today', s.ordersToday, 'kpi-today'], ['Revenue', inr(Math.round(s.revenue)), 'kpi-revenue'], ['Customers', s.customers, 'kpi-customers'], ['Low-stock variants', s.lowStockCount, 'kpi-low-stock'], ['Pending returns', s.pendingReturns, 'kpi-returns']].map(([l, v, t]) => `<div class="kpi"><b data-testid="${t}">${v}</b><span>${l}</span></div>`).join('')}</div>
      <div class="two"><div class="panel"><h2>Revenue · last 7 days</h2><div class="chart" data-testid="revenue-chart">${s.last7.map((d, i) => `<div class="col" style="--i:${i}" title="${d.day}: ${inr(d.revenue)} (${d.orders} orders)"><small>${inr(Math.round(d.revenue))}</small><i style="height:${(d.revenue / max) * 130}px"></i>${d.day.slice(5)}</div>`).join('') || '<p class="muted">No orders in the last 7 days</p>'}</div></div>
        <div class="panel"><h2>Orders by status</h2>${s.byStatus.map(b => `<div class="bar-row" style="grid-template-columns:140px 1fr 40px"><span class="status ${b.status}">${b.status.replace(/_/g, ' ')}</span><div class="bar"><i style="width:${(b.n / s.totalOrders) * 100}%"></i></div><b>${b.n}</b></div>`).join('')}</div></div>
      <div class="two" style="margin-top:20px"><div class="panel"><h2>Top products</h2><div class="tbl-wrap"><table class="tbl" data-testid="top-products"><thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead><tbody>${s.topProducts.map(p => `<tr><td>${p.emoji} ${esc(p.name)}</td><td>${p.unitsSold}</td><td>${inr(p.revenue)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="panel"><h2>Low stock</h2><div class="tbl-wrap"><table class="tbl" data-testid="low-stock"><thead><tr><th>Item</th><th>SKU</th><th>Stock</th></tr></thead><tbody>${s.lowStock.map(v => `<tr><td>${v.emoji} ${esc(v.name)} <small class="muted">${esc(v.label)}</small></td><td><code>${esc(v.sku)}</code></td><td><b style="color:${v.stock ? 'var(--warn)' : 'var(--red)'}">${v.stock}</b></td></tr>`).join('')}</tbody></table></div></div></div>`);
  }

  if (tab === 'products') {
    const d = await api('GET', `/api/admin/products?page=${page}&pageSize=15${q ? '&q=' + encodeURIComponent(q) : ''}`);
    app().innerHTML = shell('products', `<div class="toolbar"><form id="sForm" class="coupon" style="margin:0;min-width:280px"><input name="q" placeholder="Search products" value="${esc(q)}" data-testid="admin-product-search" aria-label="Search products"><button class="btn sm ghost">Search</button></form>
      <button class="btn" id="newProd" data-testid="admin-add-product">+ Add product</button></div>
      <div class="tbl-wrap"><table class="tbl" data-testid="admin-products-table"><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Variant</th><th>MRP</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.items.map(p => p.variants.map((v, i) => `<tr data-testid="admin-product-row" data-product-id="${p.id}" data-variant-id="${v.id}">
        ${i === 0 ? `<td rowspan="${p.variants.length}">${p.id}</td><td rowspan="${p.variants.length}">${p.emoji} <b>${esc(p.name)}</b><br><small class="muted">${esc(p.brand)}</small></td><td rowspan="${p.variants.length}">${esc(p.category.name)}</td>` : ''}
        <td>${esc(v.label)}<br><small class="muted">${esc(v.sku)}</small></td>
        <td><input class="inline" type="number" min="1" step="0.01" value="${v.mrp}" data-f="mrp" aria-label="MRP" data-testid="variant-mrp"></td>
        <td><input class="inline" type="number" min="1" step="0.01" value="${v.price}" data-f="price" aria-label="Price" data-testid="variant-price"></td>
        <td><input class="inline" type="number" min="0" step="1" value="${v.stock}" data-f="stock" aria-label="Stock" data-testid="variant-stock"></td>
        ${i === 0 ? `<td rowspan="${p.variants.length}"><span class="pill ${p.isActive ? 'on' : 'off'}" data-testid="product-status">${p.isActive ? 'Active' : 'Inactive'}</span></td>` : ''}
        <td><button class="btn sm ghost" data-save-v="${v.id}" data-testid="variant-save">Save</button>${i === 0 ? ` <button class="btn sm ghost" data-toggle-p="${p.id}" data-active="${p.isActive}" data-testid="product-toggle">${p.isActive ? 'Deactivate' : 'Activate'}</button>` : ''}</td></tr>`).join('')).join('')}
      </tbody></table></div><div id="pg">${pager(d.page, d.totalPages)}</div>`);
    $('#sForm').onsubmit = e => { e.preventDefault(); go({ q: e.target.elements.q.value, page: '' }); };
    bindPager($('#pg'), n => go({ page: n }));
    $$('[data-save-v]').forEach(b => (b.onclick = async () => {
      const row = b.closest('tr');
      const body = Object.fromEntries($$('[data-f]', row).map(i => [i.dataset.f, Number(i.value)]));
      setBusy(b, true);
      try { await api('PATCH', `/api/admin/variants/${b.dataset.saveV}`, body); toast('Variant updated', 'success'); $$('[data-f]', row).forEach(i => i.removeAttribute('aria-invalid')); }
      catch (err) { toast(err.message + (err.details ? ': ' + Object.values(err.details).join(', ') : ''), 'error', 5000); Object.keys(err.details || {}).forEach(k => $(`[data-f="${k}"]`, row)?.setAttribute('aria-invalid', 'true')); }
      setBusy(b, false);
    }));
    $$('[data-toggle-p]').forEach(b => (b.onclick = async () => { const on = b.dataset.active === 'true'; await api('PUT', `/api/admin/products/${b.dataset.toggleP}`, { isActive: !on }); toast(on ? 'Product deactivated' : 'Product activated', 'success'); refreshView(); }));
    $('#newProd').onclick = () => productModal(() => refreshView());
  }

  if (tab === 'orders') {
    const st = params.get('status') || '';
    const d = await api('GET', `/api/admin/orders?page=${page}&pageSize=15${st ? '&status=' + st : ''}${q ? '&q=' + encodeURIComponent(q) : ''}`);
    app().innerHTML = shell('orders', `<div class="toolbar"><form id="sForm" class="coupon" style="margin:0;min-width:300px"><input name="q" placeholder="Order no. or customer email" value="${esc(q)}" data-testid="admin-order-search" aria-label="Search orders"><button class="btn sm ghost">Search</button></form>
      <select id="stSel" style="width:auto" data-testid="admin-order-status-filter" aria-label="Filter by status"><option value="">All statuses</option>${['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned'].map(s => `<option value="${s}" ${s === st ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}</select></div>
      <div class="tbl-wrap"><table class="tbl" data-testid="admin-orders-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Status</th><th>Update</th></tr></thead><tbody>
      ${d.items.map(o => `<tr data-testid="admin-order-row" data-order-no="${o.orderNo}"><td><b>${o.orderNo}</b><br><small class="muted">${o.itemCount} items</small></td><td>${esc(o.customer.name)}<br><small class="muted">${esc(o.customer.email)}</small></td><td>${dateTime(o.createdAt)}</td><td>${inr(o.total)}</td><td>${o.paymentMethod}<br><small class="muted">${o.paymentStatus}</small></td>
        <td><span class="status ${o.status}" data-testid="admin-order-status">${o.statusLabel}</span></td>
        <td>${o.nextStatuses.length ? `<select data-next="${o.orderNo}" style="width:auto;padding:6px 8px" aria-label="Next status for ${o.orderNo}" data-testid="admin-order-next"><option value="">Move to…</option>${o.nextStatuses.map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}</select>` : '<small class="muted">Final</small>'}</td></tr>`).join('')}
      </tbody></table></div><div id="pg">${pager(d.page, d.totalPages)}</div>`);
    $('#sForm').onsubmit = e => { e.preventDefault(); go({ q: e.target.elements.q.value, page: '' }); };
    $('#stSel').onchange = e => go({ status: e.target.value, page: '' });
    bindPager($('#pg'), n => go({ page: n }));
    $$('[data-next]').forEach(s => (s.onchange = async () => {
      if (!s.value) return;
      if (s.value === 'cancelled' && !(await confirmDialog('Cancel this order?', 'Stock will be restored and the customer refunded if paid.', 'Cancel order'))) { s.value = ''; return; }
      try { await api('PATCH', `/api/admin/orders/${s.dataset.next}/status`, { status: s.value, note: 'Updated from admin panel' }); toast(`Order moved to ${s.value.replace(/_/g, ' ')}`, 'success'); refreshView(); }
      catch (err) { toast(err.message, 'error'); s.value = ''; }
    }));
  }

  if (tab === 'returns') {
    const list = await api('GET', '/api/admin/returns');
    app().innerHTML = shell('returns', `<div class="tbl-wrap"><table class="tbl" data-testid="admin-returns-table"><thead><tr><th>#</th><th>Order</th><th>Customer</th><th>Reason</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(r => `<tr data-testid="admin-return-row"><td>${r.id}</td><td>${r.orderNo}<br><small>${inr(r.total)}</small></td><td>${esc(r.customer)}</td><td>${esc(r.reason)}</td><td>${dateTime(r.createdAt)}</td><td><span class="pill ${r.status === 'approved' ? 'on' : r.status === 'rejected' ? 'off' : ''}">${r.status}</span></td>
        <td>${r.status === 'requested' ? `<button class="btn sm" data-ret="${r.id}" data-to="approved" data-testid="return-approve">Approve</button> <button class="btn sm ghost" data-ret="${r.id}" data-to="rejected" data-testid="return-reject">Reject</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No return requests yet. Deliver an order (Orders tab) and request a return as the customer.</td></tr>'}
      </tbody></table></div>`);
    $$('[data-ret]').forEach(b => (b.onclick = async () => { await api('PATCH', `/api/admin/returns/${b.dataset.ret}`, { status: b.dataset.to }); toast(`Return ${b.dataset.to}`, 'success'); refreshView(); }));
  }

  if (tab === 'users') {
    const d = await api('GET', `/api/admin/users?page=${page}&pageSize=15${q ? '&q=' + encodeURIComponent(q) : ''}`);
    app().innerHTML = shell('users', `<form id="sForm" class="coupon" style="max-width:360px"><input name="q" placeholder="Search name or email" value="${esc(q)}" data-testid="admin-user-search" aria-label="Search users"><button class="btn sm ghost">Search</button></form>
      <div class="tbl-wrap"><table class="tbl" data-testid="admin-users-table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Orders</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.items.map(u => `<tr data-testid="admin-user-row" data-user-id="${u.id}"><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? '<span class="role-tag">admin</span>' : 'customer'}</td><td>${u.orders}</td><td>${u.lastLoginAt ? dateTime(u.lastLoginAt) : '-'}</td>
        <td><span class="pill ${u.isActive ? 'on' : 'off'}" data-testid="user-status">${u.isActive ? 'Active' : 'Disabled'}</span></td>
        <td>${u.id === state.user.id ? '<small class="muted">You</small>' : `<button class="btn sm ghost" data-user="${u.id}" data-active="${u.isActive}" data-testid="user-toggle">${u.isActive ? 'Disable' : 'Enable'}</button>`}</td></tr>`).join('')}
      </tbody></table></div><div id="pg">${pager(d.page, d.totalPages)}</div>`);
    $('#sForm').onsubmit = e => { e.preventDefault(); go({ q: e.target.elements.q.value, page: '' }); };
    bindPager($('#pg'), n => go({ page: n }));
    $$('[data-user]').forEach(b => (b.onclick = async () => { const on = b.dataset.active === 'true'; await api('PATCH', `/api/admin/users/${b.dataset.user}`, { isActive: !on }); toast(on ? 'User disabled and logged out' : 'User enabled', 'success'); refreshView(); }));
  }

  if (tab === 'audit') {
    const d = await api('GET', `/api/admin/audit?page=${page}&pageSize=25`);
    app().innerHTML = shell('audit', `<div class="tbl-wrap"><table class="tbl" data-testid="admin-audit-table"><thead><tr><th>#</th><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
      ${d.items.map(a => `<tr><td>${a.id}</td><td>${dateTime(a.at)}</td><td>${esc(a.user || '-')}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.entity || '')} ${esc(a.entityId || '')}</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis"><small>${esc(a.details ? JSON.stringify(a.details) : '')}</small></td></tr>`).join('')}
      </tbody></table></div><div id="pg">${pager(d.page, d.totalPages)}</div>`);
    bindPager($('#pg'), n => go({ page: n }));
  }
};

function productModal(done) {
  const cats = state.categories;
  const vRow = i => `<div class="row3" data-vrow style="grid-template-columns:1.4fr 1fr 1fr 1fr auto;align-items:end">${field(`variants[${i}].label`, 'Pack size', 'placeholder="500 g"')}${field(`variants[${i}].mrp`, 'MRP ₹', 'type="number" min="1"')}${field(`variants[${i}].price`, 'Price ₹', 'type="number" min="1"')}${field(`variants[${i}].stock`, 'Stock', 'type="number" min="0"', '10')}<button type="button" class="x-btn" data-rmv aria-label="Remove variant" style="margin-bottom:22px">✕</button></div>`;
  modal({
    title: 'Add a product', testid: 'product-modal', wide: true,
    body: `<form id="pForm" novalidate data-testid="product-form"><div class="form-error-slot"></div>
      <div class="row2">${field('name', 'Product name')}${field('brand', 'Brand')}</div>
      <div class="row3" style="grid-template-columns:2fr 1fr 1fr">${selectField('categorySlug', 'Category', cats.map(c => c.slug))}${field('emoji', 'Emoji image', 'maxlength="4"', '📦')}
        <div class="field"><label for="f-isVeg">Diet</label><select id="f-isVeg" name="isVeg" data-testid="input-isVeg"><option value="">Not food</option><option value="true">Veg</option><option value="false">Non-veg</option></select></div></div>
      <div class="field"><label for="f-description">Description</label><textarea id="f-description" name="description" rows="2" data-testid="input-description"></textarea><span class="err" data-err="description" data-testid="error-description"></span></div>
      <h3 style="font-family:var(--font);font-size:.95rem">Variants</h3><div id="vrows">${vRow(0)}</div><span class="err" data-err="variants" data-testid="error-variants"></span>
      <button type="button" class="btn sm ghost" id="addV" data-testid="add-variant">+ Add variant</button></form>`,
    footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="saveP" data-testid="product-save">Create product</button>',
    onOpen: (back, close) => {
      let n = 1;
      $('#addV', back).onclick = () => $('#vrows', back).insertAdjacentHTML('beforeend', vRow(n++));
      $('#vrows', back).onclick = e => { if (e.target.closest('[data-rmv]') && $$('[data-vrow]', back).length > 1) e.target.closest('[data-vrow]').remove(); };
      $('#saveP', back).onclick = async e => {
        const f = $('#pForm', back);
        const variants = $$('[data-vrow]', back).map(r => { const g = k => $(`[name$="].${k}"]`, r).value; return { label: g('label'), mrp: Number(g('mrp')), price: Number(g('price')), stock: Number(g('stock')) }; });
        const body = { name: f.elements.name.value, brand: f.elements.brand.value, categorySlug: f.elements.categorySlug.value, emoji: f.elements.emoji.value, description: f.elements.description.value, isVeg: f.elements.isVeg.value === '' ? null : f.elements.isVeg.value === 'true', variants };
        setBusy(e.currentTarget, true);
        try { const p = await api('POST', '/api/admin/products', body); close(); toast(`Created product #${p.id}`, 'success'); done(); }
        catch (err) { setBusy(e.currentTarget, false); $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="product-error">${esc(err.message)}</div>`; showFieldErrors(f, err.details); }
      };
    },
  });
}
