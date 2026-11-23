'use strict';
const { route, HttpError } = require('../lib/http');
const { money, str } = require('../lib/util');
const { state } = require('../lib/state');
const { db, now } = require('../db');

const FREE_DELIVERY_ABOVE = 499;
const DELIVERY_FEE = 30;
const MAX_QTY = 10;

function cartRows(userId) {
  return db.all(`SELECT ci.variant_id, ci.qty, v.sku, v.label, v.mrp, v.price, v.stock, p.id AS product_id, p.name, p.brand, p.emoji, p.is_active, c.slug AS cat_slug
    FROM cart_items ci JOIN variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
    WHERE ci.user_id = ? ORDER BY ci.added_at`, userId);
}

/** Evaluate a coupon against the cart. Returns { discount, freeDelivery } or throws HttpError with the reason. */
function evaluateCoupon(code, userId, rows, subtotal, mrpTotal) {
  const c = db.get('SELECT * FROM coupons WHERE code = ? AND is_active = 1', code);
  if (!c) throw new HttpError(404, 'COUPON_NOT_FOUND', 'This coupon code does not exist');
  if (new Date(c.expires_at) < new Date()) throw new HttpError(410, 'COUPON_EXPIRED', 'This coupon has expired');
  if (!rows.length) throw new HttpError(422, 'CART_EMPTY', 'Add items to your cart before applying a coupon');
  if (subtotal < c.min_order && !state.lab.bugs.couponMinIgnored) throw new HttpError(422, 'MIN_ORDER_NOT_MET', `Add items worth ₹${money(c.min_order - subtotal)} more to use ${code} (minimum ₹${c.min_order})`);
  const pastOrders = db.get("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status <> 'cancelled'", userId).n;
  if (c.first_order_only && pastOrders > 0) throw new HttpError(422, 'FIRST_ORDER_ONLY', `${code} is valid on your first order only`);
  if (c.per_user_limit) {
    const used = db.get("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND coupon_code = ? AND status <> 'cancelled'", userId, code).n;
    if (used >= c.per_user_limit) throw new HttpError(422, 'COUPON_LIMIT_REACHED', `You have already used ${code}`);
  }
  let base = state.lab.bugs.discountOnMrp ? mrpTotal : subtotal;
  if (c.category_slug) {
    const catRows = rows.filter(r => r.cat_slug === c.category_slug);
    if (!catRows.length) throw new HttpError(422, 'COUPON_NOT_APPLICABLE', `${code} applies only to ${c.category_slug.replace('-', ' & ')} items`);
    base = catRows.reduce((s, r) => s + (state.lab.bugs.discountOnMrp ? r.mrp : r.price) * r.qty, 0);
  }
  let discount = 0;
  if (c.type === 'flat') discount = Math.min(c.value, subtotal);
  if (c.type === 'percent') discount = base * c.value / 100;
  if (c.max_discount) discount = Math.min(discount, c.max_discount);
  return { discount: money(discount), freeDelivery: c.type === 'free_delivery', description: c.description };
}

function cartView(userId) {
  const rows = cartRows(userId);
  const meta = db.get('SELECT coupon_code FROM carts WHERE user_id = ?', userId);
  const items = rows.map(r => ({
    variantId: r.variant_id, productId: r.product_id, sku: r.sku, name: r.name, brand: r.brand, emoji: r.emoji, variantLabel: r.label,
    mrp: r.mrp, price: r.price, qty: r.qty, lineTotal: money(r.price * r.qty), lineMrp: money(r.mrp * r.qty), stock: r.stock,
    available: !!r.is_active && r.stock >= r.qty, issue: !r.is_active ? 'No longer available' : r.stock === 0 ? 'Out of stock' : r.stock < r.qty ? `Only ${r.stock} left` : null,
  }));
  const subtotal = money(items.reduce((s, i) => s + i.price * i.qty, 0));
  const mrpTotal = money(items.reduce((s, i) => s + i.mrp * i.qty, 0));
  let discount = 0, freeDelivery = false, coupon = null, couponError = null;
  if (meta?.coupon_code) {
    try { const e = evaluateCoupon(meta.coupon_code, userId, rows, subtotal, mrpTotal); discount = e.discount; freeDelivery = e.freeDelivery; coupon = { code: meta.coupon_code, description: e.description }; }
    catch (err) { coupon = { code: meta.coupon_code }; couponError = err.message; }
  }
  const afterDiscount = money(subtotal - discount);
  const deliveryFee = !items.length || freeDelivery || afterDiscount >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  return {
    items, itemCount: items.reduce((s, i) => s + i.qty, 0), lineCount: items.length,
    mrpTotal, subtotal, productSavings: money(mrpTotal - subtotal), coupon, couponError, discount, deliveryFee,
    freeDeliveryThreshold: FREE_DELIVERY_ABOVE, amountForFreeDelivery: deliveryFee ? money(FREE_DELIVERY_ABOVE - afterDiscount) : 0,
    total: money(afterDiscount + deliveryFee), totalSavings: money(mrpTotal - subtotal + discount + (items.length && deliveryFee === 0 ? DELIVERY_FEE : 0)),
    hasIssues: items.some(i => !i.available), currency: 'INR',
  };
}

function loadVariant(id) {
  const v = db.get('SELECT v.*, p.is_active, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?', Number(id));
  if (!v || !v.is_active) throw new HttpError(404, 'NOT_FOUND', 'Product variant not found');
  return v;
}

route('GET', '/api/cart', { tag: 'Cart', summary: 'My cart with price breakdown', auth: 'user' }, ctx => cartView(ctx.user.id));

route('POST', '/api/cart/items', { tag: 'Cart', summary: 'Add a variant to the cart (adds to existing qty)', auth: 'user', body: { variantId: 1, qty: 1 } }, ctx => {
  const v = loadVariant(ctx.body.variantId);
  const qty = ctx.body.qty === undefined ? 1 : Number(ctx.body.qty);
  if (!Number.isInteger(qty) || qty < 1) throw new HttpError(422, 'INVALID_QTY', 'Quantity must be a whole number of at least 1');
  const line = db.get('SELECT qty FROM cart_items WHERE user_id = ? AND variant_id = ?', ctx.user.id, v.id);
  const newQty = (line?.qty || 0) + qty;
  if (newQty > MAX_QTY) throw new HttpError(422, 'QTY_LIMIT', `You can buy at most ${MAX_QTY} units of this item`);
  if (v.stock === 0) throw new HttpError(409, 'OUT_OF_STOCK', `${v.name} (${v.label}) is out of stock`);
  if (newQty > v.stock) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${v.stock} units of ${v.name} (${v.label}) available`);
  db.run(`INSERT INTO cart_items (user_id, variant_id, qty, added_at) VALUES (?,?,?,?) ON CONFLICT(user_id, variant_id) DO UPDATE SET qty = excluded.qty`, ctx.user.id, v.id, newQty, now());
  return { status: 201, body: cartView(ctx.user.id) };
});

route('PATCH', '/api/cart/items/:variantId', { tag: 'Cart', summary: 'Set quantity (0 removes the item)', auth: 'user', body: { qty: 2 } }, ctx => {
  const vid = Number(ctx.params.variantId);
  if (!db.get('SELECT 1 FROM cart_items WHERE user_id = ? AND variant_id = ?', ctx.user.id, vid)) throw new HttpError(404, 'NOT_IN_CART', 'This item is not in your cart');
  const qty = Number(ctx.body.qty);
  if (!Number.isInteger(qty) || qty < 0) throw new HttpError(422, 'INVALID_QTY', 'Quantity must be a whole number');
  if (qty > MAX_QTY) throw new HttpError(422, 'QTY_LIMIT', `You can buy at most ${MAX_QTY} units of this item`);
  if (qty === 0) db.run('DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?', ctx.user.id, vid);
  else {
    const v = loadVariant(vid);
    if (qty > v.stock) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${v.stock} units available`);
    db.run('UPDATE cart_items SET qty = ? WHERE user_id = ? AND variant_id = ?', qty, ctx.user.id, vid);
  }
  return cartView(ctx.user.id);
});

route('DELETE', '/api/cart/items/:variantId', { tag: 'Cart', summary: 'Remove an item', auth: 'user' }, ctx => {
  db.run('DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?', ctx.user.id, Number(ctx.params.variantId));
  return cartView(ctx.user.id);
});

route('DELETE', '/api/cart', { tag: 'Cart', summary: 'Empty the cart', auth: 'user' }, ctx => {
  db.tx(() => { db.run('DELETE FROM cart_items WHERE user_id = ?', ctx.user.id); db.run('DELETE FROM carts WHERE user_id = ?', ctx.user.id); });
  return cartView(ctx.user.id);
});

route('POST', '/api/cart/coupon', { tag: 'Cart', summary: 'Apply a coupon code', auth: 'user', body: { code: 'SAVE10' } }, ctx => {
  const code = str(ctx.body.code).toUpperCase();
  if (!code) throw new HttpError(422, 'VALIDATION_FAILED', 'Enter a coupon code', { code: 'Required' });
  const rows = cartRows(ctx.user.id);
  const subtotal = rows.reduce((s, r) => s + r.price * r.qty, 0), mrpTotal = rows.reduce((s, r) => s + r.mrp * r.qty, 0);
  evaluateCoupon(code, ctx.user.id, rows, subtotal, mrpTotal); // throws if not valid
  db.run('INSERT INTO carts (user_id, coupon_code) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET coupon_code = excluded.coupon_code', ctx.user.id, code);
  return cartView(ctx.user.id);
});

route('DELETE', '/api/cart/coupon', { tag: 'Cart', summary: 'Remove the applied coupon', auth: 'user' }, ctx => {
  db.run('UPDATE carts SET coupon_code = NULL WHERE user_id = ?', ctx.user.id);
  return cartView(ctx.user.id);
});

route('GET', '/api/coupons', { tag: 'Cart', summary: 'Available coupons' }, () => (
  db.all('SELECT code, type, value, min_order AS minOrder, max_discount AS maxDiscount, category_slug AS category, first_order_only AS firstOrderOnly, expires_at AS expiresAt, description FROM coupons WHERE is_active = 1 ORDER BY code')
    .map(c => ({ ...c, firstOrderOnly: !!c.firstOrderOnly, expired: new Date(c.expiresAt) < new Date() }))
));

module.exports = { cartView, cartRows, evaluateCoupon, MAX_QTY };
