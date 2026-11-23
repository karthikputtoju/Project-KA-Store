'use strict';
const { route, HttpError } = require('../lib/http');
const { fail, paging, str } = require('../lib/util');
const { state } = require('../lib/state');
const { db, now, audit, recalcRating } = require('../db');

const discountPct = (mrp, price) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

function productView(p, variants, extra = {}) {
  const vs = variants.map(v => ({ id: v.id, sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, stock: v.stock, inStock: v.stock > 0, discountPct: discountPct(v.mrp, v.price) }));
  const def = vs.find(v => v.inStock) || vs[0];
  return {
    id: p.id, name: p.name, brand: p.brand, emoji: p.emoji, description: p.description,
    category: { slug: p.cat_slug, name: p.cat_name },
    isVeg: p.is_veg === null ? null : !!p.is_veg, tags: p.tags ? p.tags.split(',') : [],
    rating: p.rating_avg, ratingCount: p.rating_count, isActive: !!p.is_active,
    price: def?.price, mrp: def?.mrp, discountPct: def?.discountPct || 0, inStock: vs.some(v => v.inStock),
    variants: vs, ...extra,
  };
}

const BASE_SELECT = `SELECT p.*, c.slug AS cat_slug, c.name AS cat_name FROM products p JOIN categories c ON c.id = p.category_id`;
function variantsFor(ids) {
  if (!ids.length) return {};
  const rows = db.all(`SELECT * FROM variants WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY price`, ...ids);
  const out = {};
  for (const r of rows) (out[r.product_id] = out[r.product_id] || []).push(r);
  return out;
}
function loadProduct(id, { includeInactive = false } = {}) {
  const p = db.get(`${BASE_SELECT} WHERE p.id = ?${includeInactive ? '' : ' AND p.is_active = 1'}`, Number(id));
  if (!p) throw new HttpError(404, 'NOT_FOUND', `Product ${id} not found`);
  return p;
}

route('GET', '/api/categories', { tag: 'Catalog', summary: 'All categories with product counts' }, () => (
  db.all(`SELECT c.slug, c.name, c.icon, COUNT(p.id) AS productCount FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 GROUP BY c.id ORDER BY c.sort_order`)
));

route('GET', '/api/brands', { tag: 'Catalog', summary: 'All brands (optionally for one category)', query: ['category'] }, ctx => (
  db.all(`SELECT p.brand AS name, COUNT(*) AS productCount FROM products p JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 ${ctx.query.category ? 'AND c.slug = ?' : ''} GROUP BY p.brand ORDER BY p.brand`, ...(ctx.query.category ? [ctx.query.category] : []))
));

const SORTS = {
  relevance: 'p.rating_count DESC, p.id', 'price-asc': 'min_price ASC', 'price-desc': 'min_price DESC', rating: 'p.rating_avg DESC, p.rating_count DESC',
  discount: 'max_discount DESC', newest: 'p.id DESC', name: 'p.name COLLATE NOCASE ASC',
};

route('GET', '/api/products', {
  tag: 'Catalog', summary: 'Search, filter, sort and paginate products', auth: 'optional',
  query: ['q', 'category', 'brand (comma separated)', 'minPrice', 'maxPrice', 'veg=true|false', 'inStock=true', 'minDiscount', 'minRating', 'sort=relevance|price-asc|price-desc|rating|discount|newest|name', 'page', 'pageSize (1-48)'],
}, ctx => {
  const q = ctx.query;
  const { page, pageSize, offset } = paging(q, 12, 48);
  const sort = q.sort || 'relevance';
  const num = k => (q[k] === undefined || q[k] === '' ? null : Number(q[k]));
  const minPrice = num('minPrice'), maxPrice = num('maxPrice'), minDiscount = num('minDiscount'), minRating = num('minRating');
  const errs = {
    sort: !SORTS[sort] ? 'sort must be one of ' + Object.keys(SORTS).join(', ') : null,
    minPrice: Number.isNaN(minPrice) || minPrice < 0 ? 'minPrice must be a positive number' : null,
    maxPrice: Number.isNaN(maxPrice) || maxPrice < 0 ? 'maxPrice must be a positive number' : null,
    minDiscount: Number.isNaN(minDiscount) ? 'minDiscount must be a number' : null,
    minRating: Number.isNaN(minRating) || minRating > 5 ? 'minRating must be 0–5' : null,
  };
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) errs.minPrice = 'minPrice cannot be greater than maxPrice';
  if (Object.values(errs).some(Boolean)) throw new HttpError(400, 'BAD_QUERY', 'Invalid query parameters', Object.fromEntries(Object.entries(errs).filter(([, v]) => v)));

  const where = ['p.is_active = 1'];
  const args = [];
  const term = str(q.q);
  if (term) {
    if (state.lab.bugs.caseSensitiveSearch) { where.push('(instr(p.name, ?) > 0 OR instr(p.brand, ?) > 0)'); args.push(term, term); } // seeded bug
    else { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.tags LIKE ? OR p.description LIKE ?)'); const l = `%${term}%`; args.push(l, l, l, l); }
  }
  if (q.category) { where.push('c.slug = ?'); args.push(q.category); }
  if (q.brand) { const bs = String(q.brand).split(',').filter(Boolean); where.push(`p.brand IN (${bs.map(() => '?').join(',')})`); args.push(...bs); }
  if (q.veg === 'true') where.push('p.is_veg = 1');
  if (q.veg === 'false') where.push('p.is_veg = 0');
  if (minRating !== null) { where.push('p.rating_avg >= ?'); args.push(minRating); }
  const having = [];
  if (q.inStock === 'true') having.push('total_stock > 0');
  if (minPrice !== null) { having.push('min_price >= ?'); args.push(minPrice); }
  if (maxPrice !== null) { having.push('min_price <= ?'); args.push(maxPrice); }
  if (minDiscount !== null) { having.push('max_discount >= ?'); args.push(minDiscount); }

  // Optional artificial CPU cost (Test Lab) to create a search bottleneck for stress tests
  if (state.lab.searchCost) { let x = 0; for (let i = 0; i < state.lab.searchCost; i++) x += Math.sqrt(i); if (x < 0) console.log(x); }

  const inner = `SELECT p.id, MIN(v.price) AS min_price, SUM(v.stock) AS total_stock, MAX(ROUND((v.mrp - v.price) * 100.0 / v.mrp)) AS max_discount
    FROM products p JOIN categories c ON c.id = p.category_id JOIN variants v ON v.product_id = p.id
    WHERE ${where.join(' AND ')} GROUP BY p.id ${having.length ? 'HAVING ' + having.join(' AND ') : ''}`;
  const total = db.get(`SELECT COUNT(*) AS n FROM (${inner})`, ...args).n;
  const rows = db.all(`SELECT p.*, c.slug AS cat_slug, c.name AS cat_name, x.min_price, x.max_discount FROM (${inner}) x JOIN products p ON p.id = x.id JOIN categories c ON c.id = p.category_id ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`, ...args, pageSize, offset);
  const vmap = variantsFor(rows.map(r => r.id));
  const wish = ctx.user ? new Set(db.all('SELECT product_id FROM wishlist WHERE user_id = ?', ctx.user.id).map(w => w.product_id)) : new Set();
  return {
    items: rows.map(r => productView(r, vmap[r.id] || [], { inWishlist: wish.has(r.id) })),
    page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), query: term, sort,
  };
});

route('GET', '/api/search/suggest', { tag: 'Catalog', summary: 'Autocomplete suggestions (min 2 characters)', query: ['q'] }, ctx => {
  const term = str(ctx.query.q);
  if (term.length < 2) return [];
  return db.all("SELECT p.id, p.name, p.emoji, p.brand FROM products p WHERE p.is_active = 1 AND (p.name LIKE ? OR p.brand LIKE ?) ORDER BY p.rating_count DESC LIMIT 8", `%${term}%`, `%${term}%`);
});

route('GET', '/api/products/:id', { tag: 'Catalog', summary: 'Product details with variants', auth: 'optional' }, ctx => {
  const p = loadProduct(ctx.params.id);
  const inWishlist = ctx.user ? !!db.get('SELECT 1 FROM wishlist WHERE user_id = ? AND product_id = ?', ctx.user.id, p.id) : false;
  const breakdown = db.all('SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? GROUP BY rating', p.id);
  const myReview = ctx.user ? db.get('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', p.id, ctx.user.id) : null;
  return productView(p, variantsFor([p.id])[p.id] || [], {
    inWishlist, hasReviewed: !!myReview,
    ratingBreakdown: Object.fromEntries([5, 4, 3, 2, 1].map(r => [r, breakdown.find(b => b.rating === r)?.n || 0])),
  });
});

route('GET', '/api/products/:id/similar', { tag: 'Catalog', summary: 'Similar products from the same category' }, ctx => {
  const p = loadProduct(ctx.params.id);
  const rows = db.all(`${BASE_SELECT} WHERE p.category_id = ? AND p.id <> ? AND p.is_active = 1 ORDER BY p.rating_avg DESC LIMIT 6`, p.category_id, p.id);
  const vmap = variantsFor(rows.map(r => r.id));
  return rows.map(r => productView(r, vmap[r.id] || []));
});

// ---- reviews
route('GET', '/api/products/:id/reviews', { tag: 'Reviews', summary: 'Product reviews', query: ['sort=newest|highest|lowest', 'page', 'pageSize'] }, ctx => {
  const p = loadProduct(ctx.params.id);
  const { page, pageSize, offset } = paging(ctx.query, 5, 20);
  const order = { newest: 'r.created_at DESC', highest: 'r.rating DESC, r.created_at DESC', lowest: 'r.rating ASC, r.created_at DESC' }[ctx.query.sort || 'newest'];
  if (!order) throw new HttpError(400, 'BAD_QUERY', 'sort must be newest, highest or lowest');
  const total = db.get('SELECT COUNT(*) AS n FROM reviews WHERE product_id = ?', p.id).n;
  const items = db.all(`SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY ${order} LIMIT ? OFFSET ?`, p.id, pageSize, offset)
    .map(r => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, verifiedPurchase: !!r.verified_purchase, author: r.user_name.split(' ')[0] + ' ' + (r.user_name.split(' ')[1] || '').charAt(0) + '.', createdAt: r.created_at }));
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
});

route('POST', '/api/products/:id/reviews', {
  tag: 'Reviews', summary: 'Write a review (one per product per user)', auth: 'user', body: { rating: 5, title: 'Great quality', body: 'Fresh and well packed. Will buy again.' },
}, ctx => {
  const p = loadProduct(ctx.params.id);
  const rating = Number(ctx.body.rating), title = str(ctx.body.title), body = str(ctx.body.body);
  fail({
    rating: !Number.isInteger(rating) || rating < 1 || rating > 5 ? 'Rating must be a whole number from 1 to 5' : null,
    title: title.length < 3 || title.length > 80 ? 'Title must be 3–80 characters' : null,
    body: body.length < 10 || body.length > 1000 ? 'Review must be 10–1000 characters' : null,
  });
  if (db.get('SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?', p.id, ctx.user.id)) throw new HttpError(409, 'ALREADY_REVIEWED', 'You have already reviewed this product');
  const verified = !!db.get("SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'", ctx.user.id, p.id);
  const id = db.run('INSERT INTO reviews (product_id, user_id, rating, title, body, verified_purchase, created_at) VALUES (?,?,?,?,?,?,?)', p.id, ctx.user.id, rating, title, body, verified ? 1 : 0, now()).lastInsertRowid;
  recalcRating(p.id);
  audit(ctx.user.id, 'review.create', 'review', id, { productId: p.id, rating });
  const np = db.get('SELECT rating_avg, rating_count FROM products WHERE id = ?', p.id);
  return { status: 201, body: { id, rating, title, body, verifiedPurchase: verified, productRating: np.rating_avg, productRatingCount: np.rating_count } };
});

route('DELETE', '/api/products/:id/reviews/mine', { tag: 'Reviews', summary: 'Delete my review', auth: 'user' }, ctx => {
  const p = loadProduct(ctx.params.id);
  const n = db.run('DELETE FROM reviews WHERE product_id = ? AND user_id = ?', p.id, ctx.user.id).changes;
  if (!n) throw new HttpError(404, 'NOT_FOUND', 'You have not reviewed this product');
  recalcRating(p.id);
  return { ok: true };
});

// ---- wishlist
route('GET', '/api/wishlist', { tag: 'Wishlist', summary: 'My wishlist', auth: 'user' }, ctx => {
  const rows = db.all(`${BASE_SELECT} JOIN wishlist w ON w.product_id = p.id WHERE w.user_id = ? ORDER BY w.created_at DESC`, ctx.user.id);
  const vmap = variantsFor([...new Set(rows.map(r => r.id))]);
  return rows.map(r => productView(r, vmap[r.id] || [], { inWishlist: true }));
});

route('POST', '/api/wishlist', { tag: 'Wishlist', summary: 'Add a product to my wishlist', auth: 'user', body: { productId: 1 } }, ctx => {
  const p = loadProduct(ctx.body.productId);
  const exists = db.get('SELECT 1 FROM wishlist WHERE user_id = ? AND product_id = ?', ctx.user.id, p.id);
  if (exists && !state.lab.bugs.wishlistDuplicates) return { status: 200, body: { ok: true, alreadyInWishlist: true } };
  db.run('INSERT INTO wishlist (user_id, product_id, created_at) VALUES (?,?,?)', ctx.user.id, p.id, now());
  return { status: 201, body: { ok: true, count: db.get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', ctx.user.id).n } };
});

route('DELETE', '/api/wishlist/:productId', { tag: 'Wishlist', summary: 'Remove a product from my wishlist', auth: 'user' }, ctx => {
  const n = db.run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', ctx.user.id, Number(ctx.params.productId)).changes;
  if (!n) throw new HttpError(404, 'NOT_FOUND', 'Product is not in your wishlist');
  return { ok: true };
});

module.exports = { productView, variantsFor, loadProduct, BASE_SELECT, discountPct };
