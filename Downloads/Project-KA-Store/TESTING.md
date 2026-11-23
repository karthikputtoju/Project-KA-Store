# 🧪 Testing guide: learn every testing type on one app

This guide is for students and working testers. Each section explains a testing type in one line, then gives **exercises on this store**. ✅ marks the core exercises; 🔥 marks stretch goals.

Reset everything at any time with the **Reset database & settings** button (on the Performance, Security and Coverage → Bug reporting pages), or `POST /api/lab/reset`.

> The **Coverage** page in the header (`/#/coverage`) holds the full test plan, business cases, scenarios, 60 test cases (CSV download), test data, bug-report samples and the traceability matrix. This guide is the short version.

---

## Part A: Functional testing

### 1. Smoke & sanity
*Is the build healthy enough to test?*
- ✅ `GET /api/health` returns `status: UP` and `database: UP`.
- ✅ Home loads 8 categories, you can log in, and one item can be added to the cart.

### 2. UI / end-to-end (Cypress, Playwright, Selenium, Tosca…)
Locate elements with `data-testid`. Every interactive element has one.
- ✅ **Register → login → search → add 2 pack sizes → coupon → checkout → order confirmation.**
- ✅ Guest clicks ADD → redirected to login → after login, returned to the same page (`?next=`).
- ✅ Filters: brand + veg-only + price range + sort, and assert every card matches.
- ✅ Order lifecycle: place an order as the customer. As the admin, move it placed → confirmed → packed → out for delivery → delivered. As the customer, request a return. As the admin, approve it.
- ✅ Forgot password: read the OTP from the **test mailbox** (UI `/#/mailbox` or API `/api/dev/mailbox?email=`).
- 🔥 Run the same suite at 1400 px and 390 px wide (responsive testing).

### 3. Practice playground (`/#/practice`)
15 pages of tricky patterns: iframes (single and nested), browser dialogs, new tabs and pop-ups, upload (single, multiple, drag & drop), download, drag & drop, sortable lists, server-side web tables, waits (delayed, enabled-later, disappearing, dynamic IDs, slow API, progress bar, flaky API), infinite scroll, double/right click, hover menus, tooltips, key presses, sliders, long press, scroll-into-view, native and custom date pickers, open shadow DOM (nested too), broken images and links, cookies/localStorage/sessionStorage, and an API playground.

### 4. Test design techniques
| Technique | Try it on |
|---|---|
| **Boundary values** | Qty 0/1/10/11 · `pageSize` 48/49 · free delivery at ₹498 vs ₹499 · password 7 vs 8 chars · PIN 5/6/7 digits · COD at ₹3,000 vs ₹3,000.01 · review title 2/3/80/81 chars |
| **Equivalence classes** | Payment outcomes (success / declined / no funds / gateway / timeout) · coupon types (flat, %, category, free delivery, expired) |
| **Decision tables** | Coupon × cart (min order met? first order? right category?) |
| **State transitions** | Order statuses (see the admin "Move to…" options; invalid moves → 409) · slot open/closed/full |
| **Error guessing** | Unicode names, `<script>` in the review title, very long inputs, double-clicking "Place order", using the back button after checkout |

### 5. Data-driven testing
Loop the same test over `test-data/cards.csv` (each row has its expected status), `search-terms.csv` and `users.csv`.

### 6. Regression testing & bug hunting 🐞
Ask a friend to switch on **one** bug without telling you which, then run your suite. Functional/DB bugs are on **Coverage → Bug reporting**, performance bugs on **Performance testing**, security bugs on **Security testing**.

| Bug switch | Symptom | Best caught by |
|---|---|---|
| `discountOnMrp` | Percentage coupons give too much discount | Cart total assertion |
| `caseSensitiveSearch` | "milk" no longer finds "Toned Milk" | Data-driven search test |
| `stockNotRestoredOnCancel` | Stock stays reduced after a cancel | **DB check** on `variants.stock` |
| `couponMinIgnored` | SAVE10 works on a ₹48 cart | Coupon negative test |
| `wishlistDuplicates` | Same product saved twice | **SQL**: `GROUP BY user_id, product_id HAVING COUNT(*) > 1` |
| `slotOverbooking` | More than 20 orders in a slot | Concurrency / load test |
| `memoryLeak` | Heap keeps growing | Soak test + `/api/metrics` |
| `unsafeSearchEcho` | Search text rendered as HTML | Security test |
| `idorOrders` | Users can open other users' orders | Access-control test (2 users) |
| `noLoginRateLimit` | Unlimited password guesses | Brute-force test (expect 429) |

---

## Part B: API testing (Postman, REST Assured, Playwright `request`, `cy.request`, Karate…)

- Import `examples/postman/karthikautomation.postman_collection.json`, or download it live from `/api/postman.json`. The OpenAPI spec is at `/api/openapi.json`.
- **Auth:** `POST /api/auth/login`, then send `Authorization: Bearer <accessToken>`. Decode the JWT on jwt.io.
- ✅ CRUD chain: create an address → update it → set as default → delete it → GET returns 404.
- ✅ Validation: send an empty body to `/api/auth/register` and assert all 6 field errors.
- ✅ Status codes you can reach: 200 201 204 302 400 401 402 403 404 405 409 410 413 415 422 429 502 503 504.
- ✅ Schema / JSONPath: `/api/practice/graph` has nested objects, arrays, nulls and empty lists.
- ✅ Idempotency: send `POST /api/checkout` twice with the same `Idempotency-Key`. You should get one order and `replayed: true`.
- ✅ Headers: `X-Request-Id` comes back on every response. Errors carry the same id.
- ✅ Practice auth types: Basic (`/api/practice/basic-auth`, admin/admin), API key (`X-API-Key: ka-practice-key`), Bearer JWT, and cookie + CSRF.
- 🔥 Contract test the OpenAPI spec against real responses.

## Part C: Database testing (SQL)

The database is `data/store.db` (SQLite). Use the `/#/db` page, DB Browser for SQLite, DBeaver, or code (`node:sqlite`, Python `sqlite3`, Java JDBC `org.xerial:sqlite-jdbc`).

```sql
-- 1. The order you just placed, with its items
SELECT o.order_no, o.status, o.total, oi.product_name, oi.qty, oi.line_total
FROM orders o JOIN order_items oi ON oi.order_id = o.id
WHERE o.order_no = 'KA20261122-10061';

-- 2. Integrity: order subtotal must equal the sum of its lines
SELECT o.order_no FROM orders o JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id HAVING ABS(o.subtotal - SUM(oi.line_total)) > 0.01;

-- 3. Stock never negative, price never above MRP
SELECT * FROM variants WHERE stock < 0 OR price > mrp;

-- 4. Passwords are hashed (should return 0 rows)
SELECT email FROM users WHERE password_hash = 'Passw0rd!';

-- 5. Orphans: order items whose order does not exist
SELECT * FROM order_items WHERE order_id NOT IN (SELECT id FROM orders);

-- 6. Who changed what (audit trail)
SELECT a.created_at, u.email, a.action, a.entity, a.entity_id FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 20;
```
- ✅ UI → DB: place an order in the UI, then assert the `orders`, `order_items`, `variants.stock` and `delivery_slots.booked` rows.
- ✅ DB → UI: an admin changes a price in the admin panel. Assert `variants.price` in the DB, then on the product page.
- ✅ Run the 8 integrity queries after a load test.

## Part D: Performance testing (NeoLoad, JMeter, k6, Gatling, Locust)

Run with `QUIET=1 npm start`. Watch the **Performance testing** page (`/#/performance`, it also has a quick browser load test), `/api/metrics`, or Prometheus `/metrics`.

| Skill | Where |
|---|---|
| **Correlation** | `accessToken` from login → `Authorization` header · `csrfToken` → `X-CSRF-Token` (browser recordings) · `addressId` · `slotId` · `orderNo` |
| **Parameterisation** | `users.csv` (50 users), `variants.csv`, `search-terms.csv` |
| **Assertions** | `"total":` in search, `orderNo` in checkout, no `"error"` |
| **Think time & pacing** | 2–5 s between steps |

| Test type | How to run it here | What to look for |
|---|---|---|
| Load | Ramp 5 → 50 users (`examples/neoload`, `examples/k6`) | SLA: avg < 800 ms, errors < 1% |
| Stress | Performance page: set Search CPU cost to 3,000,000, then ramp until it fails | Search latency grows first. That's the bottleneck |
| Spike | `S3_Spike` scenario | Recovery time |
| Soak | Performance page: `memoryLeak` ON, 20 users for 1–2 h | `memoryMB.heapUsed` keeps rising |
| Concurrency | 30 users book the same slot at once | Max 20 orders per slot (try again with `slotOverbooking` ON) |
| Volume | Create thousands of orders, then load `/api/orders` and `/api/admin/orders` | Response time against data size |
| Resilience | Performance page: errorRate 0.2, latency 1500 ms | Graceful errors, retries, no duplicate orders |

## Part E: Security testing (only on your local copy)
The **Security testing** page (`/#/security`) has vulnerability switches, a security-headers check, a JWT decoder and the OWASP Top 10 mapped to this store.
- ✅ IDOR: user A requests user B's `/api/orders/{orderNo}` → 404.
- ✅ Role check: a customer token on `/api/admin/*` → 403. The admin page in the UI shows "403 – Admins only".
- ✅ CSRF: a cookie session write without `X-CSRF-Token` → 403.
- ✅ Brute force: the 6th wrong password → 429 + `Retry-After`. Reset-password OTP locks after 5 wrong tries.
- ✅ User enumeration: forgot-password answers the same for known and unknown emails.
- ✅ JWT: tamper with the payload → 401. 🔥 The secret is public (`karthikautomation-practice-secret`). Forge an admin token. Why does it still fail? (Hint: the session row is checked too.)
- ✅ XSS: put `<img src=x onerror=alert(1)>` in a review → it shows as text. Switch on `unsafeSearchEcho` and search it. The HTML is injected, but CSP blocks the script.
- ✅ Headers: CSP, `X-Frame-Options`, `nosniff`, and an `HttpOnly` + `SameSite` session cookie.
- 🔥 OWASP ZAP baseline scan against `http://localhost:3000`.

## Part F: Accessibility, usability & compatibility
- ✅ Keyboard only: Tab from the top. The first stop is "Skip to content". The search suggestions work with ↑ ↓ Enter Esc. Modals close with Esc.
- ✅ Lighthouse / axe on Home, Product, Checkout and Admin.
- ✅ OS "reduce motion" switches animations off.
- ✅ Cross-browser: Chrome, Firefox, Safari, Edge. Mobile emulation (iPhone, Pixel).

---
### Suggested 6-week plan
1. Manual exploration, test cases and bug reports
2. UI automation basics (Playwright or Cypress) and page objects
3. Practice playground: every tricky pattern
4. API testing (Postman → code) and data-driven tests
5. Database checks and seeded-bug regression
6. Performance with NeoLoad / k6, plus security and accessibility basics
