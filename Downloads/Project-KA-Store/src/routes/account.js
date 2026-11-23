'use strict';
const { route, HttpError } = require('../lib/http');
const { RE, passwordProblems, fail, str } = require('../lib/util');
const { db, now, hashPassword, newPassword, audit, sendEmail } = require('../db');
const { publicUser } = require('./auth');

const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

const addressView = a => ({ id: a.id, label: a.label, fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: !!a.is_default });

function validateAddress(b) {
  const a = { label: str(b.label) || 'Home', fullName: str(b.fullName), phone: str(b.phone), line1: str(b.line1), line2: str(b.line2), city: str(b.city), state: str(b.state), pincode: str(b.pincode) };
  fail({
    label: !['Home', 'Work', 'Other'].includes(a.label) ? 'Label must be Home, Work or Other' : null,
    fullName: a.fullName.length < 2 ? 'Full name is required' : null,
    phone: !RE.phone.test(a.phone) ? 'Enter a valid 10-digit mobile number' : null,
    line1: a.line1.length < 5 ? 'House / flat and street are required (min 5 characters)' : null,
    city: a.city.length < 2 ? 'City is required' : null,
    state: !STATES.includes(a.state) ? 'Select a valid state' : null,
    pincode: !RE.pincode.test(a.pincode) ? 'PIN code must be 6 digits' : null,
  });
  return a;
}

route('GET', '/api/account/profile', { tag: 'Account', summary: 'Get my profile', auth: 'user' }, ctx => {
  const stats = db.get("SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total END), 0) AS spent FROM orders WHERE user_id = ?", ctx.user.id);
  return { ...publicUser(ctx.user), lastLoginAt: ctx.user.last_login_at, stats };
});

route('PUT', '/api/account/profile', { tag: 'Account', summary: 'Update name and phone', auth: 'user', body: { name: 'Demo User', phone: '9876543210' } }, ctx => {
  const name = str(ctx.body.name), phone = str(ctx.body.phone);
  fail({ name: name.length < 2 || name.length > 50 ? 'Name must be 2–50 characters' : null, phone: !RE.phone.test(phone) ? 'Enter a valid 10-digit mobile number' : null });
  db.run('UPDATE users SET name = ?, phone = ? WHERE id = ?', name, phone, ctx.user.id);
  audit(ctx.user.id, 'account.update_profile', 'user', ctx.user.id);
  return publicUser(db.get('SELECT * FROM users WHERE id = ?', ctx.user.id));
});

route('POST', '/api/account/change-password', {
  tag: 'Account', summary: 'Change password (other sessions are logged out)', auth: 'user', body: { currentPassword: 'Passw0rd!', newPassword: 'NewPass@123' },
}, ctx => {
  const cur = String(ctx.body.currentPassword || ''), pw = String(ctx.body.newPassword || '');
  fail({ currentPassword: !cur ? 'Current password is required' : null, newPassword: passwordProblems(pw) || (pw === cur ? 'New password must be different' : null) });
  if (hashPassword(cur, ctx.user.salt) !== ctx.user.password_hash) throw new HttpError(422, 'VALIDATION_FAILED', 'Current password is incorrect', { currentPassword: 'Incorrect password' });
  const p = newPassword(pw);
  db.run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', p.hash, p.salt, ctx.user.id);
  db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', ctx.user.id, ctx.session.id);
  sendEmail(ctx.user.email, 'Your password was changed', `Hi ${ctx.user.name},\n\nYour password was changed. Other devices have been logged out.`);
  audit(ctx.user.id, 'account.change_password', 'user', ctx.user.id);
  return { ok: true };
});

route('GET', '/api/account/sessions', { tag: 'Account', summary: 'List my active sessions', auth: 'user' }, ctx => (
  db.all('SELECT id, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC', ctx.user.id)
    .map(s => ({ id: s.id.slice(0, 8) + '…', userAgent: s.user_agent, createdAt: s.created_at, expiresAt: s.expires_at, current: s.id === ctx.session.id }))
));

route('GET', '/api/states', { tag: 'Account', summary: 'List of states for address forms' }, () => STATES);

route('GET', '/api/account/addresses', { tag: 'Account', summary: 'List my saved addresses', auth: 'user' }, ctx => (
  db.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', ctx.user.id).map(addressView)
));

route('POST', '/api/account/addresses', {
  tag: 'Account', summary: 'Add an address (max 5)', auth: 'user',
  body: { label: 'Home', fullName: 'Demo User', phone: '9876543210', line1: '12 MG Road', line2: 'Near Metro', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', isDefault: true },
}, ctx => {
  const a = validateAddress(ctx.body);
  const count = db.get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', ctx.user.id).n;
  if (count >= 5) throw new HttpError(422, 'ADDRESS_LIMIT', 'You can save up to 5 addresses');
  const makeDefault = ctx.body.isDefault === true || count === 0;
  const id = db.tx(() => {
    if (makeDefault) db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
    return db.run('INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ctx.user.id, a.label, a.fullName, a.phone, a.line1, a.line2 || null, a.city, a.state, a.pincode, makeDefault ? 1 : 0, now()).lastInsertRowid;
  });
  audit(ctx.user.id, 'address.create', 'address', id);
  return { status: 201, body: addressView(db.get('SELECT * FROM addresses WHERE id = ?', id)) };
});

function ownAddress(ctx) {
  const a = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
  if (!a) throw new HttpError(404, 'NOT_FOUND', 'Address not found');
  return a;
}

route('PUT', '/api/account/addresses/:id', { tag: 'Account', summary: 'Update an address', auth: 'user' }, ctx => {
  const old = ownAddress(ctx);
  const a = validateAddress(ctx.body);
  db.run('UPDATE addresses SET label=?, full_name=?, phone=?, line1=?, line2=?, city=?, state=?, pincode=? WHERE id=?', a.label, a.fullName, a.phone, a.line1, a.line2 || null, a.city, a.state, a.pincode, old.id);
  return addressView(db.get('SELECT * FROM addresses WHERE id = ?', old.id));
});

route('POST', '/api/account/addresses/:id/default', { tag: 'Account', summary: 'Make an address the default', auth: 'user' }, ctx => {
  const a = ownAddress(ctx);
  db.tx(() => { db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id); db.run('UPDATE addresses SET is_default = 1 WHERE id = ?', a.id); });
  return db.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', ctx.user.id).map(addressView);
});

route('DELETE', '/api/account/addresses/:id', { tag: 'Account', summary: 'Delete an address', auth: 'user' }, ctx => {
  const a = ownAddress(ctx);
  db.tx(() => {
    db.run('DELETE FROM addresses WHERE id = ?', a.id);
    if (a.is_default) db.run('UPDATE addresses SET is_default = 1 WHERE id = (SELECT id FROM addresses WHERE user_id = ? ORDER BY id LIMIT 1)', ctx.user.id);
  });
  audit(ctx.user.id, 'address.delete', 'address', a.id);
  return { ok: true };
});

module.exports = { addressView, STATES };
