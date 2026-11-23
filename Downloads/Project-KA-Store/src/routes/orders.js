'use strict';
const { route, HttpError } = require('../lib/http');
const { money, RE, luhn, fail, paging, str } = require('../lib/util');
const { state } = require('../lib/state');
const { db, now, audit, sendEmail, ensureSlots, localDate } = require('../db');
const { cartView } = require('./cart');

const COD_LIMIT = 3000;
const RETURN_DAYS = 7;
const CANCELLABLE = ['placed', 'confirmed', 'packed'];
const TEST_CARDS = { '4111111111111111': 'success', '4000000000000002': 'declined', '4000000000009995': 'insufficient_funds', '4000000000000119': 'gateway_error' };
const STATUS_LABEL = { placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', return_requested: 'Return requested', returned: 'Returned' };

const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------- delivery slots
function slotView(s) {
  const start = new Date(`${s.slot_date}T${s.start_time}:00`);
  const cutoff = start.getTime() - 60 * 60000; // must book at least 60 min before the slot starts
  const remaining = s.capacity - s.booked;
  const reason = Date.now() > cutoff ? 'Slot closed' : remaining <= 0 ? 'Fully booked' : null;
  return { id: s.id, date: s.slot_date, start: s.start_time, end: s.end_time, label: `${s.start_time} - ${s.end_time}`, remaining: Math.max(0, remaining), available: !reason, reason };
}

route('GET', '/api/delivery-slots', { tag: 'Checkout', summary: 'Delivery slots for the next 4 days' }, () => {
  ensureSlots();
  const today = localDate(new Date());
  const rows = db.all('SELECT * FROM delivery_slots WHERE slot_date >= ? ORDER BY slot_date, start_time LIMIT 20', today);
  const days = {};
  for (const r of rows) (days[r.slot_date] = days[r.slot_date] || []).push(slotView(r));
  return Object.entries(days).map(([date, slots]) => ({ date, slots }));
});

// ---------------------------------------------------------------- checkout
route('POST', '/api/checkout', {
  tag: 'Checkout', summary: 'Place an order from the cart. Send an Idempotency-Key header to make retries safe', auth: 'user',
  body: { addressId: 1, slotId: 5, paymentMethod: 'UPI', upiId: 'success@kaupi', card: { number: '4111111111111111', expiry: '12/30', cvv: '123', name: 'Demo User' }, notes: 'Leave at the door' },
}, ctx => {
  const user = ctx.user;
  const idem = str(ctx.req.headers['idempotency-key']);
  if (idem) {
    const prev = db.get('SELECT order_no FROM orders WHERE user_id = ? AND idempotency_key = ?', user.id, idem);
    if (prev) return { status: 200, body: { ...orderDetail(prev.order_no, user.id), replayed: true } };
  }
  const cart = cartView(user.id);
  if (!cart.items.length) throw new HttpError(422, 'CART_EMPTY', 'Your cart is empty');
  if (cart.hasIssues) throw new HttpError(409, 'CART_HAS_ISSUES', 'Some items in your cart are unavailable. Update your cart and try again', { items: cart.items.filter(i => !i.available).map(i => ({ variantId: i.variantId, issue: i.issue })) });
  if (cart.couponError) throw new HttpError(422, 'COUPON_INVALID', cart.couponError);

  const b = ctx.body;
  const method = str(b.paymentMethod).toUpperCase();
  const errors = {
    addressId: !b.addressId ? 'Select a delivery address' : null,
    slotId: !b.slotId ? 'Select a delivery slot' : null,
    paymentMethod: !['COD', 'UPI', 'CARD'].includes(method) ? 'Choose COD, UPI or CARD' : null,
  };
  if (method === 'COD' && cart.total > COD_LIMIT) errors.paymentMethod = `Cash on delivery is available only for orders up to ₹${COD_LIMIT}`;
  if (method === 'UPI' && !RE.upi.test(str(b.upiId))) errors.upiId = 'Enter a valid UPI ID, e.g. name@bank';
  let cardNo = '';
  if (method === 'CARD') {
    const c = b.card || {};
    cardNo = str(c.number).replace(/[\s-]/g, '');
    if (!/^\d{16}$/.test(cardNo) || !luhn(cardNo)) errors.cardNumber = 'Enter a valid 16-digit card number';
    const m = /^(\d{2})\/(\d{2})$/.exec(str(c.expiry));
    if (!m || +m[1] < 1 || +m[1] > 12) errors.cardExpiry = 'Expiry must be in MM/YY format';
    else if (new Date(2000 + +m[2], +m[1], 1) <= new Date()) errors.cardExpiry = 'This card has expired';
    if (!/^\d{3}$/.test(str(c.cvv))) errors.cardCvv = 'CVV must be 3 digits';
    if (str(c.name).length < 2) errors.cardName = 'Name on card is required';
  }
  if (str(b.notes).length > 200) errors.notes = 'Delivery notes can be at most 200 characters';
  fail(errors);

  const addr = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', Number(b.addressId), user.id);
  if (!addr) throw new HttpError(422, 'VALIDATION_FAILED', 'Select a valid delivery address', { addressId: 'Address not found' });
  const slotRow = db.get('SELECT * FROM delivery_slots WHERE id = ?', Number(b.slotId));
  if (!slotRow) throw new HttpError(422, 'VALIDATION_FAILED', 'Select a valid delivery slot', { slotId: 'Slot not found' });
  const slot = slotView(slotRow);
  if (!slot.available && !(state.lab.bugs.slotOverbooking && slot.reason === 'Fully booked')) throw new HttpError(409, 'SLOT_UNAVAILABLE', `This delivery slot is not available (${slot.reason}). Pick another slot`);

  // ---- payment simulation
  let paymentStatus = 'pending', paymentRef = null;
  if (method === 'UPI') {
    const handle = str(b.upiId).toLowerCase();
    if (handle.startsWith('failure@')) throw new HttpError(402, 'PAYMENT_FAILED', 'UPI payment was declined by your bank');
    if (handle.startsWith('timeout@')) throw new HttpError(504, 'PAYMENT_TIMEOUT', 'UPI app did not respond in time. You have not been charged');
    paymentStatus = 'paid'; paymentRef = 'UPI' + Date.now();
  }
  if (method === 'CARD') {
    const outcome = TEST_CARDS[cardNo] || 'success';
    if (outcome === 'declined') throw new HttpError(402, 'CARD_DECLINED', 'Your card was declined');
    if (outcome === 'insufficient_funds') throw new HttpError(402, 'INSUFFICIENT_FUNDS', 'Insufficient funds on this card');
    if (outcome === 'gateway_error') throw new HttpError(502, 'PAYMENT_GATEWAY_ERROR', 'Payment gateway error. Please try again');
    paymentStatus = 'paid'; paymentRef = 'CARD' + Date.now() + '-' + cardNo.slice(-4);
  }

  // ---- write everything in one transaction
  const orderNo = db.tx(() => {
    for (const i of cart.items) {
      const r = db.run('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?', i.qty, i.variantId, i.qty);
      if (!r.changes) throw new HttpError(409, 'INSUFFICIENT_STOCK', `${i.name} (${i.variantLabel}) just went out of stock`);
    }
    const booked = state.lab.bugs.slotOverbooking
      ? db.run('UPDATE delivery_slots SET booked = booked + 1 WHERE id = ?', slotRow.id)
      : db.run('UPDATE delivery_slots SET booked = booked + 1 WHERE id = ? AND booked < capacity', slotRow.id);
    if (!booked.changes) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'This delivery slot just got fully booked');
    const seq = db.get('SELECT COALESCE(MAX(id), 0) + 10001 AS n FROM orders').n;
    const no = `KA${localDate(new Date()).replace(/-/g, '')}-${seq}`;
    const t = now();
    const oid = db.run(`INSERT INTO orders (order_no, user_id, status, item_count, subtotal, mrp_total, discount, delivery_fee, total, coupon_code, payment_method, payment_status, payment_ref,
      ship_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode, slot_id, slot_label, idempotency_key, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      no, user.id, 'placed', cart.itemCount, cart.subtotal, cart.mrpTotal, cart.discount, cart.deliveryFee, cart.total, cart.coupon?.code || null, method, paymentStatus, paymentRef,
      addr.full_name, addr.phone, addr.line1, addr.line2, addr.city, addr.state, addr.pincode, slotRow.id, `${slot.date} ${slot.label}`, idem || null, t, t).lastInsertRowid;
    for (const i of cart.items) {
      db.run('INSERT INTO order_items (order_id, variant_id, product_id, product_name, variant_label, emoji, unit_mrp, unit_price, qty, line_total) VALUES (?,?,?,?,?,?,?,?,?,?)',
        oid, i.variantId, i.productId, i.name, i.variantLabel, i.emoji, i.mrp, i.price, i.qty, i.lineTotal);
    }
    db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', oid, 'placed', str(b.notes) || 'Order placed', t);
    db.run('DELETE FROM cart_items WHERE user_id = ?', user.id);
    db.run('DELETE FROM carts WHERE user_id = ?', user.id);
    return no;
  });
  audit(user.id, 'order.place', 'order', orderNo, { total: cart.total, method });
  sendEmail(user.email, `Order ${orderNo} confirmed`, `Hi ${user.name},\n\nThanks for your order ${orderNo}.\nItems: ${cart.itemCount}\nTotal: ${fmtINR(cart.total)} (${method})\nDelivery slot: ${slot.date} ${slot.label}\n\nThis is a practice order — nothing will be delivered.\n— KarthikAutomation`);
  return { status: 201, body: orderDetail(orderNo, user.id) };
});

// ---------------------------------------------------------------- order queries
function orderSummary(o) {
  return { orderNo: o.order_no, status: o.status, statusLabel: STATUS_LABEL[o.status], itemCount: o.item_count, total: o.total, paymentMethod: o.payment_method, paymentStatus: o.payment_status, createdAt: o.created_at, slot: o.slot_label };
}

function orderDetail(orderNo, userId) {
  const o = db.get(`SELECT * FROM orders WHERE order_no = ?${userId ? ' AND user_id = ?' : ''}`, ...(userId ? [orderNo, userId] : [orderNo]));
  if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  const items = db.all('SELECT * FROM order_items WHERE order_id = ?', o.id).map(i => ({ productId: i.product_id, variantId: i.variant_id, name: i.product_name, variantLabel: i.variant_label, emoji: i.emoji, mrp: i.unit_mrp, price: i.unit_price, qty: i.qty, lineTotal: i.line_total }));
  const events = db.all('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id).map(e => ({ status: e.status, label: STATUS_LABEL[e.status] || e.status, note: e.note, at: e.created_at }));
  const ret = db.get('SELECT id, reason, status, created_at FROM returns WHERE order_id = ? ORDER BY id DESC', o.id);
  const deliveredAge = o.delivered_at ? (Date.now() - new Date(o.delivered_at)) / 86400000 : null;
  return {
    ...orderSummary(o), items, events,
    pricing: { mrpTotal: o.mrp_total, subtotal: o.subtotal, productSavings: money(o.mrp_total - o.subtotal), discount: o.discount, coupon: o.coupon_code, deliveryFee: o.delivery_fee, total: o.total },
    payment: { method: o.payment_method, status: o.payment_status, reference: o.payment_ref },
    shipTo: { name: o.ship_name, phone: o.ship_phone, line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, state: o.ship_state, pincode: o.ship_pincode },
    deliveredAt: o.delivered_at, cancelReason: o.cancel_reason,
    return: ret ? { id: ret.id, reason: ret.reason, status: ret.status, createdAt: ret.created_at } : null,
    canCancel: CANCELLABLE.includes(o.status),
    canReturn: o.status === 'delivered' && deliveredAge !== null && deliveredAge <= RETURN_DAYS,
  };
}

route('GET', '/api/orders', { tag: 'Orders', summary: 'My orders (newest first)', auth: 'user', query: ['status', 'page', 'pageSize'] }, ctx => {
  const { page, pageSize, offset } = paging(ctx.query, 10, 50);
  const st = ctx.query.status;
  if (st && !STATUS_LABEL[st]) throw new HttpError(400, 'BAD_QUERY', 'Unknown status filter');
  const where = st ? 'AND status = ?' : '';
  const args = st ? [ctx.user.id, st] : [ctx.user.id];
  const total = db.get(`SELECT COUNT(*) AS n FROM orders WHERE user_id = ? ${where}`, ...args).n;
  const rows = db.all(`SELECT * FROM orders WHERE user_id = ? ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...args, pageSize, offset);
  const firstItems = rows.length ? db.all(`SELECT order_id, emoji FROM order_items WHERE order_id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.id)) : [];
  return {
    items: rows.map(r => ({ ...orderSummary(r), emojis: firstItems.filter(f => f.order_id === r.id).map(f => f.emoji).slice(0, 4) })),
    page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
});

route('GET', '/api/orders/:orderNo', { tag: 'Orders', summary: 'Order details, items and tracking events', auth: 'user' }, ctx => orderDetail(ctx.params.orderNo, state.lab.bugs.idorOrders ? null : ctx.user.id)); // idorOrders = seeded security bug

function restoreStock(orderId) {
  for (const i of db.all('SELECT variant_id, qty FROM order_items WHERE order_id = ?', orderId)) db.run('UPDATE variants SET stock = stock + ? WHERE id = ?', i.qty, i.variant_id);
}

route('POST', '/api/orders/:orderNo/cancel', { tag: 'Orders', summary: 'Cancel an order (only before it is out for delivery)', auth: 'user', body: { reason: 'Ordered by mistake' } }, ctx => {
  const o = db.get('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', ctx.params.orderNo, ctx.user.id);
  if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  const reason = str(ctx.body.reason);
  fail({ reason: reason.length < 3 ? 'Please tell us why you are cancelling' : null });
  if (!CANCELLABLE.includes(o.status)) throw new HttpError(409, 'CANNOT_CANCEL', `Orders that are "${STATUS_LABEL[o.status]}" can no longer be cancelled`);
  db.tx(() => {
    if (!state.lab.bugs.stockNotRestoredOnCancel) restoreStock(o.id);
    if (o.slot_id) db.run('UPDATE delivery_slots SET booked = MAX(booked - 1, 0) WHERE id = ?', o.slot_id);
    db.run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, payment_status = ?, updated_at = ? WHERE id = ?", reason, o.payment_status === 'paid' ? 'refunded' : 'failed', now(), o.id);
    db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', o.id, 'cancelled', reason, now());
  });
  audit(ctx.user.id, 'order.cancel', 'order', o.order_no, { reason });
  sendEmail(ctx.user.email, `Order ${o.order_no} cancelled`, `Hi ${ctx.user.name},\n\nYour order ${o.order_no} has been cancelled.${o.payment_status === 'paid' ? `\nA refund of ${fmtINR(o.total)} has been initiated.` : ''}`);
  return orderDetail(o.order_no, ctx.user.id);
});

route('POST', '/api/orders/:orderNo/return', { tag: 'Orders', summary: `Request a return (within ${RETURN_DAYS} days of delivery)`, auth: 'user', body: { reason: 'Item was damaged' } }, ctx => {
  const o = db.get('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', ctx.params.orderNo, ctx.user.id);
  if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  const reason = str(ctx.body.reason);
  fail({ reason: reason.length < 5 ? 'Describe the problem (min 5 characters)' : null });
  if (o.status !== 'delivered') throw new HttpError(409, 'CANNOT_RETURN', 'Only delivered orders can be returned');
  if ((Date.now() - new Date(o.delivered_at)) / 86400000 > RETURN_DAYS) throw new HttpError(409, 'RETURN_WINDOW_CLOSED', `Returns are accepted within ${RETURN_DAYS} days of delivery`);
  db.tx(() => {
    db.run('INSERT INTO returns (order_id, reason, created_at) VALUES (?,?,?)', o.id, reason, now());
    db.run("UPDATE orders SET status = 'return_requested', updated_at = ? WHERE id = ?", now(), o.id);
    db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', o.id, 'return_requested', reason, now());
  });
  audit(ctx.user.id, 'order.return_request', 'order', o.order_no, { reason });
  return orderDetail(o.order_no, ctx.user.id);
});

route('POST', '/api/orders/:orderNo/reorder', { tag: 'Orders', summary: 'Add all available items from an old order to the cart', auth: 'user' }, ctx => {
  const o = db.get('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', ctx.params.orderNo, ctx.user.id);
  if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  const added = [], skipped = [];
  for (const i of db.all('SELECT oi.*, v.stock, p.is_active FROM order_items oi JOIN variants v ON v.id = oi.variant_id JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?', o.id)) {
    const cur = db.get('SELECT qty FROM cart_items WHERE user_id = ? AND variant_id = ?', ctx.user.id, i.variant_id)?.qty || 0;
    const qty = Math.min(i.qty + cur, 10, i.stock);
    if (!i.is_active || qty <= cur) { skipped.push({ name: i.product_name, reason: !i.is_active ? 'Unavailable' : 'Out of stock' }); continue; }
    db.run('INSERT INTO cart_items (user_id, variant_id, qty, added_at) VALUES (?,?,?,?) ON CONFLICT(user_id, variant_id) DO UPDATE SET qty = excluded.qty', ctx.user.id, i.variant_id, qty, now());
    added.push(i.product_name);
  }
  return { added, skipped, cart: cartView(ctx.user.id) };
});

route('GET', '/api/orders/:orderNo/invoice', { tag: 'Orders', summary: 'Download the invoice as an HTML file (Content-Disposition: attachment)', auth: 'user' }, ctx => {
  const d = orderDetail(ctx.params.orderNo, ctx.user.id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = d.items.map(i => `<tr><td>${esc(i.name)} (${esc(i.variantLabel)})</td><td>${i.qty}</td><td>${fmtINR(i.price)}</td><td>${fmtINR(i.lineTotal)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(d.orderNo)}</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:30px auto;color:#111}h1{color:#e10600}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.r{text-align:right}</style></head>
<body><h1>KarthikAutomation Practice Store</h1><p><b>TAX INVOICE (PRACTICE ONLY — NOT A REAL INVOICE)</b></p>
<p>Invoice for order <b id="order-no">${esc(d.orderNo)}</b><br>Date: ${new Date(d.createdAt).toLocaleString('en-IN')}<br>Status: ${esc(d.statusLabel)}</p>
<p><b>Ship to:</b> ${esc(d.shipTo.name)}, ${esc(d.shipTo.line1)}, ${esc(d.shipTo.city)}, ${esc(d.shipTo.state)} ${esc(d.shipTo.pincode)}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p class="r">Subtotal: ${fmtINR(d.pricing.subtotal)}<br>Discount: -${fmtINR(d.pricing.discount)}<br>Delivery: ${fmtINR(d.pricing.deliveryFee)}<br><b>Grand total: <span id="grand-total">${fmtINR(d.pricing.total)}</span></b></p>
<p>Payment: ${esc(d.payment.method)} (${esc(d.payment.status)})</p><p style="color:#777">Product designed by Karthik Puttoju · For automation learning only.</p></body></html>`;
  return { raw: html, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="invoice-${d.orderNo}.html"` } };
});

module.exports = { orderDetail, orderSummary, restoreStock, STATUS_LABEL, CANCELLABLE };
