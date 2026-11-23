import { state, views, $, $$, app, esc, api, toast, refreshCart, updateBadge } from './core.js';
import './store.js';
import './cart.js';
import './account.js';
import './admin.js';
import './practice.js';
import './tools.js';
import './testing.js';
import './coverage.js';

// ---------------------------------------------------------------- header: auth area
function renderAuth() {
  const slot = $('#authSlot');
  if (!state.user) {
    slot.innerHTML = '<a href="#/login" class="btn sm" data-testid="nav-login" style="color:#fff">Login</a>';
    $('#locText').textContent = 'Select address';
    return;
  }
  const u = state.user;
  const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  slot.innerHTML = `<div class="menu-wrap"><button class="menu-btn" id="acctBtn" aria-haspopup="menu" aria-expanded="false" data-testid="account-menu"><span class="avatar" aria-hidden="true">${esc(initials)}</span><span data-testid="user-name">${esc(u.name.split(' ')[0])}</span> ▾</button>
    <div class="menu" id="acctMenu" role="menu" hidden data-testid="account-dropdown">
      <div class="who"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="role-tag">admin</span>' : ''}<small>${esc(u.email)}</small></div>
      ${u.role === 'admin' ? '<a href="#/admin" role="menuitem" data-testid="menu-admin">📊 Admin panel</a>' : ''}
      <a href="#/account/profile" role="menuitem" data-testid="menu-profile">👤 My profile</a>
      <a href="#/orders" role="menuitem" data-testid="menu-orders">📦 My orders</a>
      <a href="#/wishlist" role="menuitem" data-testid="menu-wishlist">♡ Wishlist</a>
      <a href="#/account/addresses" role="menuitem" data-testid="menu-addresses">📍 Addresses</a>
      <a href="#/account/security" role="menuitem" data-testid="menu-security">🔒 Security</a>
      <a href="#/mailbox" role="menuitem" data-testid="menu-mailbox">✉️ Test mailbox</a><hr>
      <button role="menuitem" id="logoutBtn" data-testid="logout">↪ Logout</button></div></div>`;
  const btn = $('#acctBtn'), menu = $('#acctMenu');
  btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
  menu.onclick = e => { if (e.target.closest('a,button')) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
  $('#logoutBtn').onclick = async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    state.user = null; state.csrf = null; state.cart = null;
    renderAuth(); updateBadge(); toast('You have been logged out'); location.hash = '#/';
  };
  api('GET', '/api/account/addresses').then(a => { const d = a.find(x => x.isDefault) || a[0]; $('#locText').textContent = d ? `${d.label} · ${d.city} ${d.pincode}` : 'Add address'; }).catch(() => {});
}
document.addEventListener('click', () => { const m = $('#acctMenu'); if (m && !m.hidden) { m.hidden = true; $('#acctBtn')?.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('auth-changed', () => { renderAuth(); updateBadge(); });
$('#locPill').onclick = () => (location.hash = state.user ? '#/account/addresses' : '#/login');

// ---------------------------------------------------------------- header: search with suggestions
const input = $('#searchInput'), box = $('#suggestBox');
let sTimer, sItems = [], hl = -1;
const closeSuggest = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); hl = -1; };
input.addEventListener('input', () => {
  clearTimeout(sTimer);
  const q = input.value.trim();
  if (q.length < 2) return closeSuggest();
  sTimer = setTimeout(async () => {
    sItems = await api('GET', '/api/search/suggest?q=' + encodeURIComponent(q)).catch(() => []);
    if (!sItems.length || input.value.trim() !== q) return closeSuggest();
    box.innerHTML = sItems.map((s, i) => `<a href="#/product/${s.id}" role="option" id="sg-${i}" data-testid="suggestion-item"><span class="em">${s.emoji}</span><span>${esc(s.name)}</span><small>${esc(s.brand)}</small></a>`).join('');
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
  }, 250);
});
input.addEventListener('keydown', e => {
  if (box.hidden) return;
  const links = $$('a', box);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links.forEach((l, i) => l.classList.toggle('hl', i === hl)); input.setAttribute('aria-activedescendant', links[hl].id); }
  if (e.key === 'Enter' && hl >= 0) { e.preventDefault(); location.hash = links[hl].getAttribute('href'); closeSuggest(); }
  if (e.key === 'Escape') closeSuggest();
});
box.addEventListener('click', () => { closeSuggest(); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) closeSuggest(); });
$('#searchForm').onsubmit = e => { e.preventDefault(); closeSuggest(); const q = input.value.trim(); location.hash = '#/shop' + (q ? '?q=' + encodeURIComponent(q) : ''); };

// ---------------------------------------------------------------- router
const ROUTES = {
  '': 'home', shop: 'shop', product: 'product', cart: 'cart', checkout: 'checkout', orders: 'orders', order: 'order', wishlist: 'wishlist',
  login: 'login', register: 'register', 'forgot-password': 'forgot-password', account: 'account', mailbox: 'mailbox',
  admin: 'admin', practice: 'practice', lab: 'lab', db: 'db', 'api-docs': 'api-docs',
  performance: 'performance', security: 'security', coverage: 'coverage',
};
let navToken = 0, renderingToken = 0;
async function router() {
  const token = ++navToken;
  renderingToken = token;
  state.timers.forEach(clearInterval); state.timers = [];
  state.cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } }); state.cleanups = [];
  $('#modalRoot').innerHTML = '';
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const name = ROUTES[parts[0] || ''];
  // active states
  $$('.nav > a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + (parts[0] || '')));
  $$('#catbar a').forEach(a => a.classList.toggle('active', parts[0] === 'shop' && a.dataset.cat === (params.get('category') || '')));
  if (parts[0] !== 'shop') input.value = ''; else input.value = params.get('q') || '';
  const titleName = { '': 'Home', 'api-docs': 'API docs', db: 'DB explorer', 'forgot-password': 'Forgot password', performance: 'Performance testing', security: 'Security testing', coverage: 'Test coverage' }[parts[0] || ''] || (parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : 'Home');
  document.title = `${titleName} · KarthikAutomation Practice Store`;
  window.scrollTo(0, 0);
  try {
    if (!name || !views[name]) views.notFound();
    else await views[name](params, parts[1] && decodeURIComponent(parts[1]));
  } catch (e) {
    if (token !== navToken) return staleFinished(token); // the user already navigated away: ignore this page's error
    console.error(e);
    app().innerHTML = `<div class="view panel"><div class="form-error" data-testid="page-error">Something went wrong: ${esc(e.message)}</div><p><a href="#/">Go home</a></p></div>`;
  }
  if (token !== navToken) return staleFinished(token);
  renderingToken = 0;
  app().focus({ preventScroll: true });
}
// A page that was still loading when the user navigated away may have drawn over the newer page.
// If the newest page has already finished, draw it again so the screen always matches the URL.
function staleFinished() {
  if (renderingToken === 0) router();
}
window.addEventListener('hashchange', router);

// ---------------------------------------------------------------- global button ripple
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = btn.getBoundingClientRect(), s = Math.max(r.width, r.height);
  const rip = document.createElement('span');
  rip.className = 'ripple';
  rip.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  btn.appendChild(rip); setTimeout(() => rip.remove(), 600);
});

// ---------------------------------------------------------------- boot
(async function boot() {
  $('#year').textContent = new Date().getFullYear();
  const [cats, me] = await Promise.all([api('GET', '/api/categories').catch(() => []), api('GET', '/api/auth/me').catch(() => ({ user: null }))]);
  state.categories = cats;
  $('#catbar').innerHTML = `<a href="#/shop" data-cat="" data-testid="catbar-all">All</a>` + cats.map(c => `<a href="#/shop?category=${c.slug}" data-cat="${c.slug}" data-testid="catbar-${c.slug}">${c.icon} ${esc(c.name)}</a>`).join('');
  if (me.user) { state.user = me.user; state.csrf = me.csrfToken; }
  api('GET', '/api/lab/config').then(c => (state.lab = c)).catch(() => {});
  renderAuth();
  await refreshCart();
  router();
})();
