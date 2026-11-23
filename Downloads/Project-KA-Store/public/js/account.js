import { state, views, $, $$, app, esc, api, toast, setBusy, field, showFieldErrors, formData, refreshCart, confirmDialog, needLogin, dateTime, emptyState, refreshView } from './core.js';
import { openAddressModal } from './cart.js';

const pwField = (name, label, auto, hint = '') => `<div class="field"><label for="f-${name}">${label}</label><div class="pw-wrap">
  <input id="f-${name}" name="${name}" type="password" autocomplete="${auto}" data-testid="input-${name}" aria-describedby="e-${name}">
  <button type="button" data-toggle-pw="f-${name}" aria-label="Show password" data-testid="toggle-${name}">SHOW</button></div>${hint}
  <span class="err" id="e-${name}" data-err="${name}" data-testid="error-${name}" role="alert"></span></div>`;
function bindPwToggles(root) {
  $$('[data-toggle-pw]', root).forEach(b => (b.onclick = () => { const i = $('#' + b.dataset.togglePw); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'HIDE' : 'SHOW'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }));
}
function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++; if (/[A-Z]/.test(pw)) s++; if (/[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  return [[0, '', '#ccc'], [1, 'Very weak', '#e10600'], [2, 'Weak', '#e10600'], [3, 'Fair', '#b45309'], [4, 'Good', '#65a30d'], [5, 'Strong', '#15803d']][s];
}
function bindStrength(input, root) {
  input.addEventListener('input', () => { const [s, l, c] = strength(input.value); $('.strength i', root).style.cssText = `width:${s * 20}%;background:${c}`; $('[data-testid="password-strength"]', root).textContent = l; });
}
const strengthMeter = '<div class="strength" aria-hidden="true"><i></i></div><small class="muted" data-testid="password-strength" aria-live="polite"></small>';

async function afterLogin(r, next) {
  state.user = r.user; state.csrf = r.csrfToken;
  // Navigate first, then show the user in the header: when the name appears, the redirect has already happened.
  location.hash = '#' + (next || (r.user.role === 'admin' ? '/admin' : '/'));
  document.dispatchEvent(new CustomEvent('auth-changed'));
  refreshCart();
}

// ---------------------------------------------------------------- login
views.login = params => {
  if (state.user) { location.hash = '#/'; return; }
  app().innerHTML = `<div class="view auth-wrap" data-testid="page-login"><div class="panel">
    <h1>Login</h1><p class="muted">Welcome back! Log in with a practice account.</p>
    <form id="loginForm" novalidate data-testid="login-form"><div class="form-error-slot"></div>
      ${field('email', 'Email address', 'type="email" autocomplete="username" required')}
      ${pwField('password', 'Password', 'current-password')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <label class="checkline" style="margin:0"><input type="checkbox" name="rememberMe" data-testid="input-rememberMe"> Remember me for 7 days</label>
        <a href="#/forgot-password" data-testid="forgot-password-link">Forgot password?</a></div>
      <button class="btn block" data-testid="login-submit">Login</button>
    </form>
    <p class="hint">New customer? <a href="#/register" data-testid="go-register">Create an account</a></p>
    <details class="hint" data-testid="test-accounts"><summary style="cursor:pointer;font-weight:700">Practice accounts</summary>
      <p>Customer: <code>demo@karthikautomation.test</code> / <code>Passw0rd!</code><br>Admin: <code>admin@karthikautomation.test</code> / <code>Admin@123</code><br>Load users: <code>user1…user50@karthikautomation.test</code> / <code>Passw0rd!</code><br>Disabled: <code>locked@karthikautomation.test</code> / <code>Passw0rd!</code></p></details>
  </div></div>`;
  const f = $('#loginForm');
  bindPwToggles(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[data-testid="login-submit"]', f);
    $('.form-error-slot', f).innerHTML = '';
    showFieldErrors(f, {});
    setBusy(btn, true);
    try {
      const r = await api('POST', '/api/auth/login', { email: f.elements.email.value, password: f.elements.password.value, rememberMe: f.elements.rememberMe.checked });
      toast(`Welcome back, ${r.user.name.split(' ')[0]}!`, 'success');
      await afterLogin(r, params.get('next'));
    } catch (err) {
      setBusy(btn, false);
      $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="login-error" role="alert">${esc(err.message)}</div>`;
      showFieldErrors(f, err.details);
    }
  };
};

// ---------------------------------------------------------------- register
views.register = () => {
  if (state.user) { location.hash = '#/'; return; }
  app().innerHTML = `<div class="view auth-wrap" style="max-width:520px" data-testid="page-register"><div class="panel">
    <h1>Create account</h1><p class="muted">Sign up for a practice account. Get ₹50 off your first order with <code>WELCOME50</code>.</p>
    <form id="regForm" novalidate data-testid="register-form"><div class="form-error-slot"></div>
      ${field('name', 'Full name', 'autocomplete="name" required maxlength="50"')}
      <div class="row2">${field('email', 'Email address', 'type="email" autocomplete="email" required')}${field('phone', 'Mobile number', 'inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="10-digit mobile"')}</div>
      ${pwField('password', 'Password', 'new-password', strengthMeter + '<small class="muted" style="display:block">8+ characters with upper & lower case, a number and a symbol.</small>')}
      ${pwField('confirmPassword', 'Confirm password', 'new-password')}
      <label class="checkline"><input type="checkbox" name="acceptTerms" data-testid="input-acceptTerms"> <span>I agree that this is a <b>practice website</b> and accept the terms of use.</span></label>
      <span class="err" data-err="acceptTerms" data-testid="error-acceptTerms"></span>
      <button class="btn block" data-testid="register-submit">Create account</button>
    </form><p class="hint">Already have an account? <a href="#/login" data-testid="go-login">Login</a></p></div></div>`;
  const f = $('#regForm');
  bindPwToggles(f); bindStrength(f.elements.password, f);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('[data-testid="register-submit"]', f);
    const d = formData(f);
    const local = {};
    if (!f.elements.acceptTerms.checked) local.acceptTerms = 'You must accept the terms';
    if (d.password !== d.confirmPassword) local.confirmPassword = 'Passwords do not match';
    $('.form-error-slot', f).innerHTML = '';
    setBusy(btn, true);
    try {
      if (Object.keys(local).length) throw Object.assign(new Error('Please fix the highlighted fields'), { details: local });
      const r = await api('POST', '/api/auth/register', { ...d, acceptTerms: true });
      toast('Account created! Welcome email sent to your test mailbox.', 'success', 4500);
      await afterLogin(r, '/');
    } catch (err) {
      setBusy(btn, false);
      $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="register-error" role="alert">${esc(err.message)}</div>`;
      showFieldErrors(f, err.details);
    }
  };
};

// ---------------------------------------------------------------- forgot / reset password
views['forgot-password'] = () => {
  app().innerHTML = `<div class="view auth-wrap" data-testid="page-forgot-password"><div class="panel">
    <h1>Reset password</h1>
    <div id="step1"><p class="muted">Enter your email. We'll send a 6-digit code to your <a href="#/mailbox" target="_blank">test mailbox</a>.</p>
      <form id="fpForm" novalidate data-testid="forgot-form"><div class="form-error-slot"></div>${field('email', 'Email address', 'type="email" autocomplete="email"')}<button class="btn block" data-testid="send-otp">Send code</button></form></div>
    <div id="step2" hidden><p class="muted" data-testid="otp-sent-message"></p>
      <form id="rpForm" novalidate data-testid="reset-form"><div class="form-error-slot"></div>
        <div class="field"><span style="font-weight:600;font-size:.85rem">6-digit code</span><div class="otp" data-testid="otp-inputs">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}" data-otp="${i}" data-testid="otp-${i + 1}">`).join('')}</div><span class="err" data-err="otp" data-testid="error-otp"></span></div>
        ${pwField('newPassword', 'New password', 'new-password', strengthMeter)}
        <button class="btn block" data-testid="reset-submit">Update password</button></form>
      <p class="hint"><button class="linkish" id="resend" style="background:none;border:0;color:var(--red);cursor:pointer;font-weight:700" data-testid="resend-otp">Resend code</button> · <a href="#/mailbox" id="mbLink" data-testid="open-mailbox">Open test mailbox</a></p></div>
  </div></div>`;
  let email = '';
  const send = async btn => {
    setBusy(btn, true);
    try {
      const r = await api('POST', '/api/auth/forgot-password', { email: $('#fpForm').elements.email.value });
      email = $('#fpForm').elements.email.value.trim().toLowerCase();
      $('#step1').hidden = true; $('#step2').hidden = false;
      $('[data-testid="otp-sent-message"]').textContent = r.message;
      $('#mbLink').href = '#/mailbox?email=' + encodeURIComponent(email);
      $('[data-otp="0"]').focus();
      toast('Code sent', 'success');
    } catch (err) { $('.form-error-slot', $('#fpForm')).innerHTML = `<div class="form-error" data-testid="forgot-error">${esc(err.message)}</div>`; showFieldErrors($('#fpForm'), err.details); }
    setBusy(btn, false);
  };
  $('#fpForm').onsubmit = e => { e.preventDefault(); send($('[data-testid="send-otp"]')); };
  $('#resend').onclick = async () => { await api('POST', '/api/auth/forgot-password', { email }); toast('A new code has been sent'); };
  const boxes = $$('[data-otp]');
  boxes.forEach((b, i) => {
    b.oninput = () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); };
    b.onkeydown = e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); };
    b.onpaste = e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); t.split('').forEach((ch, j) => boxes[j] && (boxes[j].value = ch)); boxes[Math.min(t.length, 5)].focus(); } };
  });
  const rf = $('#rpForm');
  bindPwToggles(rf); bindStrength(rf.elements.newPassword, rf);
  rf.onsubmit = async e => {
    e.preventDefault();
    const btn = $('[data-testid="reset-submit"]', rf);
    setBusy(btn, true);
    try {
      await api('POST', '/api/auth/reset-password', { email, otp: boxes.map(b => b.value).join(''), newPassword: rf.elements.newPassword.value });
      toast('Password updated. Please log in.', 'success'); location.hash = '#/login';
    } catch (err) { setBusy(btn, false); $('.form-error-slot', rf).innerHTML = `<div class="form-error" data-testid="reset-error">${esc(err.message)}</div>`; showFieldErrors(rf, err.details); }
  };
};

// ---------------------------------------------------------------- account area
const ACCT_TABS = [['profile', '👤 Profile'], ['addresses', '📍 Addresses'], ['security', '🔒 Security'], ['orders', '📦 Orders'], ['wishlist', '♡ Wishlist']];
function acctShell(active, inner) {
  return `<div class="view" data-testid="page-account"><h1>My account</h1><div class="acct">
    <nav class="side-nav" aria-label="Account" data-testid="account-nav">${ACCT_TABS.map(([k, l]) => `<a href="${['orders', 'wishlist'].includes(k) ? '#/' + k : '#/account/' + k}" class="${k === active ? 'active' : ''}" data-testid="account-tab-${k}">${l}</a>`).join('')}</nav>
    <section id="acctBody">${inner}</section></div></div>`;
}

views.account = async (params, tab = 'profile') => {
  if (needLogin()) return;
  if (tab === 'profile') {
    const p = await api('GET', '/api/account/profile');
    app().innerHTML = acctShell('profile', `<div class="panel" data-testid="profile-panel"><h2>Profile</h2>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b data-testid="profile-orders">${p.stats.orders}</b><span>Orders</span></div><div class="kpi"><b data-testid="profile-spent">₹${Math.round(p.stats.spent).toLocaleString('en-IN')}</b><span>Spent</span></div><div class="kpi"><b>${new Date(p.createdAt).getFullYear()}</b><span>Member since</span></div></div>
      <form id="profForm" novalidate data-testid="profile-form"><div class="form-error-slot"></div>
        <div class="row2">${field('name', 'Full name', 'autocomplete="name"', p.name)}${field('phone', 'Mobile number', 'inputmode="numeric" maxlength="10"', p.phone)}</div>
        <div class="field"><label for="f-email">Email (cannot be changed)</label><input id="f-email" value="${esc(p.email)}" disabled data-testid="input-email"></div>
        <button class="btn" data-testid="profile-save">Save changes</button></form></div>`);
    const f = $('#profForm');
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = $('[data-testid="profile-save"]');
      setBusy(btn, true);
      try { const u = await api('PUT', '/api/account/profile', formData(f)); state.user = { ...state.user, ...u }; document.dispatchEvent(new CustomEvent('auth-changed')); toast('Profile updated', 'success'); showFieldErrors(f, {}); }
      catch (err) { $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="profile-error">${esc(err.message)}</div>`; showFieldErrors(f, err.details); }
      setBusy(btn, false);
    };
  }
  if (tab === 'addresses') {
    const list = await api('GET', '/api/account/addresses');
    app().innerHTML = acctShell('addresses', `<div class="panel" data-testid="addresses-panel"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Saved addresses <small class="muted" data-testid="address-count">(${list.length}/5)</small></h2><button class="btn sm" id="addAddr" data-testid="add-address" ${list.length >= 5 ? 'disabled' : ''}>+ Add address</button></div>
      ${list.length ? `<div class="addr-grid" data-testid="address-list">${list.map(a => `<div class="addr" style="padding-left:16px;cursor:default" data-testid="address-card" data-address-id="${a.id}"><span class="lbl">${esc(a.label)}</span>${a.isDefault ? '<span class="pill on" data-testid="default-badge">Default</span>' : ''}<br><b>${esc(a.fullName)}</b><br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br><small class="muted">📞 ${esc(a.phone)}</small>
        <div style="display:flex;gap:12px;margin-top:10px;font-size:.85rem;font-weight:700"><button class="linkish" data-edit="${a.id}" style="background:none;border:0;color:var(--text);cursor:pointer" data-testid="address-edit">Edit</button>${a.isDefault ? '' : `<button data-def="${a.id}" style="background:none;border:0;color:var(--text);cursor:pointer" data-testid="address-make-default">Set default</button>`}<button data-del="${a.id}" style="background:none;border:0;color:var(--red);cursor:pointer" data-testid="address-delete">Delete</button></div></div>`).join('')}</div>`
        : emptyState('📍', 'No saved addresses', 'Add an address to speed up checkout.', '', 'addresses-empty')}</div>`);
    const reload = refreshView;
    $('#addAddr').onclick = () => openAddressModal(null, reload);
    $$('[data-edit]').forEach(b => (b.onclick = () => openAddressModal(list.find(a => a.id === Number(b.dataset.edit)), reload)));
    $$('[data-def]').forEach(b => (b.onclick = async () => { await api('POST', `/api/account/addresses/${b.dataset.def}/default`); toast('Default address updated', 'success'); reload(); }));
    $$('[data-del]').forEach(b => (b.onclick = async () => { if (await confirmDialog('Delete address?', 'This address will be removed permanently.', 'Delete')) { await api('DELETE', `/api/account/addresses/${b.dataset.del}`); toast('Address deleted'); reload(); } }));
  }
  if (tab === 'security') {
    const sessions = await api('GET', '/api/account/sessions');
    app().innerHTML = acctShell('security', `<div class="panel" style="margin-bottom:16px" data-testid="security-panel"><h2>Change password</h2>
      <form id="cpForm" novalidate data-testid="change-password-form"><div class="form-error-slot"></div>${pwField('currentPassword', 'Current password', 'current-password')}${pwField('newPassword', 'New password', 'new-password', strengthMeter)}
      <button class="btn" data-testid="change-password-submit">Update password</button></form></div>
      <div class="panel" data-testid="sessions-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>Active sessions <small class="muted">(${sessions.length})</small></h2><button class="btn danger sm" id="logoutAll" data-testid="logout-all">Log out of all devices</button></div>
      <div class="tbl-wrap"><table class="tbl" data-testid="sessions-table"><thead><tr><th>Session</th><th>Device</th><th>Started</th><th>Expires</th></tr></thead><tbody>${sessions.map(s => `<tr><td>${esc(s.id)} ${s.current ? '<span class="pill on">This device</span>' : ''}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${esc(s.userAgent || '-')}</td><td>${dateTime(s.createdAt)}</td><td>${dateTime(s.expiresAt)}</td></tr>`).join('')}</tbody></table></div></div>`);
    const f = $('#cpForm');
    bindPwToggles(f); bindStrength(f.elements.newPassword, f);
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = $('[data-testid="change-password-submit"]');
      setBusy(btn, true);
      try { await api('POST', '/api/account/change-password', formData(f)); toast('Password changed. Other devices were logged out.', 'success'); f.reset(); showFieldErrors(f, {}); $('.form-error-slot', f).innerHTML = ''; }
      catch (err) { $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="change-password-error">${esc(err.message)}</div>`; showFieldErrors(f, err.details); }
      setBusy(btn, false);
    };
    $('#logoutAll').onclick = async () => {
      if (!(await confirmDialog('Log out everywhere?', 'You will be logged out of every device, including this one.', 'Log out all'))) return;
      await api('POST', '/api/auth/logout-all');
      state.user = null; state.csrf = null; state.cart = null;
      document.dispatchEvent(new CustomEvent('auth-changed')); toast('Logged out of all devices'); location.hash = '#/login';
    };
  }
};

// ---------------------------------------------------------------- test mailbox
views.mailbox = async params => {
  const email = params.get('email') || state.user?.email || '';
  app().innerHTML = `<div class="view" data-testid="page-mailbox"><h1>Test mailbox</h1>
    <p class="muted">Emails this practice store "sends" (welcome, password reset codes, order updates) land here instead of a real inbox. Great for testing email flows. API: <code>GET /api/dev/mailbox?email=…</code></p>
    <form id="mbForm" class="coupon" style="max-width:520px" data-testid="mailbox-form"><label class="sr-only" for="mbEmail">Email</label><input id="mbEmail" type="email" placeholder="Email address" value="${esc(email)}" data-testid="mailbox-email"><button class="btn sm" data-testid="mailbox-open">Open inbox</button><button type="button" class="btn sm ghost" id="mbClear" data-testid="mailbox-clear">Clear</button></form>
    <div id="mails" data-testid="mailbox-list" style="margin-top:16px"></div></div>`;
  const load = async addr => {
    if (!addr) { $('#mails').innerHTML = '<p class="muted">Enter an email address to see its messages.</p>'; return; }
    const list = await api('GET', '/api/dev/mailbox?email=' + encodeURIComponent(addr));
    if (!$('#mails')) return;
    $('#mails').innerHTML = list.length ? list.map((m, i) => `<details class="mail" ${i === 0 ? 'open' : ''} data-testid="mail-item"><summary><span data-testid="mail-subject">${esc(m.subject)}</span><small>${dateTime(m.sentAt)}</small></summary><pre data-testid="mail-body">${esc(m.body)}</pre></details>`).join('') : emptyState('📭', 'Inbox is empty', `No emails for ${addr} yet.`, '', 'mailbox-empty');
  };
  $('#mbForm').onsubmit = e => { e.preventDefault(); location.hash = '#/mailbox?email=' + encodeURIComponent($('#mbEmail').value.trim()); };
  $('#mbClear').onclick = async () => { await api('DELETE', '/api/dev/mailbox?email=' + encodeURIComponent($('#mbEmail').value.trim())); load($('#mbEmail').value.trim()); };
  load(email);
};
