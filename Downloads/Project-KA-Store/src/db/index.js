'use strict';
// SQLite database (Node's built-in node:sqlite). File: data/store.db (override with DB_PATH).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { CATEGORIES, PRODUCTS, COUPONS } = require('./seed-data');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'store.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const conn = new DatabaseSync(DB_PATH);
conn.exec('PRAGMA foreign_keys = ON;');
if (DB_PATH !== ':memory:') conn.exec('PRAGMA journal_mode = WAL;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  emoji TEXT NOT NULL,
  description TEXT NOT NULL,
  is_veg INTEGER,
  tags TEXT,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  mrp REAL NOT NULL CHECK (mrp > 0),
  price REAL NOT NULL CHECK (price > 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  verified_purchase INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (product_id, user_id)
);
CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, variant_id)
);
CREATE TABLE IF NOT EXISTS carts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coupon_code TEXT
);
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('flat','percent','free_delivery')),
  value REAL NOT NULL,
  min_order REAL NOT NULL DEFAULT 0,
  max_discount REAL,
  category_slug TEXT,
  per_user_limit INTEGER,
  first_order_only INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  booked INTEGER NOT NULL DEFAULT 0,
  UNIQUE (slot_date, start_time)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('placed','confirmed','packed','out_for_delivery','delivered','cancelled','return_requested','returned')),
  item_count INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  mrp_total REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('COD','UPI','CARD')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending','paid','refunded','failed')),
  payment_ref TEXT,
  ship_name TEXT NOT NULL, ship_phone TEXT NOT NULL, ship_line1 TEXT NOT NULL, ship_line2 TEXT,
  ship_city TEXT NOT NULL, ship_state TEXT NOT NULL, ship_pincode TEXT NOT NULL,
  slot_id INTEGER REFERENCES delivery_slots(id),
  slot_label TEXT,
  idempotency_key TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  emoji TEXT NOT NULL,
  unit_mrp REAL NOT NULL,
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL,
  line_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS ix_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS ix_emails_to ON emails(to_email);
`;

// ------------------------------------------------------------------ helpers
const db = {
  conn,
  path: DB_PATH,
  get: (sql, ...p) => conn.prepare(sql).get(...p),
  all: (sql, ...p) => conn.prepare(sql).all(...p),
  run: (sql, ...p) => conn.prepare(sql).run(...p),
  tx(fn) {
    conn.exec('BEGIN IMMEDIATE');
    try { const r = fn(); conn.exec('COMMIT'); return r; } catch (e) { try { conn.exec('ROLLBACK'); } catch { /* ignore */ } throw e; }
  },
};

const now = () => new Date().toISOString();
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 32, { N: 4096 }).toString('hex');
function newPassword(pw) { const salt = crypto.randomBytes(8).toString('hex'); return { salt, hash: hashPassword(pw, salt) }; }

function audit(userId, action, entity, entityId, details) {
  db.run('INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?,?,?,?,?,?)',
    userId ?? null, action, entity ?? null, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, now());
}
function sendEmail(to, subject, body) {
  db.run('INSERT INTO emails (to_email, subject, body, created_at) VALUES (?,?,?,?)', to, subject, body, now());
}

// ------------------------------------------------------------------ delivery slots
const WINDOWS = [['07:00', '09:00'], ['09:00', '11:00'], ['12:00', '14:00'], ['17:00', '19:00'], ['19:00', '21:00']];
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function ensureSlots(days = 4) {
  const ins = conn.prepare('INSERT OR IGNORE INTO delivery_slots (slot_date, start_time, end_time, capacity) VALUES (?,?,?,?)');
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    for (const [s, e] of WINDOWS) ins.run(localDate(d), s, e, 20);
  }
}

// ------------------------------------------------------------------ seed
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

function seed() {
  const r = rng(42);
  const t0 = now();
  db.tx(() => {
    // users
    const insUser = conn.prepare('INSERT INTO users (name, email, phone, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?,?)');
    const mk = (name, email, phone, pw, role) => { const p = newPassword(pw); return insUser.run(name, email, phone, p.hash, p.salt, role, t0).lastInsertRowid; };
    mk('Store Admin', 'admin@karthikautomation.test', '9000000000', 'Admin@123', 'admin');
    const demoId = mk('Demo User', 'demo@karthikautomation.test', '9876543210', 'Passw0rd!', 'customer');
    const firstNames = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Isha', 'Kabir', 'Meera', 'Rohan', 'Saanvi'];
    const lastNames = ['Sharma', 'Reddy', 'Iyer', 'Patel', 'Khan', 'Das', 'Nair', 'Gupta', 'Singh', 'Rao'];
    for (let i = 1; i <= 50; i++) mk(`${firstNames[i % 10]} ${lastNames[(i * 3) % 10]}`, `user${i}@karthikautomation.test`, String(9100000000 + i), 'Passw0rd!', 'customer');
    // locked account for negative testing
    const lockedId = mk('Locked User', 'locked@karthikautomation.test', '9111111111', 'Passw0rd!', 'customer');
    db.run('UPDATE users SET is_active = 0 WHERE id = ?', lockedId);

    // addresses
    const insAddr = conn.prepare('INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    insAddr.run(demoId, 'Home', 'Demo User', '9876543210', 'Flat 402, Sunrise Apartments', 'MG Road', 'Bengaluru', 'Karnataka', '560001', 1, t0);
    insAddr.run(demoId, 'Work', 'Demo User', '9876543210', 'KA Tech Park, Tower B', 'Outer Ring Road', 'Bengaluru', 'Karnataka', '560103', 0, t0);
    const cities = [['Hyderabad', 'Telangana', '500081'], ['Pune', 'Maharashtra', '411001'], ['Chennai', 'Tamil Nadu', '600001'], ['Mumbai', 'Maharashtra', '400001'], ['Delhi', 'Delhi', '110001']];
    for (let i = 1; i <= 50; i++) { const c = cities[i % 5]; insAddr.run(i + 2, 'Home', `Load User ${i}`, String(9100000000 + i), `${i} Test Street`, null, c[0], c[1], c[2], 1, t0); }

    // catalogue
    const insCat = conn.prepare('INSERT INTO categories (slug, name, icon, sort_order) VALUES (?,?,?,?)');
    const catId = {};
    CATEGORIES.forEach(([slug, name, icon], i) => { catId[slug] = insCat.run(slug, name, icon, i).lastInsertRowid; });
    const insProd = conn.prepare('INSERT INTO products (name, brand, category_id, emoji, description, is_veg, tags, created_at) VALUES (?,?,?,?,?,?,?,?)');
    const insVar = conn.prepare('INSERT INTO variants (product_id, sku, label, mrp, price, stock) VALUES (?,?,?,?,?,?)');
    PRODUCTS.forEach(([name, brand, cat, emoji, desc, variants, tags, veg], i) => {
      const isVeg = ['household', 'personal-care'].includes(cat) || (cat === 'baby-care' && emoji !== '🥣') ? null : (veg === 0 ? 0 : 1);
      const pid = insProd.run(name, brand, catId[cat], emoji, desc, isVeg, tags, t0).lastInsertRowid;
      variants.forEach(([label, mrp, price, stock], j) => insVar.run(pid, `KA-${cat.slice(0, 3).toUpperCase()}-${String(pid).padStart(3, '0')}-${j + 1}`, label, mrp, price, stock));
    });

    // coupons
    const insCoupon = conn.prepare('INSERT INTO coupons (code, type, value, min_order, max_discount, category_slug, per_user_limit, first_order_only, expires_at, description) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const [code, type, value, min, max, days, limit, desc, cat, firstOnly] of COUPONS) {
      insCoupon.run(code, type, value, min, max, cat, limit, firstOnly ? 1 : 0, new Date(Date.now() + days * 86400000).toISOString(), desc);
    }

    // historical orders (rich data for SQL practice & admin dashboard)
    const variants = db.all('SELECT v.*, p.name AS pname, p.emoji FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock > 0');
    const insOrder = conn.prepare(`INSERT INTO orders (order_no, user_id, status, item_count, subtotal, mrp_total, discount, delivery_fee, total, payment_method, payment_status, payment_ref,
      ship_name, ship_phone, ship_line1, ship_city, ship_state, ship_pincode, slot_label, created_at, updated_at, delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insItem = conn.prepare('INSERT INTO order_items (order_id, variant_id, product_id, product_name, variant_label, emoji, unit_mrp, unit_price, qty, line_total) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insEvent = conn.prepare('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)');
    const statuses = ['delivered', 'delivered', 'delivered', 'delivered', 'cancelled', 'out_for_delivery', 'packed', 'confirmed'];
    const methods = ['UPI', 'CARD', 'COD'];
    for (let n = 0; n < 60; n++) {
      const userId = n % 4 === 0 ? demoId : 3 + Math.floor(r() * 50);
      const addr = db.get('SELECT * FROM addresses WHERE user_id = ? AND is_default = 1', userId);
      const created = new Date(Date.now() - Math.floor(r() * 30 * 86400000) - 3600000);
      const status = statuses[Math.floor(r() * statuses.length)];
      const method = methods[Math.floor(r() * 3)];
      const lines = [];
      const count = 1 + Math.floor(r() * 4);
      for (let k = 0; k < count; k++) { const v = variants[Math.floor(r() * variants.length)]; if (!lines.find(l => l.v.id === v.id)) lines.push({ v, qty: 1 + Math.floor(r() * 3) }); }
      const subtotal = lines.reduce((s, l) => s + l.v.price * l.qty, 0);
      const mrpTotal = lines.reduce((s, l) => s + l.v.mrp * l.qty, 0);
      const fee = subtotal >= 499 ? 0 : 30;
      const orderNo = `KA${localDate(created).replace(/-/g, '')}-${10001 + n}`;
      const payStatus = status === 'cancelled' ? (method === 'COD' ? 'failed' : 'refunded') : (method === 'COD' && status !== 'delivered' ? 'pending' : 'paid');
      const oid = insOrder.run(orderNo, userId, status, lines.reduce((s, l) => s + l.qty, 0), subtotal, mrpTotal, 0, fee, subtotal + fee, method, payStatus,
        method === 'COD' ? null : 'PAY' + Math.floor(r() * 1e10), addr.full_name, addr.phone, addr.line1, addr.city, addr.state, addr.pincode, '09:00 - 11:00',
        created.toISOString(), created.toISOString(), status === 'delivered' ? new Date(created.getTime() + 86400000).toISOString() : null).lastInsertRowid;
      for (const l of lines) insItem.run(oid, l.v.id, l.v.product_id, l.v.pname, l.v.label, l.v.emoji, l.v.mrp, l.v.price, l.qty, l.v.price * l.qty);
      insEvent.run(oid, 'placed', 'Order placed', created.toISOString());
      if (status !== 'placed') insEvent.run(oid, status, null, created.toISOString());
    }

    // reviews
    const titles = [[5, 'Excellent quality', 'Fresh and exactly as described. Will order again.'], [4, 'Good value', 'Good product for the price, delivery was on time.'],
      [3, 'Average', 'It is okay. Packaging could be better.'], [5, 'Loved it', 'My family loved it. Highly recommended!'], [2, 'Not fresh', 'Received items that were not very fresh.']];
    const insRev = conn.prepare('INSERT OR IGNORE INTO reviews (product_id, user_id, rating, title, body, verified_purchase, created_at) VALUES (?,?,?,?,?,?,?)');
    const productCount = PRODUCTS.length;
    for (let n = 0; n < 160; n++) {
      const [rating, title, body] = titles[Math.floor(r() * titles.length)];
      insRev.run(1 + Math.floor(r() * productCount), 3 + Math.floor(r() * 50), rating, title, body, r() > .3 ? 1 : 0, new Date(Date.now() - Math.floor(r() * 60 * 86400000)).toISOString());
    }
    recalcAllRatings();
    sendEmail('demo@karthikautomation.test', 'Welcome to KarthikAutomation Store', 'Hi Demo User,\n\nYour practice account is ready. Happy testing!\n\n— KarthikAutomation');
  });
  ensureSlots();
}

function recalcRating(productId) {
  db.run(`UPDATE products SET rating_avg = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = ?), 0),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?) WHERE id = ?`, productId, productId, productId);
}
function recalcAllRatings() {
  db.run(`UPDATE products SET rating_avg = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.product_id = products.id), 0),
    rating_count = (SELECT COUNT(*) FROM reviews r WHERE r.product_id = products.id)`);
}

function reset() {
  conn.exec('PRAGMA foreign_keys = OFF;');
  const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) conn.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  conn.exec('PRAGMA foreign_keys = ON;');
  conn.exec(SCHEMA);
  seed();
}

function init() {
  conn.exec(SCHEMA);
  const has = db.get('SELECT COUNT(*) AS n FROM users');
  if (!has.n) seed(); else ensureSlots();
}

// Read-only connection for the learning SQL console
let ro = null;
function readOnly() {
  if (DB_PATH === ':memory:') return conn;
  if (!ro) ro = new DatabaseSync(DB_PATH, { readOnly: true });
  return ro;
}

module.exports = { db, init, reset, now, hashPassword, newPassword, audit, sendEmail, ensureSlots, recalcRating, localDate, readOnly };
