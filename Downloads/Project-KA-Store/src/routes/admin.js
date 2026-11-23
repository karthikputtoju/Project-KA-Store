'use strict';
const { route, HttpError } = require('../lib/http');
const { fail, paging, str } = require('../lib/util');
const { db, now, audit, sendEmail, localDate } = require('../db');
const { productView, variantsFor, loadProduct, BASE_SELECT } = require('./catalog');
const { orderDetail, orderSummary, restoreStock, STATUS_LABEL } = require('./orders');

const A = { auth: 'admin', tag: 'Admin' };

const TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [], cancelled: [], return_requested: [], returned: [],
};

route('GET', '/api/admin/stats', { ...A, summary: 'Dashboard KPIs' }, () => {
  const today = localDate(new Date());
  const kpi = db.get(`SELECT
      (SELECT COUNT(*) FROM orders) AS totalOrders,
      (SELECT COUNT(*) FROM orders WHERE substr(created_at, 1, 10) = ?) AS ordersToday,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status NOT IN ('cancelled','returned')) AS revenue,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
      (SELECT COUNT(*) FROM variants WHERE stock <= 10) AS lowStockCount,
      (SELECT COUNT(*) FROM returns WHERE status = 'requested') AS pendingReturns`, today);
  const byStatus = db.all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY n DESC');
  const last7 = db.all(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders, ROUND(SUM(total), 2) AS revenue FROM orders
    WHERE created_at >= ? AND status NOT IN ('cancelled','returned') GROUP BY day ORDER BY day`, new Date(Date.now() - 7 * 86400000).toISOString());
  const topProducts = db.all(`SELECT product_name AS name, emoji, SUM(qty) AS unitsSold, ROUND(SUM(line_total), 2) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status NOT IN ('cancelled','returned') GROUP BY product_id ORDER BY unitsSold DESC LIMIT 5`);
  const lowStock = db.all('SELECT v.id, v.sku, v.label, v.stock, p.name, p.emoji FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock <= 10 ORDER BY v.stock LIMIT 10');
  return { ...kpi, byStatus, last7, topProducts, lowStock };
});

// ---- products
route('GET', '/api/admin/products', { ...A, summary: 'All products including inactive', query: ['q', 'category', 'page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 20, 100);
  const where = [], args = [];
  if (ctx.query.q) { where.push('(p.name LIKE ? OR p.brand LIKE ?)'); args.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`); }
  if (ctx.query.category) { where.push('c.slug = ?'); args.push(ctx.query.category); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id ${w}`, ...args).n;
  const rows = db.all(`${BASE_SELECT} ${w} ORDER BY p.id LIMIT ? OFFSET ?`, ...args, pageSize, offset);
  const vmap = variantsFor(rows.map(r => r.id));
  return { items: rows.map(r => productView(r, vmap[r.id] || [])), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
});

function validateVariant(v, i) {
  const label = str(v.label), mrp = Number(v.mrp), price = Number(v.price), stock = Number(v.stock);
  const e = {};
  if (!label) e[`variants[${i}].label`] = 'Label is required (e.g. 1 kg)';
  if (!(mrp > 0)) e[`variants[${i}].mrp`] = 'MRP must be greater than 0';
  if (!(price > 0)) e[`variants[${i}].price`] = 'Price must be greater than 0';
  else if (price > mrp) e[`variants[${i}].price`] = 'Price cannot be greater than MRP';
  if (!Number.isInteger(stock) || stock < 0) e[`variants[${i}].stock`] = 'Stock must be a whole number ≥ 0';
  return { e, v: { label, mrp, price, stock } };
}

route('POST', '/api/admin/products', {
  ...A, summary: 'Create a product with variants',
  body: { name: 'Organic Honey', brand: 'BeeNatural', categorySlug: 'staples', emoji: '🍯', description: 'Raw forest honey.', isVeg: true, variants: [{ label: '500 g', mrp: 399, price: 349, stock: 25 }] },
}, ctx => {
  const b = ctx.body;
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', str(b.categorySlug));
  const errors = {
    name: str(b.name).length < 3 || str(b.name).length > 80 ? 'Name must be 3–80 characters' : null,
    brand: str(b.brand).length < 2 ? 'Brand is required' : null,
    categorySlug: !cat ? 'Select a valid category' : null,
    description: str(b.description).length < 5 ? 'Description must be at least 5 characters' : null,
    variants: !Array.isArray(b.variants) || !b.variants.length ? 'Add at least one variant' : null,
  };
  const variants = (Array.isArray(b.variants) ? b.variants : []).map((v, i) => { const r = validateVariant(v, i); Object.assign(errors, r.e); return r.v; });
  fail(errors);
  if (db.get('SELECT 1 FROM products WHERE lower(name) = lower(?) AND lower(brand) = lower(?)', str(b.name), str(b.brand))) throw new HttpError(409, 'DUPLICATE_PRODUCT', 'A product with this name and brand already exists');
  const id = db.tx(() => {
    const pid = db.run('INSERT INTO products (name, brand, category_id, emoji, description, is_veg, tags, created_at) VALUES (?,?,?,?,?,?,?,?)',
      str(b.name), str(b.brand), cat.id, str(b.emoji) || '📦', str(b.description), b.isVeg === undefined || b.isVeg === null ? null : (b.isVeg ? 1 : 0), str(b.tags) || null, now()).lastInsertRowid;
    variants.forEach((v, j) => db.run('INSERT INTO variants (product_id, sku, label, mrp, price, stock) VALUES (?,?,?,?,?,?)', pid, `KA-${cat.slug.slice(0, 3).toUpperCase()}-${String(pid).padStart(3, '0')}-${j + 1}`, v.label, v.mrp, v.price, v.stock));
    return pid;
  });
  audit(ctx.user.id, 'admin.product_create', 'product', id);
  const p = loadProduct(id, { includeInactive: true });
  return { status: 201, body: productView(p, variantsFor([id])[id]) };
});

route('PUT', '/api/admin/products/:id', { ...A, summary: 'Update product details or activate/deactivate', body: { name: 'Banana Robusta', description: 'Updated', isActive: true } }, ctx => {
  const p = loadProduct(ctx.params.id, { includeInactive: true });
  const b = ctx.body;
  const name = b.name !== undefined ? str(b.name) : p.name;
  const desc = b.description !== undefined ? str(b.description) : p.description;
  fail({ name: name.length < 3 || name.length > 80 ? 'Name must be 3–80 characters' : null, description: desc.length < 5 ? 'Description must be at least 5 characters' : null });
  let catId = p.category_id;
  if (b.categorySlug) { const c = db.get('SELECT id FROM categories WHERE slug = ?', b.categorySlug); if (!c) throw new HttpError(422, 'VALIDATION_FAILED', 'Invalid category', { categorySlug: 'Unknown category' }); catId = c.id; }
  db.run('UPDATE products SET name = ?, brand = ?, description = ?, emoji = ?, category_id = ?, is_active = ? WHERE id = ?',
    name, b.brand !== undefined ? str(b.brand) : p.brand, desc, b.emoji !== undefined ? str(b.emoji) : p.emoji, catId, b.isActive === undefined ? p.is_active : (b.isActive ? 1 : 0), p.id);
  audit(ctx.user.id, 'admin.product_update', 'product', p.id, b);
  const np = loadProduct(p.id, { includeInactive: true });
  return productView(np, variantsFor([p.id])[p.id]);
});

route('DELETE', '/api/admin/products/:id', { ...A, summary: 'Deactivate (soft delete) a product' }, ctx => {
  const p = loadProduct(ctx.params.id, { includeInactive: true });
  db.run('UPDATE products SET is_active = 0 WHERE id = ?', p.id);
  audit(ctx.user.id, 'admin.product_deactivate', 'product', p.id);
  return { ok: true };
});

route('PATCH', '/api/admin/variants/:id', { ...A, summary: 'Update price, MRP or stock of a variant', body: { price: 45, mrp: 60, stock: 100 } }, ctx => {
  const v = db.get('SELECT * FROM variants WHERE id = ?', Number(ctx.params.id));
  if (!v) throw new HttpError(404, 'NOT_FOUND', 'Variant not found');
  const merged = { label: v.label, mrp: ctx.body.mrp ?? v.mrp, price: ctx.body.price ?? v.price, stock: ctx.body.stock ?? v.stock };
  const r = validateVariant(merged, 0);
  fail(Object.fromEntries(Object.entries(r.e).map(([k, val]) => [k.replace('variants[0].', ''), val])));
  db.run('UPDATE variants SET mrp = ?, price = ?, stock = ? WHERE id = ?', r.v.mrp, r.v.price, r.v.stock, v.id);
  audit(ctx.user.id, 'admin.variant_update', 'variant', v.id, { from: { mrp: v.mrp, price: v.price, stock: v.stock }, to: r.v });
  return db.get('SELECT id, sku, label, mrp, price, stock FROM variants WHERE id = ?', v.id);
});

// ---- orders
route('GET', '/api/admin/orders', { ...A, summary: 'All orders', query: ['status', 'q (order no / email)', 'page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 20, 100);
  const where = [], args = [];
  if (ctx.query.status) { where.push('o.status = ?'); args.push(ctx.query.status); }
  if (ctx.query.q) { where.push('(o.order_no LIKE ? OR u.email LIKE ?)'); args.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id ${w}`, ...args).n;
  const rows = db.all(`SELECT o.*, u.email, u.name AS user_name FROM orders o JOIN users u ON u.id = o.user_id ${w} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, ...args, pageSize, offset);
  return { items: rows.map(r => ({ ...orderSummary(r), customer: { name: r.user_name, email: r.email }, nextStatuses: TRANSITIONS[r.status] })), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
});

route('GET', '/api/admin/orders/:orderNo', { ...A, summary: 'Any order in detail' }, ctx => {
  const d = orderDetail(ctx.params.orderNo);
  const o = db.get('SELECT status FROM orders WHERE order_no = ?', ctx.params.orderNo);
  return { ...d, nextStatuses: TRANSITIONS[o.status] };
});

route('PATCH', '/api/admin/orders/:orderNo/status', { ...A, summary: 'Move an order to its next status', body: { status: 'confirmed', note: 'Payment verified' } }, ctx => {
  const o = db.get('SELECT o.*, u.email, u.name AS user_name FROM orders o JOIN users u ON u.id = o.user_id WHERE order_no = ?', ctx.params.orderNo);
  if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  const to = str(ctx.body.status);
  if (!STATUS_LABEL[to]) throw new HttpError(422, 'VALIDATION_FAILED', 'Unknown status', { status: 'Unknown status' });
  if (!TRANSITIONS[o.status].includes(to)) throw new HttpError(409, 'INVALID_TRANSITION', `Cannot move an order from "${o.status}" to "${to}". Allowed: ${TRANSITIONS[o.status].join(', ') || 'none'}`);
  db.tx(() => {
    const extra = to === 'delivered' ? ", delivered_at = '" + now() + "'" + (o.payment_method === 'COD' ? ", payment_status = 'paid'" : '') : '';
    if (to === 'cancelled') { restoreStock(o.id); if (o.slot_id) db.run('UPDATE delivery_slots SET booked = MAX(booked - 1, 0) WHERE id = ?', o.slot_id); db.run('UPDATE orders SET cancel_reason = ?, payment_status = ? WHERE id = ?', str(ctx.body.note) || 'Cancelled by store', o.payment_status === 'paid' ? 'refunded' : 'failed', o.id); }
    db.run(`UPDATE orders SET status = ?, updated_at = ?${extra} WHERE id = ?`, to, now(), o.id);
    db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', o.id, to, str(ctx.body.note) || null, now());
  });
  audit(ctx.user.id, 'admin.order_status', 'order', o.order_no, { from: o.status, to });
  sendEmail(o.email, `Order ${o.order_no}: ${STATUS_LABEL[to]}`, `Hi ${o.user_name},\n\nYour order ${o.order_no} is now: ${STATUS_LABEL[to]}.`);
  return { ...orderDetail(o.order_no), nextStatuses: TRANSITIONS[to] };
});

// ---- returns
route('GET', '/api/admin/returns', { ...A, summary: 'Return requests', query: ['status'] }, ctx => (
  db.all(`SELECT r.*, o.order_no, o.total, u.email FROM returns r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = o.user_id ${ctx.query.status ? 'WHERE r.status = ?' : ''} ORDER BY r.created_at DESC`, ...(ctx.query.status ? [ctx.query.status] : []))
    .map(r => ({ id: r.id, orderNo: r.order_no, total: r.total, customer: r.email, reason: r.reason, status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at }))
));

route('PATCH', '/api/admin/returns/:id', { ...A, summary: 'Approve or reject a return', body: { status: 'approved' } }, ctx => {
  const r = db.get('SELECT r.*, o.order_no, o.id AS oid, o.payment_status FROM returns r JOIN orders o ON o.id = r.order_id WHERE r.id = ?', Number(ctx.params.id));
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Return not found');
  const to = str(ctx.body.status);
  if (!['approved', 'rejected'].includes(to)) throw new HttpError(422, 'VALIDATION_FAILED', 'status must be approved or rejected', { status: 'Invalid' });
  if (r.status !== 'requested') throw new HttpError(409, 'ALREADY_RESOLVED', `This return is already ${r.status}`);
  db.tx(() => {
    db.run('UPDATE returns SET status = ?, resolved_at = ? WHERE id = ?', to, now(), r.id);
    if (to === 'approved') { restoreStock(r.oid); db.run("UPDATE orders SET status = 'returned', payment_status = 'refunded', updated_at = ? WHERE id = ?", now(), r.oid); db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', r.oid, 'returned', 'Return approved, refund initiated', now()); }
    else { db.run("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?", now(), r.oid); db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', r.oid, 'delivered', 'Return rejected', now()); }
  });
  audit(ctx.user.id, 'admin.return_' + to, 'return', r.id);
  return { ok: true, order: orderDetail(r.order_no) };
});

// ---- users
route('GET', '/api/admin/users', { ...A, summary: 'All users', query: ['q', 'role', 'page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 20, 100);
  const where = [], args = [];
  if (ctx.query.q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); args.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`); }
  if (ctx.query.role) { where.push('u.role = ?'); args.push(ctx.query.role); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM users u ${w}`, ...args).n;
  const rows = db.all(`SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u ${w} ORDER BY u.id LIMIT ? OFFSET ?`, ...args, pageSize, offset);
  return { items: rows.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, isActive: !!u.is_active, orders: u.order_count, createdAt: u.created_at, lastLoginAt: u.last_login_at })), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
});

route('PATCH', '/api/admin/users/:id', { ...A, summary: 'Activate/deactivate a user or change role', body: { isActive: false } }, ctx => {
  const u = db.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
  if (!u) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  if (u.id === ctx.user.id) throw new HttpError(409, 'CANNOT_CHANGE_SELF', 'You cannot change your own account here');
  const role = ctx.body.role ?? u.role;
  if (!['customer', 'admin'].includes(role)) throw new HttpError(422, 'VALIDATION_FAILED', 'role must be customer or admin', { role: 'Invalid' });
  const active = ctx.body.isActive === undefined ? u.is_active : (ctx.body.isActive ? 1 : 0);
  db.tx(() => { db.run('UPDATE users SET role = ?, is_active = ? WHERE id = ?', role, active, u.id); if (!active) db.run('DELETE FROM sessions WHERE user_id = ?', u.id); });
  audit(ctx.user.id, 'admin.user_update', 'user', u.id, { role, isActive: !!active });
  return { id: u.id, email: u.email, role, isActive: !!active };
});

route('GET', '/api/admin/audit', { ...A, summary: 'Audit log', query: ['page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 25, 100);
  const total = db.get('SELECT COUNT(*) AS n FROM audit_log').n;
  const items = db.all('SELECT a.*, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?', pageSize, offset)
    .map(a => ({ id: a.id, user: a.email, action: a.action, entity: a.entity, entityId: a.entity_id, details: a.details ? JSON.parse(a.details) : null, at: a.created_at }));
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
});
