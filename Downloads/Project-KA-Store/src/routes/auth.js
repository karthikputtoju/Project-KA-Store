'use strict';
const crypto = require('crypto');
const { route, HttpError, signJwt } = require('../lib/http');
const { RE, passwordProblems, fail, str } = require('../lib/util');
const { db, now, hashPassword, newPassword, audit, sendEmail } = require('../db');
const { state } = require('../lib/state');

const SESSION_HOURS = 2;
const REMEMBER_DAYS = 7;
const COOKIE = 'ka_session';

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at };
}

function createSession(ctx, user, remember = false) {
  const sid = crypto.randomBytes(16).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  const ttlSec = remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  db.run('INSERT INTO sessions (id, user_id, csrf_token, user_agent, created_at, expires_at) VALUES (?,?,?,?,?,?)',
    sid, user.id, csrf, String(ctx.req.headers['user-agent'] || '').slice(0, 200), now(), new Date(exp * 1000).toISOString());
  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
  const token = signJwt({ sub: user.id, sid, role: user.role, name: user.name, iat: Math.floor(Date.now() / 1000), exp });
  ctx.res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttlSec}`);
  return { user: publicUser(user), accessToken: token, tokenType: 'Bearer', expiresIn: ttlSec, csrfToken: csrf };
}

// ---- brute-force protection (in memory)
const failures = new Map();
function checkRate(email) {
  if (state.lab.bugs.noLoginRateLimit) { failures.set(email, []); return; } // seeded security bug
  const t = Date.now();
  const list = (failures.get(email) || []).filter(x => t - x < 60000);
  failures.set(email, list);
  if (list.length >= 5) {
    const retry = Math.ceil((60000 - (t - list[0])) / 1000);
    throw new HttpError(429, 'TOO_MANY_ATTEMPTS', `Too many failed attempts. Try again in ${retry} seconds`, { retryAfterSec: retry });
  }
}

route('POST', '/api/auth/register', {
  tag: 'Auth', summary: 'Create a customer account (also logs you in)', csrf: false,
  body: { name: 'Asha Verma', email: 'asha@example.com', phone: '9876501234', password: 'Secret@123', confirmPassword: 'Secret@123', acceptTerms: true },
}, ctx => {
  const b = ctx.body;
  const name = str(b.name), email = str(b.email).toLowerCase(), phone = str(b.phone), password = String(b.password || '');
  fail({
    name: name.length < 2 || name.length > 50 ? 'Name must be 2–50 characters' : /[<>]/.test(name) ? 'Name contains invalid characters' : null,
    email: !RE.email.test(email) ? 'Enter a valid email address' : null,
    phone: !RE.phone.test(phone) ? 'Enter a valid 10-digit mobile number' : null,
    password: passwordProblems(password),
    confirmPassword: b.confirmPassword !== undefined && b.confirmPassword !== password ? 'Passwords do not match' : null,
    acceptTerms: b.acceptTerms === false ? 'You must accept the terms' : null,
  });
  if (db.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists', { email: 'Already registered' });
  const p = newPassword(password);
  const id = db.run('INSERT INTO users (name, email, phone, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?,?)', name, email, phone, p.hash, p.salt, 'customer', now()).lastInsertRowid;
  const user = db.get('SELECT * FROM users WHERE id = ?', id);
  audit(id, 'user.register', 'user', id);
  sendEmail(email, 'Welcome to KarthikAutomation Store', `Hi ${name},\n\nYour practice account is ready. Use coupon WELCOME50 on your first order.\n\n— KarthikAutomation`);
  return { status: 201, body: createSession(ctx, user) };
});

route('POST', '/api/auth/login', {
  tag: 'Auth', summary: 'Log in. Returns a JWT access token and a CSRF token; also sets the ka_session cookie', csrf: false,
  body: { email: 'demo@karthikautomation.test', password: 'Passw0rd!', rememberMe: false },
}, ctx => {
  const email = str(ctx.body.email).toLowerCase(), password = String(ctx.body.password || '');
  fail({ email: !email ? 'Email is required' : null, password: !password ? 'Password is required' : null });
  checkRate(email);
  const user = db.get('SELECT * FROM users WHERE email = ?', email);
  if (!user || user.password_hash !== hashPassword(password, user.salt)) {
    failures.get(email).push(Date.now());
    audit(user?.id, 'auth.login_failed', 'user', user?.id, { email });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!user.is_active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact support.');
  failures.delete(email);
  audit(user.id, 'auth.login', 'user', user.id);
  return createSession(ctx, user, !!ctx.body.rememberMe);
});

route('POST', '/api/auth/logout', { tag: 'Auth', summary: 'Log out the current session', auth: 'optional' }, ctx => {
  if (ctx.session) db.run('DELETE FROM sessions WHERE id = ?', ctx.session.id);
  ctx.res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return { ok: true };
});

route('POST', '/api/auth/logout-all', { tag: 'Auth', summary: 'Log out from every device', auth: 'user' }, ctx => {
  const n = db.run('DELETE FROM sessions WHERE user_id = ?', ctx.user.id).changes;
  ctx.res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  audit(ctx.user.id, 'auth.logout_all', 'user', ctx.user.id, { sessions: n });
  return { ok: true, sessionsEnded: n };
});

route('GET', '/api/auth/me', { tag: 'Auth', summary: 'Current user (user is null for guests)', auth: 'optional' }, ctx => (
  ctx.user ? { user: publicUser(ctx.user), csrfToken: ctx.session.csrf_token, sessionExpiresAt: ctx.session.expires_at } : { user: null, csrfToken: null }
));

route('POST', '/api/auth/forgot-password', {
  tag: 'Auth', summary: 'Send a 6-digit OTP to the email (read it in the Test Mailbox)', csrf: false, body: { email: 'demo@karthikautomation.test' },
}, ctx => {
  const email = str(ctx.body.email).toLowerCase();
  fail({ email: !RE.email.test(email) ? 'Enter a valid email address' : null });
  const user = db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', email);
  if (user) {
    const otp = String(crypto.randomInt(100000, 1000000));
    db.run('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', user.id);
    db.run('INSERT INTO password_resets (user_id, otp, expires_at, created_at) VALUES (?,?,?,?)', user.id, otp, new Date(Date.now() + 10 * 60000).toISOString(), now());
    sendEmail(email, 'Your password reset code', `Hi ${user.name},\n\nYour one-time password reset code is: ${otp}\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this email.`);
    audit(user.id, 'auth.forgot_password', 'user', user.id);
  }
  // Same response whether or not the email exists (prevents user enumeration)
  return { ok: true, message: 'If an account exists for this email, a reset code has been sent.' };
});

route('POST', '/api/auth/reset-password', {
  tag: 'Auth', summary: 'Reset password with the OTP. Ends all sessions', csrf: false,
  body: { email: 'demo@karthikautomation.test', otp: '123456', newPassword: 'NewPass@123' },
}, ctx => {
  const email = str(ctx.body.email).toLowerCase(), otp = str(ctx.body.otp), pw = String(ctx.body.newPassword || '');
  fail({ email: !RE.email.test(email) ? 'Enter a valid email address' : null, otp: !/^\d{6}$/.test(otp) ? 'OTP must be 6 digits' : null, newPassword: passwordProblems(pw) });
  const user = db.get('SELECT * FROM users WHERE email = ?', email);
  const pr = user && db.get('SELECT * FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1', user.id);
  if (!pr) throw new HttpError(400, 'OTP_INVALID', 'Invalid or expired code');
  if (pr.attempts >= 5) throw new HttpError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new code');
  if (new Date(pr.expires_at) < new Date()) throw new HttpError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one');
  if (pr.otp !== otp) { db.run('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', pr.id); throw new HttpError(400, 'OTP_INVALID', 'Invalid or expired code'); }
  const p = newPassword(pw);
  db.tx(() => {
    db.run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', p.hash, p.salt, user.id);
    db.run('UPDATE password_resets SET used = 1 WHERE id = ?', pr.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
  });
  sendEmail(email, 'Your password was changed', `Hi ${user.name},\n\nYour password was reset successfully. All devices have been logged out.`);
  audit(user.id, 'auth.reset_password', 'user', user.id);
  return { ok: true, message: 'Password updated. Please log in with your new password.' };
});

module.exports = { publicUser, COOKIE, resetLoginFailures: () => failures.clear() };
