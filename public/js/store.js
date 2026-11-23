import { state, views, $, $$, app, esc, inr, api, toast, skeletons, emptyState, productCard, bindProductGrid, pager, bindPager, veg, stars, addControl, setCartQty, qtyInCart, toggleWishlist, modal, showFieldErrors, every, needLogin, date, refreshView } from './core.js';

// ---------------------------------------------------------------- home
views.home = async () => {
  app().innerHTML = `<div class="view" data-testid="page-home">
    <section class="carousel" data-testid="hero-carousel" aria-roledescription="carousel" aria-label="Offers">
      <div class="slide s1 on" data-testid="slide-1" aria-hidden="false"><div><span class="eyebrow" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.2)"><span class="dot"></span> Automation practice store</span>
        <h2 style="margin-top:16px">Daily needs, delivered <span style="color:#ff2a1f">in your slot</span>.</h2><p>Fresh fruits, dairy, staples and household essentials. A realistic store to practise UI, API, DB and performance testing.</p>
        <a class="btn" href="#/shop" data-testid="hero-shop-now">Shop now →</a></div><div class="art" aria-hidden="true">🛒</div></div>
      <div class="slide s2" data-testid="slide-2" aria-hidden="true"><div><h2>20% off fresh fruits & veggies</h2><p>Use the code below at checkout. Max discount ₹150.</p><span class="code">FRESH20</span><a class="btn ghost" href="#/shop?category=fruits-vegetables">Shop fresh</a></div><div class="art" aria-hidden="true">🥭</div></div>
      <div class="slide s3" data-testid="slide-3" aria-hidden="true"><div><h2>New here? ₹50 off your first order</h2><p>Create an account and apply WELCOME50 on orders above ₹199.</p><span class="code">WELCOME50</span><a class="btn" href="#/register">Create account</a></div><div class="art" aria-hidden="true">🎁</div></div>
      <button class="car-nav prev" aria-label="Previous slide" data-testid="carousel-prev">‹</button><button class="car-nav next" aria-label="Next slide" data-testid="carousel-next">›</button>
      <div class="dots" role="tablist">${[0, 1, 2].map(i => `<button aria-label="Go to slide ${i + 1}" aria-current="${i === 0}" data-dot="${i}" data-testid="carousel-dot-${i + 1}"></button>`).join('')}</div>
    </section>
    <div class="usp"><div><span class="i">⏱️</span><span><b>Slot delivery</b>Pick a 2-hour window</span></div><div><span class="i">🚚</span><span><b>Free delivery</b>On orders above ₹499</span></div>
      <div><span class="i">💳</span><span><b>UPI, Card & COD</b>Test payments only</span></div><div><span class="i">↩️</span><span><b>Easy returns</b>Within 7 days</span></div></div>
    <div class="section-head"><h2>Shop by category</h2></div>
    <div class="cat-grid" data-testid="category-grid">${state.categories.map((c, i) => `<a class="cat-tile" style="--i:${i}" href="#/shop?category=${c.slug}" data-testid="category-${c.slug}"><span class="em" aria-hidden="true">${c.icon}</span>${esc(c.name)}</a>`).join('')}</div>
    <div class="section-head"><h2>Best sellers</h2><a href="#/shop?sort=relevance" data-testid="see-all-bestsellers">See all →</a></div>
    <div class="rail" id="rail1" data-testid="bestsellers">${skeletons(5, 320)}</div>
    <div class="section-head"><h2>Top deals</h2><a href="#/shop?sort=discount" data-testid="see-all-deals">See all →</a></div>
    <div class="rail" id="rail2" data-testid="top-deals">${skeletons(5, 320)}</div>
    <div class="section-head"><h2>Learn automation here</h2><a href="#/practice">Practice playground →</a></div>
    <div class="pg-grid">${[['🧪', 'UI automation', 'Every element has a data-testid. Try Cypress, Playwright or Selenium.', '#/practice'], ['🔌', 'API testing', 'REST API with JWT auth, OpenAPI docs and a Postman collection.', '#/api-docs'], ['🗄️', 'Database testing', 'Real SQLite DB. Verify orders, stock and audit logs with SQL.', '#/db'], ['📈', 'Performance testing', 'Live metrics, chaos controls, a quick load test and scripts for NeoLoad / k6.', '#/performance'], ['🛡️', 'Security testing', 'Vulnerability switches, header check, JWT decoder and the OWASP Top 10.', '#/security'], ['📋', 'Test coverage', 'Test plan, business cases, scenarios, 60 test cases, test data and bug reports.', '#/coverage']]
      .map(([e, t, d, h], i) => `<a class="pg-card" style="--i:${i}" href="${h}"><span class="em">${e}</span><h3>${t}</h3><p>${d}</p></a>`).join('')}</div>
  </div>`;

  // carousel
  let idx = 0;
  const slides = $$('.slide'), dots = $$('[data-dot]');
  const show = n => { idx = (n + 3) % 3; slides.forEach((s, i) => { s.classList.toggle('on', i === idx); s.setAttribute('aria-hidden', String(i !== idx)); }); dots.forEach((d, i) => d.setAttribute('aria-current', String(i === idx))); };
  $('.car-nav.prev').onclick = () => show(idx - 1);
  $('.car-nav.next').onclick = () => show(idx + 1);
  dots.forEach(d => (d.onclick = () => show(Number(d.dataset.dot))));
  every(6000, () => { if (!$('.carousel:hover')) show(idx + 1); });

  const [best, deals] = await Promise.all([api('GET', '/api/products?sort=relevance&pageSize=10&inStock=true'), api('GET', '/api/products?sort=discount&pageSize=10&inStock=true')]);
  const all = [...best.items, ...deals.items];
  $('#rail1').innerHTML = best.items.map(productCard).join('');
  $('#rail2').innerHTML = deals.items.map(productCard).join('');
  bindProductGrid($('[data-testid="page-home"]'), () => all); // bind to the view, never to the persistent #app
};

// ---------------------------------------------------------------- shop / search
views.shop = async params => {
  const p = Object.fromEntries(params.entries());
  const page = Number(p.page || 1);
  const go = changes => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v === '' || v === null || v === undefined || v === false) n.delete(k); else n.set(k, v); }
    if (!('page' in changes)) n.delete('page');
    location.hash = '#/shop' + (n.toString() ? '?' + n : '');
  };
  const cat = state.categories.find(c => c.slug === p.category);
  const brandsSel = (p.brand || '').split(',').filter(Boolean);
  app().innerHTML = `<div class="view" data-testid="page-shop">
    <div class="crumbs"><a href="#/">Home</a> / ${cat ? `<a href="#/shop">Shop</a> / <span>${esc(cat.name)}</span>` : '<span>Shop</span>'}</div>
    <div class="shop">
      <aside class="filters panel" aria-label="Filters" data-testid="filters">
        <div class="facet"><h3>Category</h3>
          <label class="chk"><input type="radio" name="cat" value="" ${!p.category ? 'checked' : ''} data-testid="filter-category-all"> All categories</label>
          ${state.categories.map(c => `<label class="chk"><input type="radio" name="cat" value="${c.slug}" ${p.category === c.slug ? 'checked' : ''} data-testid="filter-category-${c.slug}"> ${esc(c.name)} <small>${c.productCount}</small></label>`).join('')}</div>
        <div class="facet"><h3>Brand</h3><div id="brandList" data-testid="filter-brands"><span class="spinner"></span></div></div>
        <div class="facet"><h3>Price (₹)</h3><form class="price-row" id="priceForm" data-testid="filter-price-form">
          <input type="number" min="0" name="minPrice" placeholder="Min" value="${esc(p.minPrice || '')}" aria-label="Minimum price" data-testid="filter-min-price">
          <input type="number" min="0" name="maxPrice" placeholder="Max" value="${esc(p.maxPrice || '')}" aria-label="Maximum price" data-testid="filter-max-price">
          <button class="btn sm ghost" data-testid="filter-price-apply">Go</button></form><span class="err" id="priceErr" data-testid="filter-price-error"></span></div>
        <div class="facet"><h3>Preferences</h3>
          <label class="chk"><input type="checkbox" id="fVeg" ${p.veg === 'true' ? 'checked' : ''} data-testid="filter-veg"> ${veg(true)} Vegetarian only</label>
          <label class="chk"><input type="checkbox" id="fStock" ${p.inStock === 'true' ? 'checked' : ''} data-testid="filter-in-stock"> In stock only</label></div>
        <div class="facet"><h3>Discount</h3>${['10', '20', '30'].map(d => `<label class="chk"><input type="radio" name="disc" value="${d}" ${p.minDiscount === d ? 'checked' : ''} data-testid="filter-discount-${d}"> ${d}% or more</label>`).join('')}
          <label class="chk"><input type="radio" name="disc" value="" ${!p.minDiscount ? 'checked' : ''} data-testid="filter-discount-any"> Any</label></div>
        <div class="facet"><h3>Customer rating</h3>${['4', '3'].map(r => `<label class="chk"><input type="radio" name="rating" value="${r}" ${p.minRating === r ? 'checked' : ''} data-testid="filter-rating-${r}"> ${r}★ & above</label>`).join('')}
          <label class="chk"><input type="radio" name="rating" value="" ${!p.minRating ? 'checked' : ''} data-testid="filter-rating-any"> Any</label></div>
        <button class="btn ghost sm block" id="clearAll" data-testid="clear-filters">Clear all filters</button>
      </aside>
      <section>
        <div class="toolbar">
          <div><h1 style="font-size:1.5rem;margin:0" data-testid="shop-title">${p.q ? 'Search results' : esc(cat?.name || 'All products')}</h1>
            <div class="muted" id="resultInfo" data-testid="result-count" aria-live="polite">Loading…</div></div>
          <label class="sr-only" for="sort">Sort by</label>
          <select id="sort" style="width:auto" data-testid="sort-select">${[['relevance', 'Popularity'], ['price-asc', 'Price: Low to High'], ['price-desc', 'Price: High to Low'], ['discount', 'Discount'], ['rating', 'Customer rating'], ['newest', 'Newest first'], ['name', 'Name A–Z']].map(([v, l]) => `<option value="${v}" ${v === (p.sort || 'relevance') ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="active-filters" id="chips" data-testid="active-filters"></div>
        <div class="grid-products" id="results" data-testid="product-list">${skeletons(8)}</div>
        <div id="pager"></div>
      </section>
    </div></div>`;

  $$('input[name="cat"]').forEach(r => (r.onchange = () => go({ category: r.value, brand: '' })));
  $$('input[name="disc"]').forEach(r => (r.onchange = () => go({ minDiscount: r.value })));
  $$('input[name="rating"]').forEach(r => (r.onchange = () => go({ minRating: r.value })));
  $('#fVeg').onchange = e => go({ veg: e.target.checked ? 'true' : '' });
  $('#fStock').onchange = e => go({ inStock: e.target.checked ? 'true' : '' });
  $('#sort').onchange = e => go({ sort: e.target.value === 'relevance' ? '' : e.target.value });
  $('#clearAll').onclick = () => (location.hash = '#/shop' + (p.q ? '?q=' + encodeURIComponent(p.q) : ''));
  $('#priceForm').onsubmit = e => {
    e.preventDefault();
    const f = e.target.elements, min = f.minPrice.value, max = f.maxPrice.value;
    if (min && max && Number(min) > Number(max)) { $('#priceErr').textContent = 'Min price cannot be more than max price'; f.minPrice.setAttribute('aria-invalid', 'true'); return; }
    go({ minPrice: min, maxPrice: max });
  };

  // active filter chips
  const chipDefs = [['q', `Search: "${p.q}"`], ['category', cat?.name], ['brand', p.brand && `Brand: ${brandsSel.join(', ')}`], ['minPrice', p.minPrice && `Min ₹${p.minPrice}`], ['maxPrice', p.maxPrice && `Max ₹${p.maxPrice}`], ['veg', p.veg && 'Veg only'], ['inStock', p.inStock && 'In stock'], ['minDiscount', p.minDiscount && `${p.minDiscount}%+ off`], ['minRating', p.minRating && `${p.minRating}★+`]];
  $('#chips').innerHTML = chipDefs.filter(([k, l]) => p[k] && l).map(([k, l]) => `<button data-chip="${k}" data-testid="active-filter-${k}">${esc(l)}</button>`).join('');
  $$('[data-chip]').forEach(b => (b.onclick = () => go({ [b.dataset.chip]: '' })));

  api('GET', '/api/brands' + (p.category ? '?category=' + p.category : '')).then(brands => {
    if (!$('#brandList')) return; // user already left the page
    $('#brandList').innerHTML = brands.map(b => `<label class="chk"><input type="checkbox" value="${esc(b.name)}" ${brandsSel.includes(b.name) ? 'checked' : ''} data-brand data-testid="filter-brand-${esc(b.name)}"> ${esc(b.name)} <small>${b.productCount}</small></label>`).join('');
    $$('[data-brand]').forEach(c => (c.onchange = () => go({ brand: $$('[data-brand]:checked').map(x => x.value).join(',') })));
  });

  const qs = new URLSearchParams({ pageSize: 12 });
  for (const k of ['q', 'category', 'brand', 'minPrice', 'maxPrice', 'veg', 'inStock', 'minDiscount', 'minRating', 'sort', 'page']) if (p[k]) qs.set(k, p[k]);
  let items = [];
  try {
    const data = await api('GET', '/api/products?' + qs);
    items = data.items;
    const label = `${data.total} item${data.total === 1 ? '' : 's'}`;
    const info = $('#resultInfo');
    // Test Lab bug "unsafeSearchEcho": renders the raw search term as HTML (XSS practice)
    if (p.q && state.lab?.bugs?.unsafeSearchEcho) info.innerHTML = `${label} for “${p.q}”`;
    else info.textContent = p.q ? `${label} for “${p.q}”` : label;
    $('#results').innerHTML = items.length ? items.map(productCard).join('')
      : `<div style="grid-column:1/-1">${emptyState('🔍', 'No products found', 'Try a different search term or remove some filters.', '<button class="btn" id="clr2">Clear filters</button>', 'no-results')}</div>`;
    $('#clr2')?.addEventListener('click', () => (location.hash = '#/shop'));
    $('#pager').innerHTML = pager(data.page, data.totalPages);
    bindPager($('#pager'), n => go({ page: n }));
  } catch (e) {
    $('#results').innerHTML = `<div class="form-error" style="grid-column:1/-1" data-testid="load-error">${esc(e.message)}</div>`;
    $('#resultInfo').textContent = '';
  }
  bindProductGrid($('#results'), () => items);
};

// ---------------------------------------------------------------- product detail
views.product = async (params, id) => {
  app().innerHTML = `<div class="view pdp2" data-testid="page-product">${skeletons(2, 420)}</div>`;
  let p;
  try { p = await api('GET', '/api/products/' + encodeURIComponent(id)); }
  catch (e) { return views.notFound(e.status === 404 ? 'This product does not exist or is no longer available.' : e.message); }
  let v = p.variants.find(x => x.inStock) || p.variants[0];
  const total = Object.values(p.ratingBreakdown).reduce((a, b) => a + b, 0) || 1;
  app().innerHTML = `<div class="view" data-testid="page-product" data-product-id="${p.id}">
    <div class="crumbs"><a href="#/">Home</a> / <a href="#/shop?category=${p.category.slug}" data-testid="breadcrumb-category">${esc(p.category.name)}</a> / <span>${esc(p.name)}</span></div>
    <div class="pdp2">
      <div class="gallery" data-testid="product-image"><span class="em" role="img" aria-label="${esc(p.name)}" id="zoomEm" title="Click to zoom">${p.emoji}</span></div>
      <div>
        <div class="pbrand" style="font-size:.85rem">${veg(p.isVeg)} <a href="#/shop?brand=${encodeURIComponent(p.brand)}" data-testid="product-brand">${esc(p.brand)}</a></div>
        <h1 style="font-size:2rem;margin:8px 0" data-testid="product-title">${esc(p.name)}</h1>
        ${p.ratingCount ? `<a href="#" id="toReviews" class="mini-rating" style="font-size:.9rem" data-testid="pdp-rating"><b>★ ${p.rating}</b> · ${p.ratingCount} ratings</a>` : '<span class="muted">No ratings yet</span>'}
        <div style="margin:18px 0 4px" class="big-price" id="priceBox" data-testid="pdp-price"></div>
        <small class="muted">Inclusive of all taxes</small>
        <h3 style="font-family:var(--font);font-size:.9rem;margin:22px 0 0">Pack size</h3>
        <div class="variants" role="radiogroup" aria-label="Pack size" data-testid="variant-options">${p.variants.map(x => `<button class="vchip" role="radio" aria-checked="${x.id === v.id}" data-v="${x.id}" ${x.inStock ? '' : 'disabled'} data-testid="variant-${x.id}"><b>${esc(x.label)}</b><small>${inr(x.price)}${x.inStock ? '' : ' · Sold out'}</small></button>`).join('')}</div>
        <div class="buy-row"><div id="addBox" data-testid="pdp-add"></div>
          <button class="btn ghost" id="wishBtn" data-wish="${p.id}" aria-pressed="${p.inWishlist}" data-testid="pdp-wishlist">${p.inWishlist ? '♥ Wishlisted' : '♡ Wishlist'}</button></div>
        <div id="stockNote" class="muted" data-testid="stock-status" aria-live="polite"></div>
        <ul class="specs"><li><b>SKU</b><span id="skuBox" data-testid="product-sku"></span></li><li><b>Category</b>${esc(p.category.name)}</li><li><b>Delivery</b>Free above ₹499</li><li><b>Returns</b>Within 7 days of delivery</li></ul>
      </div>
    </div>
    <div class="tabs" role="tablist" data-testid="product-tabs"><button role="tab" aria-selected="true" data-tab="desc" data-testid="tab-description">Description</button><button role="tab" aria-selected="false" data-tab="reviews" data-testid="tab-reviews">Ratings & reviews (${p.ratingCount})</button></div>
    <div id="tab-desc" role="tabpanel" data-testid="panel-description"><p>${esc(p.description)}</p><p class="muted">Tags: ${p.tags.map(t => `<code>${esc(t)}</code>`).join(' ')}</p></div>
    <div id="tab-reviews" role="tabpanel" hidden data-testid="panel-reviews">
      <div class="rating-sum"><div class="rating-big"><b data-testid="rating-average">${p.rating || '–'}</b><span class="stars">${stars(p.rating)}</span><br><small class="muted">${p.ratingCount} ratings</small></div>
        <div>${[5, 4, 3, 2, 1].map(r => `<div class="bar-row"><span>${r}★</span><div class="bar"><i style="width:${(p.ratingBreakdown[r] / total) * 100}%"></i></div><small>${p.ratingBreakdown[r]}</small></div>`).join('')}</div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <select id="revSort" style="width:auto" data-testid="review-sort" aria-label="Sort reviews"><option value="newest">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select>
        <button class="btn sm" id="writeRev" data-testid="write-review" ${p.hasReviewed ? 'disabled title="You already reviewed this product"' : ''}>${p.hasReviewed ? 'You reviewed this' : 'Write a review'}</button></div>
      <div id="revList" data-testid="review-list"></div><div id="revPager"></div>
    </div>
    <div class="section-head"><h2>Similar products</h2></div>
    <div class="rail" id="similar" data-testid="similar-products">${skeletons(4, 300)}</div>
  </div>`;

  const paint = () => {
    $('#priceBox').innerHTML = `${inr(v.price)}${v.mrp > v.price ? `<s>MRP ${inr(v.mrp)}</s><span class="pct">${v.discountPct}% OFF</span>` : ''}`;
    $('#addBox').innerHTML = v.inStock ? (qtyInCart(v.id) ? addControl(v, 'lg') : `<button class="btn" data-add="${v.id}" data-testid="pdp-add-to-cart">Add to cart</button>`) : '<button class="btn" disabled data-testid="pdp-add-to-cart">Out of stock</button>';
    $('#skuBox').textContent = v.sku;
    $('#stockNote').innerHTML = !v.inStock ? '<span style="color:var(--red)">Currently unavailable</span>' : v.stock <= 10 ? `<span style="color:var(--warn);font-weight:700">Hurry, only ${v.stock} left!</span>` : 'In stock';
  };
  paint();
  $$('.vchip').forEach(b => (b.onclick = () => { v = p.variants.find(x => x.id === Number(b.dataset.v)); $$('.vchip').forEach(x => x.setAttribute('aria-checked', String(x === b))); paint(); }));
  $('#addBox').onclick = async e => {
    const btn = e.target.closest('[data-add],[data-inc],[data-dec]');
    if (!btn) return;
    const cur = qtyInCart(v.id);
    const next = btn.dataset.add ? 1 : btn.dataset.inc ? cur + 1 : cur - 1;
    btn.disabled = true;
    try { await setCartQty(v.id, next, btn); if (next > cur) toast('Added to cart', 'success'); } catch (err) { toast(err.message, 'error'); }
    paint();
  };
  $('#wishBtn').onclick = async e => { await toggleWishlist(e.currentTarget); e.currentTarget.textContent = e.currentTarget.getAttribute('aria-pressed') === 'true' ? '♥ Wishlisted' : '♡ Wishlist'; };
  $('#zoomEm').onclick = e => e.currentTarget.classList.toggle('zoom');

  const openTab = t => { $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); $('#tab-desc').hidden = t !== 'desc'; $('#tab-reviews').hidden = t !== 'reviews'; if (t === 'reviews') loadReviews(1); };
  $$('[data-tab]').forEach(b => (b.onclick = () => openTab(b.dataset.tab)));
  $('#toReviews')?.addEventListener('click', e => { e.preventDefault(); openTab('reviews'); $('.tabs').scrollIntoView({ behavior: 'smooth' }); });
  const loadReviews = async page => {
    const r = await api('GET', `/api/products/${p.id}/reviews?page=${page}&sort=${$('#revSort').value}`);
    if (!$('#revList')) return; // user already left the page
    $('#revList').innerHTML = r.items.length ? r.items.map(x => `<div class="review" data-testid="review-item"><div><span class="rt ${x.rating <= 2 ? 'low' : ''}">${x.rating} ★</span><b data-testid="review-title">${esc(x.title)}</b></div>
      <p style="margin:8px 0">${esc(x.body)}</p><small class="muted">${esc(x.author)} · ${date(x.createdAt)}</small> ${x.verifiedPurchase ? '<span class="verified">✔ Verified purchase</span>' : ''}</div>`).join('') : '<p class="muted" data-testid="no-reviews">No reviews yet. Be the first!</p>';
    $('#revPager').innerHTML = pager(r.page, r.totalPages, 'review-pagination');
    bindPager($('#revPager'), loadReviews);
  };
  $('#revSort').onchange = () => loadReviews(1);
  $('#writeRev').onclick = () => {
    if (needLogin('Log in to write a review')) return;
    modal({
      title: `Review ${esc(p.name)}`, testid: 'review-modal',
      body: `<form id="revForm" novalidate><div class="form-error-slot"></div>
        <div class="field"><span style="font-weight:600;font-size:.85rem">Your rating</span><div class="star-input" role="radiogroup" aria-label="Rating" data-testid="review-rating">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="st${n}" value="${n}"><label for="st${n}" title="${n} stars" data-testid="star-${n}">★</label>`).join('')}</div><span class="err" data-err="rating" data-testid="error-rating"></span></div>
        <div class="field"><label for="f-title">Title</label><input id="f-title" name="title" maxlength="80" data-testid="input-review-title"><span class="err" data-err="title" data-testid="error-title"></span></div>
        <div class="field"><label for="f-body">Your review</label><textarea id="f-body" name="body" rows="4" maxlength="1000" data-testid="input-review-body"></textarea><small class="muted"><span id="cc">0</span>/1000</small><span class="err" data-err="body" data-testid="error-body"></span></div></form>`,
      footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="revSubmit" data-testid="review-submit">Submit review</button>',
      onOpen: (back, close) => {
        const f = $('#revForm', back);
        f.elements.body.oninput = () => ($('#cc', back).textContent = f.elements.body.value.length);
        $('#revSubmit', back).onclick = async () => {
          try {
            await api('POST', `/api/products/${p.id}/reviews`, { rating: Number(f.elements.rating.value || 0), title: f.elements.title.value, body: f.elements.body.value });
            close(); toast('Thanks for your review!', 'success'); refreshView();
          } catch (err) { $('.form-error-slot', f).innerHTML = `<div class="form-error" data-testid="review-error">${esc(err.message)}</div>`; showFieldErrors(f, err.details); }
        };
      },
    });
  };
  if (params.get('tab') === 'reviews') openTab('reviews');
  api('GET', `/api/products/${p.id}/similar`).then(list => { const el = $('#similar'); if (!el) return; el.innerHTML = list.map(productCard).join(''); bindProductGrid(el, () => list); });
};

// ---------------------------------------------------------------- wishlist
views.wishlist = async () => {
  if (needLogin('Log in to see your wishlist')) return;
  const list = await api('GET', '/api/wishlist');
  app().innerHTML = `<div class="view" data-testid="page-wishlist"><h1>My wishlist <small class="muted" style="font-size:1rem" data-testid="wishlist-count">(${list.length})</small></h1>
    ${list.length ? `<div class="grid-products" id="wl" data-testid="wishlist-items">${list.map(productCard).join('')}</div>` : emptyState('♡', 'Your wishlist is empty', 'Tap the heart on any product to save it for later.', '<a class="btn" href="#/shop">Browse products</a>', 'wishlist-empty')}</div>`;
  if (list.length) { bindProductGrid($('#wl'), () => list); $('#wl').addEventListener('click', e => { if (e.target.closest('[data-wish]')) setTimeout(() => location.hash.startsWith('#/wishlist') && refreshView(), 500); }); }
};
