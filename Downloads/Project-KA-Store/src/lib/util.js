'use strict';
const { HttpError } = require('./http');

const money = n => Math.round(n * 100) / 100;
const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^[6-9]\d{9}$/,            // Indian mobile number
  pincode: /^[1-9]\d{5}$/,          // Indian PIN code
  upi: /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/,
};

function passwordProblems(pw) {
  const p = [];
  if (pw.length < 8) p.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) p.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) p.push('a lowercase letter');
  if (!/\d/.test(pw)) p.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) p.push('a special character');
  return p.length ? 'Password needs ' + p.join(', ') : null;
}

function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return sum % 10 === 0;
}

function fail(errors, message = 'Please fix the highlighted fields') {
  const clean = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  if (Object.keys(clean).length) throw new HttpError(422, 'VALIDATION_FAILED', message, clean);
}

function paging(query, defSize = 12, maxSize = 48) {
  const errors = {};
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? defSize : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) errors.page = 'page must be a positive integer';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxSize) errors.pageSize = `pageSize must be 1–${maxSize}`;
  if (Object.keys(errors).length) throw new HttpError(400, 'BAD_QUERY', 'Invalid query parameters', errors);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const str = v => (v === undefined || v === null ? '' : String(v)).trim();

module.exports = { money, RE, passwordProblems, luhn, fail, paging, str };
