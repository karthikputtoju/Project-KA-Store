// Shared state, API client, UI helpers and components.
export const state = { user: null, csrf: null, cart: null, categories: [], lab: null, timers: [], cleanups: [] };
export const views = {};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const app = () => $('#app');
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const date = s => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTime = s => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

export class ApiError extends Error {
  constructor(status, payload) { super(payload?.error?.message || `Request failed (${status})`); this.status = status; this.code = payload?.error?.code; this.details = payload?.error?.details || {}; }
}

export async function api(method, url, body, headers = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (state.csrf && !['GET', 'HEAD'].includes(method)) h['X-CSRF-Token'] = state.csrf;
  const res = await fetch(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; state.csrf = null; document.dispatchEvent(new CustomEvent('auth-changed')); }
    throw new ApiError(res.status, data);
  }
  return data;
}

export function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('data-testid', `toast-${type}`);
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 400); }, ms);
}

export function setBusy(btn, on) { if (!btn) return; btn.classList.toggle('loading', on); btn.disabled = on; }

export function field(name, label, attrs = '', value = '', hint = '') {
  return `<div class="field"><label for="f-${name}">${label}</label>
    <input id="f-${name}" name="${name}" value="${esc(value)}" data-testid="input-${name}" aria-describedby="e-${name}" ${attrs}>
    ${hint ? `<small class="muted">${hint}</small>` : ''}
    <span class="err" id="e-${name}" data-err="${name}" data-testid="error-${name}" role="alert"></span></div>`;
}
export function selectField(name, label, options, value = '', attrs = '') {
  return `<div class="field"><label for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}" data-testid="input-${name}" ${attrs}><option value="">Select…</option>${options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
    <span class="err" data-err="${name}" data-testid="error-${name}" role="alert"></span></div>`;
}

export function showFieldErrors(form, details = {}) {
  $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
  $$('.err', form).forEach(e => (e.textContent = ''));
  for (const [k, msg] of Object.entries(details || {})) {
    if (!msg || typeof msg !== 'string') continue;
    const input = form.elements[k];
    const out = $(`[data-err="${CSS.escape(k)}"]`, form);
    if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
    if (out) out.textContent = msg;
  }
  $('[aria-invalid="true"]', form)?.focus();
}
export function formError(form, err, testid = 'form-error') {
  const box = $('.form-error-slot', form);
  if (box) box.innerHTML = err ? `<div class="form-error" data-testid="${testid}" role="alert">${esc(err.message || err)}</div>` : '';
  if (err?.details) showFieldErrors(form, err.details);
}
export const formData = form => Object.fromEntries(new FormData(form).entries());

export const skeletons = (n, h = 300) => Array.from({ length: n }, () => `<div class="skeleton" style="min-height:${h}px" aria-hidden="true"></div>`).join('');
export const emptyState = (icon, title, text, action = '', testid = 'empty-state') => `<div class="empty panel" data-testid="${testid}"><span class="big">${icon}</span><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${action}</div>`;
export const veg = v => (v === null || v === undefined ? '' : `<span class="veg ${v ? '' : 'non'}" title="${v ? 'Vegetarian' : 'Non-vegetarian'}" aria-label="${v ? 'Vegetarian' : 'Non-vegetarian'}"></span>`);
export const stars = r => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

export function pager(page, totalPages, testid = 'pagination') {
  if (totalPages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<nav class="pager" aria-label="Pagination" data-testid="${testid}">
    <button class="chip" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} data-testid="page-prev" aria-label="Previous page">‹ Prev</button>
    ${nums.map(n => n === '…' ? '<span class="muted">…</span>' : `<button class="chip" aria-pressed="${n === page}" aria-label="Page ${n}" data-page="${n}" data-testid="page-${n}">${n}</button>`).join('')}
    <button class="chip" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} data-testid="page-next" aria-label="Next page">Next ›</button></nav>`;
}
export function bindPager(root, go) { $$('[data-page]', root).forEach(b => (b.onclick = () => go(Number(b.dataset.page)))); }

// ---------------------------------------------------------------- modal
export function modal({ title, body, footer = '', testid = 'modal', onOpen, wide = false }) {
  const root = $('#modalRoot');
  const prevFocus = document.activeElement;
  root.innerHTML = `<div class="modal-back" data-testid="${testid}-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" data-testid="${testid}" style="${wide ? 'width:min(760px,100%)' : ''}">
    <header><h2 id="modalTitle">${title}</h2><button class="x-btn" data-close aria-label="Close" data-testid="modal-close">✕</button></header>
    <div class="mbody">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div></div>`;
  const back = $('.modal-back', root);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  // Focus the first field immediately (never later: a delayed focus can steal typing from another field)
  ($('input,select,textarea,button:not(.x-btn)', back) || $('.x-btn', back))?.focus();
  onOpen?.(back, close);
  return close;
}
export function confirmDialog(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise(resolve => {
    let done = false;
    const close = modal({
      title, testid: 'confirm-dialog', body: `<p>${esc(text)}</p>`,
      footer: `<button class="btn ghost" data-close data-testid="confirm-cancel">Cancel</button><button class="btn ${danger ? '' : ''}" id="okBtn" data-testid="confirm-ok">${esc(okLabel)}</button>`,
      onOpen: back => {
        $('#okBtn', back).onclick = () => { done = true; close(); resolve(true); };
        back.addEventListener('click', e => { if (!done && (e.target === back || e.target.closest('[data-close]'))) resolve(false); });
      },
    });
  });
}

// ---------------------------------------------------------------- cart helpers
export async function refreshCart() {
  if (!state.user) { state.cart = null; updateBadge(); return null; }
  try { state.cart = await api('GET', '/api/cart'); } catch { state.cart = null; }
  updateBadge();
  return state.cart;
}
export function updateBadge(bump) {
  const b = $('#cartBadge');
  b.textContent = state.cart ? state.cart.itemCount : 0;
  if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
export const qtyInCart = variantId => state.cart?.items.find(i => i.variantId === Number(variantId))?.qty || 0;

export function flyToCart(fromEl) {
  if (reduceMotion || !fromEl) return;
  const a = fromEl.getBoundingClientRect(), b = $('#cartLink').getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly';
  document.body.appendChild(dot);
  const sx = a.left + a.width / 2 - 11, sy = a.top + a.height / 2 - 11, ex = b.left + b.width / 2 - 11, ey = b.top + b.height / 2 - 11;
  dot.animate([{ transform: `translate(${sx}px,${sy}px)` }, { transform: `translate(${(sx + ex) / 2}px,${Math.min(sy, ey) - 120}px) scale(1.3)`, offset: .5 }, { transform: `translate(${ex}px,${ey}px) scale(.3)`, opacity: .3 }], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => dot.remove();
}

export function needLogin(msg = 'Please log in to continue') {
  if (state.user) return false;
  toast(msg);
  location.hash = '#/login?next=' + encodeURIComponent(location.hash.slice(1) || '/');
  return true;
}

/** Set the cart quantity for a variant (0 removes). Returns the new cart or throws. */
export async function setCartQty(variantId, qty, fromEl) {
  if (needLogin('Log in to add items to your cart')) return null;
  const cur = qtyInCart(variantId);
  if (cur === 0 && qty > 0) state.cart = await api('POST', '/api/cart/items', { variantId: Number(variantId), qty });
  else state.cart = await api('PATCH', `/api/cart/items/${variantId}`, { qty });
  if (qty > cur) flyToCart(fromEl);
  setTimeout(() => updateBadge(true), qty > cur && !reduceMotion ? 700 : 0);
  document.dispatchEvent(new CustomEvent('cart-changed'));
  return state.cart;
}

// ---------------------------------------------------------------- product card
export function addControl(variant, size = '') {
  if (!variant) return '';
  if (!variant.inStock) return `<button class="add-btn" disabled data-testid="add-to-cart">Notify</button>`;
  const q = qtyInCart(variant.id);
  if (!q) return `<button class="add-btn" data-add="${variant.id}" data-testid="add-to-cart" aria-label="Add to cart">ADD</button>`;
  return `<div class="stepper ${size}" data-testid="qty-stepper"><button data-dec="${variant.id}" aria-label="Decrease quantity" data-testid="qty-decrease">−</button><span data-testid="qty-value">${q}</span><button data-inc="${variant.id}" aria-label="Increase quantity" data-testid="qty-increase">+</button></div>`;
}

export function productCard(p, i = 0) {
  const v = p.variants.find(x => x.inStock) || p.variants[0];
  return `<article class="pcard" style="--i:${i}" data-testid="product-card" data-product-id="${p.id}" data-variant-id="${v?.id}">
    <div class="pimg"><span class="em" aria-hidden="true">${p.emoji}</span>
      ${v?.discountPct ? `<span class="off-badge" data-testid="discount-badge">${v.discountPct}% OFF</span>` : ''}
      ${!p.inStock ? '<span class="oos" data-testid="out-of-stock">Out of stock</span>' : ''}
      <button class="heart" data-wish="${p.id}" aria-pressed="${!!p.inWishlist}" aria-label="${p.inWishlist ? 'Remove from' : 'Add to'} wishlist" data-testid="wishlist-toggle"><svg viewBox="0 0 24 24"><path d="M12 21s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.6-9.5 9-9.5 9z"/></svg></button>
    </div>
    <div class="pbody">
      <div class="pbrand">${veg(p.isVeg)}${esc(p.brand)}</div>
      <a class="pname" href="#/product/${p.id}" data-testid="product-name">${esc(p.name)}</a>
      ${p.variants.length > 1
        ? `<select class="pvar" data-var-select aria-label="Choose pack size for ${esc(p.name)}" data-testid="variant-select">${p.variants.map(x => `<option value="${x.id}" ${x.id === v.id ? 'selected' : ''} ${x.inStock ? '' : 'disabled'}>${esc(x.label)} – ${inr(x.price)}${x.inStock ? '' : ' (sold out)'}</option>`).join('')}</select>`
        : `<div class="punit" data-testid="variant-label">${esc(v?.label)}</div>`}
      ${p.ratingCount ? `<div class="mini-rating" data-testid="product-rating"><b>★ ${p.rating}</b> (${p.ratingCount})</div>` : '<div class="mini-rating">No ratings yet</div>'}
      <div class="pfoot">
        <div class="amt" data-testid="product-price"><b>${inr(v?.price)}</b>${v && v.mrp > v.price ? `<s>${inr(v.mrp)}</s>` : ''}</div>
        <div data-add-slot>${addControl(v)}</div>
      </div>
    </div>
  </article>`;
}

/** Wire up add / +/- / variant select / wishlist inside any container of product cards. Event delegation. */
const inFlight = new Set();
export function bindProductGrid(root, products) {
  if (!root || root.dataset.gridBound) return; // never bind the same container twice
  root.dataset.gridBound = '1';
  root.addEventListener('change', e => {
    const sel = e.target.closest('[data-var-select]');
    if (!sel) return;
    const card = sel.closest('[data-product-id]');
    const p = products().find(x => x.id === Number(card.dataset.productId));
    const v = p.variants.find(x => x.id === Number(sel.value));
    card.dataset.variantId = v.id;
    $('[data-testid="product-price"]', card).innerHTML = `<b>${inr(v.price)}</b>${v.mrp > v.price ? `<s>${inr(v.mrp)}</s>` : ''}`;
    $('[data-add-slot]', card).innerHTML = addControl(v);
  });
  root.addEventListener('click', async e => {
    const add = e.target.closest('[data-add]'), inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), wish = e.target.closest('[data-wish]');
    if (wish) { e.preventDefault(); return toggleWishlist(wish); }
    const btn = add || inc || dec;
    if (!btn) return;
    e.preventDefault();
    const vid = Number(btn.dataset.add || btn.dataset.inc || btn.dataset.dec);
    if (inFlight.has(vid)) return; // ignore rapid double-clicks while a request is running
    inFlight.add(vid);
    const cur = qtyInCart(vid);
    const next = add ? 1 : inc ? cur + 1 : cur - 1;
    btn.disabled = true;
    try { await setCartQty(vid, next, btn); }
    catch (err) { toast(err.message, 'error'); }
    finally { inFlight.delete(vid); }
    $$(`[data-variant-id="${vid}"] [data-add-slot]`, root).forEach(slot => {
      const card = slot.closest('[data-product-id]');
      const p = products().find(x => x.id === Number(card.dataset.productId));
      slot.innerHTML = addControl(p?.variants.find(x => x.id === vid));
    });
  });
}

export async function toggleWishlist(btn) {
  if (needLogin('Log in to save items to your wishlist')) return;
  const id = Number(btn.dataset.wish);
  const on = btn.getAttribute('aria-pressed') === 'true';
  try {
    if (on) await api('DELETE', `/api/wishlist/${id}`); else await api('POST', '/api/wishlist', { productId: id });
    btn.setAttribute('aria-pressed', String(!on));
    btn.setAttribute('aria-label', `${on ? 'Add to' : 'Remove from'} wishlist`);
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    toast(on ? 'Removed from wishlist' : 'Saved to wishlist ♥', on ? 'info' : 'success');
  } catch (err) { toast(err.message, 'error'); }
}

export function confetti() {
  if (reduceMotion) return;
  const colors = ['#e10600', '#0a0a0a', '#ff2a1f', '#a30400', '#9b9ba5', '#15803d'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `background:${colors[i % colors.length]};left:50%;top:30%`;
    document.body.appendChild(p);
    const ang = Math.random() * Math.PI * 2, d = 150 + Math.random() * 300;
    p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d + 220}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1400 + Math.random() * 800, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => p.remove();
  }
}

export const onLeave = fn => state.cleanups.push(fn);
/** Redraw whatever page is CURRENT (by URL) after an action. Never redraw a page the user has already left. */
export const refreshView = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
export const every = (ms, fn) => state.timers.push(setInterval(fn, ms));
