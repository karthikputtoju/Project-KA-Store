import { state, views, $, $$, app, esc, inr, api, toast, setBusy, emptyState, refreshCart, updateBadge, modal, confirmDialog, needLogin, uuid, confetti, dateTime, date, pager, bindPager, field, selectField, showFieldErrors, formData, refreshView } from './core.js';

// ---------------------------------------------------------------- cart
function summary(c, { checkout = false } = {}) {
  return `<aside class="panel summary" data-testid="order-summary"><h2>Bill details</h2>
    ${!checkout ? `<form class="coupon" id="couponForm" data-testid="coupon-form"><label class="sr-only" for="couponCode">Coupon code</label>
      <input id="couponCode" placeholder="Enter coupon code" value="${esc(c.coupon?.code || '')}" data-testid="coupon-input" autocapitalize="characters"><button class="btn sm ghost" data-testid="coupon-apply">Apply</button></form>
      <button class="linkish" id="viewCoupons" style="background:none;border:0;color:var(--red);font-weight:700;cursor:pointer;padding:0 0 10px" data-testid="view-coupons">View available coupons</button>
      ${c.coupon && !c.couponError ? `<p style="margin:0 0 10px" data-testid="coupon-applied">✅ <code>${esc(c.coupon.code)}</code> applied <button id="rmCoupon" style="background:none;border:0;color:var(--red);cursor:pointer;font-weight:700" data-testid="coupon-remove">Remove</button></p>` : ''}
      ${c.couponError ? `<p class="note" data-testid="coupon-error">⚠ ${esc(c.couponError)} <button id="rmCoupon" style="background:none;border:0;color:var(--red);cursor:pointer;font-weight:700" data-testid="coupon-remove">Remove</button></p>` : ''}` : ''}
    <dl>
      <dt>Items total (MRP)</dt><dd data-testid="summary-mrp">${inr(c.mrpTotal)}</dd>
      <dt>Product discount</dt><dd class="savings" data-testid="summary-product-savings">−${inr(c.productSavings)}</dd>
      <dt>Subtotal</dt><dd data-testid="summary-subtotal">${inr(c.subtotal)}</dd>
      <dt>Coupon discount</dt><dd class="savings" data-testid="summary-discount">−${inr(c.discount)}</dd>
      <dt>Delivery fee</dt><dd data-testid="summary-delivery">${c.deliveryFee ? inr(c.deliveryFee) : '<span class="savings">FREE</span>'}</dd>
      <dt class="total">To pay</dt><dd class="total" data-testid="summary-total">${inr(c.total)}</dd>
    </dl>
    ${c.totalSavings > 0 ? `<p class="free-bar done" style="margin:0 0 14px" data-testid="total-savings">🎉 You save ${inr(c.totalSavings)} on this order</p>` : ''}
    ${!checkout ? `<a class="btn block" href="#/checkout" data-testid="checkout-button" ${c.hasIssues ? 'aria-disabled="true" style="pointer-events:none;opacity:.4"' : ''}>Proceed to checkout →</a>${c.hasIssues ? '<p class="err" data-testid="cart-issues">Remove unavailable items to continue</p>' : ''}` : ''}
  </aside>`;
}

const rerender = () => { if (location.hash.startsWith('#/cart')) views.cart(null, null, true); }; // only if still on the cart
views.cart = async (_p, _id, still = false) => {
  if (needLogin('Log in to view your cart')) return;
  const c = await refreshCart();
  if (!c?.items.length) {
    app().innerHTML = `<div class="view" data-testid="page-cart">${emptyState('🛒', 'Your cart is empty', 'Add fresh groceries and daily essentials to get started.', '<a class="btn" href="#/shop" data-testid="continue-shopping">Start shopping</a>', 'cart-empty')}</div>`;
    return;
  }
  const pct = Math.min(100, ((c.freeDeliveryThreshold - c.amountForFreeDelivery) / c.freeDeliveryThreshold) * 100);
  app().innerHTML = `<div class="view${still ? ' still' : ''}" data-testid="page-cart">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h1>My cart <small class="muted" style="font-size:1rem" data-testid="cart-item-count">(${c.itemCount} items)</small></h1>
      <button class="btn ghost sm" id="clearCart" data-testid="clear-cart">Empty cart</button></div>
    <div class="cart-layout"><section>
      ${c.amountForFreeDelivery > 0 ? `<div class="free-bar" data-testid="free-delivery-progress">Add <b>${inr(c.amountForFreeDelivery)}</b> more for <b>FREE delivery</b><div class="bar"><i style="width:${pct}%"></i></div></div>` : `<div class="free-bar done" data-testid="free-delivery-unlocked">🚚 Yay! You get FREE delivery</div>`}
      <div class="panel" data-testid="cart-items">${c.items.map(i => `
        <div class="cline" data-testid="cart-line" data-variant-id="${i.variantId}">
          <div class="pimg"><span class="em">${i.emoji}</span></div>
          <div><a href="#/product/${i.productId}" style="color:var(--text);font-weight:700" data-testid="cart-item-name">${esc(i.name)}</a>
            <div class="muted" style="font-size:.85rem" data-testid="cart-item-variant">${esc(i.variantLabel)} · ${inr(i.price)} each</div>${i.issue ? `<div class="issue" data-testid="cart-item-issue">${esc(i.issue)}</div>` : ''}</div>
          <div class="stepper" data-testid="qty-stepper"><button data-q="${i.variantId}" data-d="-1" aria-label="Decrease quantity of ${esc(i.name)}" data-testid="cart-qty-decrease">−</button><span data-testid="cart-qty">${i.qty}</span><button data-q="${i.variantId}" data-d="1" aria-label="Increase quantity of ${esc(i.name)}" data-testid="cart-qty-increase">+</button></div>
          <div style="text-align:right"><b data-testid="cart-line-total">${inr(i.lineTotal)}</b>${i.lineMrp > i.lineTotal ? `<br><s class="muted" style="font-size:.8rem">${inr(i.lineMrp)}</s>` : ''}<br><button data-rm="${i.variantId}" style="background:none;border:0;color:var(--red);cursor:pointer;font-size:.82rem;font-weight:700" data-testid="cart-remove">Remove</button></div>
        </div>`).join('')}</div>
    </section>${summary(c)}</div></div>`;

  $$('[data-q]').forEach(b => (b.onclick = async () => {
    const i = c.items.find(x => x.variantId === Number(b.dataset.q));
    b.disabled = true;
    try { state.cart = await api('PATCH', `/api/cart/items/${i.variantId}`, { qty: i.qty + Number(b.dataset.d) }); updateBadge(true); } catch (e) { toast(e.message, 'error'); }
    rerender();
  }));
  $$('[data-rm]').forEach(b => (b.onclick = async () => { await api('DELETE', `/api/cart/items/${b.dataset.rm}`); toast('Item removed'); updateBadge(true); rerender(); }));
  $('#clearCart').onclick = async () => { if (await confirmDialog('Empty cart?', 'This will remove all items from your cart.', 'Empty cart')) { await api('DELETE', '/api/cart'); toast('Cart emptied'); rerender(); } };
  bindCoupon();
};

function bindCoupon() {
  $('#couponForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('button', e.target);
    setBusy(btn, true);
    try { state.cart = await api('POST', '/api/cart/coupon', { code: $('#couponCode').value }); toast('Coupon applied', 'success'); rerender(); }
    catch (err) { setBusy(btn, false); toast(err.message, 'error'); $('#couponCode').setAttribute('aria-invalid', 'true'); }
  };
  $('#rmCoupon')?.addEventListener('click', async () => { await api('DELETE', '/api/cart/coupon'); rerender(); });
  $('#viewCoupons').onclick = async () => {
    const list = await api('GET', '/api/coupons');
    modal({
      title: 'Available coupons', testid: 'coupons-modal',
      body: `<div class="coupon-list">${list.map(c => `<div class="cp ${c.expired ? 'expired' : ''}" data-testid="coupon-${c.code}"><div><code>${c.code}</code><p style="margin:6px 0 0;font-size:.88rem">${esc(c.description)}</p>${c.expired ? '<small class="err">Expired</small>' : ''}</div>
        <button class="btn sm" data-apply="${c.code}" ${c.expired ? 'disabled' : ''} data-testid="apply-${c.code}">Apply</button></div>`).join('')}</div>`,
      onOpen: (back, close) => $$('[data-apply]', back).forEach(b => (b.onclick = async () => {
        try { state.cart = await api('POST', '/api/cart/coupon', { code: b.dataset.apply }); close(); toast(`${b.dataset.apply} applied`, 'success'); rerender(); }
        catch (err) { toast(err.message, 'error'); }
      })),
    });
  };
}

// ---------------------------------------------------------------- address form (shared with account)
export function addressForm(a, states = []) {
  a = a || {}; // callers pass null for a new address
  return `<form id="addrForm" novalidate data-testid="address-form"><div class="form-error-slot"></div>
    <div class="field"><span style="font-weight:600;font-size:.85rem">Save as</span><div class="chip-list" role="radiogroup">${['Home', 'Work', 'Other'].map(l => `<label class="chk" style="padding:0 10px 0 0"><input type="radio" name="label" value="${l}" ${(a.label || 'Home') === l ? 'checked' : ''} data-testid="address-label-${l}"> ${l}</label>`).join('')}</div></div>
    <div class="row2">${field('fullName', 'Full name', 'autocomplete="name"', a.fullName || state.user?.name || '')}${field('phone', 'Mobile number', 'inputmode="numeric" maxlength="10" autocomplete="tel"', a.phone || state.user?.phone || '')}</div>
    ${field('line1', 'Flat / House no., Building, Street', 'autocomplete="address-line1"', a.line1 || '')}
    ${field('line2', 'Area / Landmark (optional)', 'autocomplete="address-line2"', a.line2 || '')}
    <div class="row3">${field('city', 'City', 'autocomplete="address-level2"', a.city || '')}${selectField('state', 'State', states, a.state || '')}${field('pincode', 'PIN code', 'inputmode="numeric" maxlength="6" autocomplete="postal-code"', a.pincode || '')}</div>
    ${a.id ? '' : '<label class="checkline"><input type="checkbox" name="isDefault" data-testid="input-isDefault"> Make this my default address</label>'}
  </form>`;
}
let statesCache = null;
export async function openAddressModal(a, onSaved) {
  const states = statesCache || (statesCache = await api('GET', '/api/states'));
  modal({
    title: a?.id ? 'Edit address' : 'Add a new address', testid: 'address-modal', wide: true, body: addressForm(a, states),
    footer: '<button class="btn ghost" data-close data-testid="address-cancel">Cancel</button><button class="btn" id="saveAddr" data-testid="address-save">Save address</button>',
    onOpen: (back, close) => {
      $('#saveAddr', back).onclick = async e => {
        const f = $('#addrForm', back);
        const body = { ...formData(f), isDefault: !!f.elements.isDefault?.checked };
        setBusy(e.currentTarget, true);
        try { const saved = await api(a?.id ? 'PUT' : 'POST', a?.id ? `/api/account/addresses/${a.id}` : '/api/account/addresses', body); close(); toast('Address saved', 'success'); onSaved?.(saved); }
        catch (err) { setBusy(e.currentTarget, false); $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="address-error">${esc(err.message)}</div>`; showFieldErrors(f, err.details); }
      };
    },
  });
}

// ---------------------------------------------------------------- checkout
views.checkout = async () => {
  if (needLogin('Log in to checkout')) return;
  const [c, addresses, days] = await Promise.all([refreshCart(), api('GET', '/api/account/addresses'), api('GET', '/api/delivery-slots')]);
  if (!c?.items.length) { location.hash = '#/cart'; return; }
  const idemKey = uuid();
  const firstOpenDay = days.find(d => d.slots.some(s => s.available)) || days[0];
  const sel = { addressId: (addresses.find(a => a.isDefault) || addresses[0])?.id, day: firstOpenDay?.date };
  sel.slotId = firstOpenDay?.slots.find(s => s.available)?.id; // pre-select the earliest open slot, like real stores do
  const dayLabel = d => { const dt = new Date(d + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); const diff = Math.round((dt - t) / 86400000); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-IN', { weekday: 'short' }); };

  app().innerHTML = `<div class="view" data-testid="page-checkout"><h1>Checkout</h1><div class="co-grid"><div>
    <section class="panel co-step" data-testid="step-address"><h2><span class="n">1</span> Delivery address</h2>
      <div class="addr-grid" id="addrList" role="radiogroup" aria-label="Delivery address">${addresses.map(a => `<label class="addr" data-testid="address-option"><input type="radio" name="addr" value="${a.id}" ${a.id === sel.addressId ? 'checked' : ''} data-testid="address-radio-${a.id}">
        <span class="lbl">${esc(a.label)}</span><b>${esc(a.fullName)}</b>${a.isDefault ? ' <small class="muted">(default)</small>' : ''}<br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br><small class="muted">📞 ${esc(a.phone)}</small></label>`).join('')}
        <button type="button" class="addr add" id="newAddr" data-testid="add-new-address">+ Add new address</button></div>
      <span class="err" data-testid="error-addressId" id="errAddr"></span></section>
    <section class="panel co-step" data-testid="step-slot"><h2><span class="n">2</span> Delivery slot</h2>
      <div class="day-tabs" role="tablist" data-testid="slot-days">${days.map(d => `<button role="tab" aria-selected="${d.date === sel.day}" data-day="${d.date}" data-testid="slot-day-${d.date}">${dayLabel(d.date)}<small>${new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></button>`).join('')}</div>
      <div class="slots" id="slotList" role="radiogroup" aria-label="Delivery time" data-testid="slot-list"></div>
      <span class="err" data-testid="error-slotId" id="errSlot"></span></section>
    <section class="panel co-step" data-testid="step-payment"><h2><span class="n">3</span> Payment</h2>
      <form id="payForm" novalidate data-testid="payment-form"><div class="form-error-slot"></div>
        <label class="pay-opt"><div class="pay-head"><input type="radio" name="paymentMethod" value="UPI" checked data-testid="pay-upi"> 📱 UPI <small>Test: success@kaupi · failure@kaupi · timeout@kaupi</small></div>
          <div class="pay-form">${field('upiId', 'UPI ID', 'placeholder="yourname@bank" autocomplete="off"', 'success@kaupi')}</div></label>
        <label class="pay-opt"><div class="pay-head"><input type="radio" name="paymentMethod" value="CARD" data-testid="pay-card"> 💳 Credit / Debit card <small>Test: 4111 1111 1111 1111</small></div>
          <div class="pay-form">${field('cardNumber', 'Card number', 'inputmode="numeric" autocomplete="cc-number" placeholder="4111 1111 1111 1111" maxlength="19"')}
            <div class="row3">${field('cardName', 'Name on card', 'autocomplete="cc-name"', state.user.name)}${field('cardExpiry', 'Expiry (MM/YY)', 'placeholder="12/30" maxlength="5" autocomplete="cc-exp"')}${field('cardCvv', 'CVV', 'type="password" inputmode="numeric" maxlength="3" autocomplete="cc-csc" placeholder="•••"')}</div>
            <small class="muted">Declined: 4000 0000 0000 0002 · No funds: 4000 0000 0000 9995 · Gateway error: 4000 0000 0000 0119</small></div></label>
        <label class="pay-opt"><div class="pay-head"><input type="radio" name="paymentMethod" value="COD" data-testid="pay-cod" ${c.total > 3000 ? 'disabled' : ''}> 💵 Cash on delivery <small>${c.total > 3000 ? 'Not available above ₹3,000' : 'Pay when you receive'}</small></div></label>
        <div class="field"><label for="f-notes">Delivery instructions (optional)</label><textarea id="f-notes" name="notes" rows="2" maxlength="200" placeholder="e.g. Leave at the door" data-testid="input-notes"></textarea></div>
      </form></section>
    </div>
    <div>${summary(c, { checkout: true })}
      <div class="panel" style="margin-top:14px" data-testid="checkout-items"><h2>${c.itemCount} items</h2>${c.items.map(i => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:.9rem;padding:4px 0"><span>${i.emoji} ${esc(i.name)} <span class="muted">× ${i.qty}</span></span><b>${inr(i.lineTotal)}</b></div>`).join('')}</div>
      <button class="btn block" id="placeOrder" style="margin-top:14px;padding:16px" data-testid="place-order">Place order · ${inr(c.total)}</button>
      <p class="muted" style="font-size:.8rem;text-align:center">Practice checkout — no real money is charged.</p></div>
  </div></div>`;

  const paintSlots = () => {
    const d = days.find(x => x.date === sel.day);
    $('#slotList').innerHTML = d.slots.map(s => `<label class="slot" data-testid="slot-option"><input type="radio" name="slot" value="${s.id}" ${s.available ? '' : 'disabled'} ${sel.slotId === s.id ? 'checked' : ''} data-testid="slot-${s.id}">${s.label}<small>${s.available ? `${s.remaining} left` : esc(s.reason)}</small></label>`).join('');
    $$('input[name="slot"]').forEach(r => (r.onchange = () => (sel.slotId = Number(r.value))));
  };
  paintSlots();
  $$('[data-day]').forEach(b => (b.onclick = () => { sel.day = b.dataset.day; $$('[data-day]').forEach(x => x.setAttribute('aria-selected', String(x === b))); paintSlots(); }));
  $$('input[name="addr"]').forEach(r => (r.onchange = () => (sel.addressId = Number(r.value))));
  $('#newAddr').onclick = () => openAddressModal(null, () => refreshView());
  const f = $('#payForm');
  f.elements.cardNumber.oninput = e => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim());
  f.elements.cardExpiry.oninput = e => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); e.target.value = v; };

  $('#placeOrder').onclick = async e => {
    const btn = e.currentTarget;
    $('#errAddr').textContent = ''; $('#errSlot').textContent = '';
    const fd = formData(f);
    const body = { addressId: sel.addressId, slotId: sel.slotId, paymentMethod: fd.paymentMethod, upiId: fd.upiId, notes: fd.notes, card: { number: fd.cardNumber, expiry: fd.cardExpiry, cvv: fd.cardCvv, name: fd.cardName } };
    setBusy(btn, true);
    try {
      const order = await api('POST', '/api/checkout', body, { 'Idempotency-Key': idemKey });
      state.cart = null; updateBadge();
      location.hash = `#/order/${order.orderNo}?placed=1`;
    } catch (err) {
      setBusy(btn, false);
      $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="checkout-error" role="alert">${esc(err.message)}</div>`;
      showFieldErrors(f, err.details);
      if (err.details?.addressId) $('#errAddr').textContent = err.details.addressId;
      if (err.details?.slotId) $('#errSlot').textContent = err.details.slotId;
      (err.details?.addressId ? $('[data-testid="step-address"]') : err.details?.slotId ? $('[data-testid="step-slot"]') : f).scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(err.message, 'error');
    }
  };
};

// ---------------------------------------------------------------- orders
const STATUSES = [['', 'All'], ['placed', 'Placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['return_requested', 'Return requested'], ['returned', 'Returned']];
views.orders = async params => {
  if (needLogin('Log in to see your orders')) return;
  const st = params.get('status') || '', page = Number(params.get('page') || 1);
  const data = await api('GET', `/api/orders?page=${page}&pageSize=8${st ? '&status=' + st : ''}`);
  app().innerHTML = `<div class="view" data-testid="page-orders"><h1>My orders</h1>
    <div class="filter-tabs" role="tablist" data-testid="order-status-filter">${STATUSES.map(([v, l]) => `<button class="chip" aria-pressed="${v === st}" data-st="${v}" data-testid="order-filter-${v || 'all'}">${l}</button>`).join('')}</div>
    <div data-testid="orders-list">${data.items.length ? data.items.map((o, i) => `<a class="order-card" style="--i:${i};color:var(--text)" href="#/order/${o.orderNo}" data-testid="order-row" data-order-no="${o.orderNo}">
      <span class="ems" aria-hidden="true">${o.emojis.join('')}</span>
      <div><b data-testid="order-number">${o.orderNo}</b><br><small class="muted">${dateTime(o.createdAt)} · ${o.itemCount} items · ${o.paymentMethod}</small></div>
      <div style="text-align:right"><span class="status ${o.status}" data-testid="order-status">${o.statusLabel}</span><br><b data-testid="order-total">${inr(o.total)}</b></div></a>`).join('')
      : emptyState('📦', st ? 'No orders with this status' : 'No orders yet', 'Your orders will show up here.', '<a class="btn" href="#/shop">Start shopping</a>', 'orders-empty')}</div>
    <div id="pg">${pager(data.page, data.totalPages)}</div></div>`;
  $$('[data-st]').forEach(b => (b.onclick = () => (location.hash = '#/orders' + (b.dataset.st ? '?status=' + b.dataset.st : ''))));
  bindPager($('#pg'), n => (location.hash = `#/orders?page=${n}${st ? '&status=' + st : ''}`));
};

views.order = async (params, orderNo) => {
  if (needLogin()) return;
  let o;
  try { o = await api('GET', '/api/orders/' + encodeURIComponent(orderNo)); } catch (e) { return views.notFound(e.status === 404 ? 'Order not found.' : e.message); }
  const placed = params.get('placed') === '1';
  const flow = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered'];
  const reached = new Set(o.events.map(e => e.status));
  const steps = ['cancelled', 'returned', 'return_requested'].includes(o.status) ? o.events : flow.map(s => ({ status: s, label: { placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered' }[s], at: o.events.find(e => e.status === s)?.at, pending: !reached.has(s) }));
  app().innerHTML = `<div class="view" data-testid="page-order-detail">
    ${placed ? `<div class="success"><div class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h1 data-testid="order-success">Order placed successfully!</h1><p class="muted">A confirmation email is in your <a href="#/mailbox">test mailbox</a>. This is a practice order — nothing will be delivered.</p></div>` : `<div class="crumbs"><a href="#/orders">My orders</a> / <span>${esc(o.orderNo)}</span></div>`}
    <div class="co-grid">
      <div>
        <div class="panel" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
          <div><small class="muted">Order number</small><div class="order-id" data-testid="order-number">${esc(o.orderNo)}</div><small class="muted">Placed on ${dateTime(o.createdAt)} · Slot ${esc(o.slot || '-')}</small></div>
          <span class="status ${o.status}" data-testid="order-status">${o.statusLabel}</span></div></div>
        <div class="panel" style="margin-bottom:16px"><h2>Tracking</h2><ol class="timeline" data-testid="order-timeline">${steps.map(s => `<li class="${s.pending ? 'muted-step' : ''}" data-testid="timeline-${s.status}"><i></i><b>${esc(s.label)}</b>${s.at ? `<small>${dateTime(s.at)}${s.note ? ' · ' + esc(s.note) : ''}</small>` : '<small>Pending</small>'}</li>`).join('')}</ol>
          ${o.cancelReason ? `<p class="note">Cancel reason: ${esc(o.cancelReason)}</p>` : ''}${o.return ? `<p class="note" data-testid="return-status">Return ${esc(o.return.status)}: ${esc(o.return.reason)}</p>` : ''}</div>
        <div class="panel" data-testid="order-items"><h2>Items</h2>${o.items.map(i => `<div class="cline" style="grid-template-columns:56px 1fr auto" data-testid="order-item"><div class="pimg"><span class="em">${i.emoji}</span></div><div><a href="#/product/${i.productId}" style="color:var(--text);font-weight:700">${esc(i.name)}</a><br><small class="muted">${esc(i.variantLabel)} · ${i.qty} × ${inr(i.price)}</small></div><b>${inr(i.lineTotal)}</b></div>`).join('')}</div>
      </div>
      <div>
        <aside class="panel summary" data-testid="order-bill"><h2>Bill</h2><dl>
          <dt>Items total</dt><dd>${inr(o.pricing.mrpTotal)}</dd><dt>Product discount</dt><dd class="savings">−${inr(o.pricing.productSavings)}</dd>
          <dt>Coupon ${o.pricing.coupon ? `<code>${esc(o.pricing.coupon)}</code>` : ''}</dt><dd class="savings">−${inr(o.pricing.discount)}</dd>
          <dt>Delivery</dt><dd>${o.pricing.deliveryFee ? inr(o.pricing.deliveryFee) : 'FREE'}</dd>
          <dt class="total">Total</dt><dd class="total" data-testid="order-total">${inr(o.pricing.total)}</dd></dl>
          <p style="font-size:.88rem"><b>Payment:</b> <span data-testid="payment-method">${o.payment.method}</span> · <span data-testid="payment-status">${o.payment.status}</span></p>
          <p style="font-size:.88rem"><b>Deliver to:</b> ${esc(o.shipTo.name)}, ${esc(o.shipTo.line1)}, ${esc(o.shipTo.city)} - ${esc(o.shipTo.pincode)}</p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <a class="btn ghost block" href="/api/orders/${encodeURIComponent(o.orderNo)}/invoice" download data-testid="download-invoice">⬇ Download invoice</a>
            <button class="btn ghost block" id="reorder" data-testid="reorder">↻ Reorder</button>
            ${o.canCancel ? '<button class="btn danger block" id="cancelOrder" data-testid="cancel-order">Cancel order</button>' : ''}
            ${o.canReturn ? '<button class="btn danger block" id="returnOrder" data-testid="return-order">Return items</button>' : ''}
          </div></aside></div>
    </div></div>`;
  if (placed) confetti();
  $('#reorder').onclick = async () => { const r = await api('POST', `/api/orders/${o.orderNo}/reorder`); state.cart = r.cart; updateBadge(true); toast(`${r.added.length} item(s) added to cart${r.skipped.length ? `, ${r.skipped.length} unavailable` : ''}`, 'success'); location.hash = '#/cart'; };
  const reasonModal = (kind, reasons) => modal({
    title: kind === 'cancel' ? 'Cancel order' : 'Return items', testid: `${kind}-modal`,
    body: `<form id="rForm" novalidate><div class="form-error-slot"></div>${selectField('reasonSel', 'Reason', reasons)}<div class="field"><label for="f-more">More details (optional)</label><textarea id="f-more" name="more" rows="3" data-testid="input-more"></textarea></div></form>`,
    footer: `<button class="btn ghost" data-close>Keep order</button><button class="btn" id="rGo" data-testid="${kind}-confirm">${kind === 'cancel' ? 'Cancel order' : 'Request return'}</button>`,
    onOpen: (back, close) => ($('#rGo', back).onclick = async () => {
      const fr = $('#rForm', back);
      const reason = [fr.elements.reasonSel.value, fr.elements.more.value].filter(Boolean).join(' - ');
      if (!fr.elements.reasonSel.value) return showFieldErrors(fr, { reasonSel: 'Please choose a reason' });
      try { await api('POST', `/api/orders/${o.orderNo}/${kind}`, { reason }); close(); toast(kind === 'cancel' ? 'Order cancelled' : 'Return requested', 'success'); (location.hash.includes('placed=1') ? (location.hash = '#/order/' + o.orderNo) : refreshView()); }
      catch (err) { $('.form-error-slot', fr).innerHTML = `<div class="form-error" data-testid="${kind}-error">${esc(err.message)}</div>`; }
    }),
  });
  $('#cancelOrder')?.addEventListener('click', () => reasonModal('cancel', ['Ordered by mistake', 'Delivery slot too late', 'Found a better price', 'Want to change items', 'Other']));
  $('#returnOrder')?.addEventListener('click', () => reasonModal('return', ['Item damaged', 'Item expired', 'Wrong item delivered', 'Quality not as expected', 'Other']));
};
