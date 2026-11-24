# 🛒 KarthikAutomation Practice Store

> **A realistic daily-needs supermarket built for automation learning.** Practise UI, API, database and performance testing on one real application.
> Product designed by **Karthik Puttoju**. For learning only: no real products, payments or deliveries.

You can register, log in, search groceries, add pack sizes to your cart, apply coupons, pick a delivery slot, and pay by UPI, card or cash on delivery. After that you can track, cancel, return and reorder orders. Store managers get a full admin panel.

All of it runs on your laptop with **zero npm dependencies**, backed by a **real SQLite database**.

---

## 1. Start it (2 minutes)

**You need Node.js 22.13 or newer** (`node --version`). It uses Node's built-in SQLite module.

```bash
cd ka-store
npm start
```

Open **http://localhost:3000**. The database file `data/store.db` is created and seeded automatically on first start.

| Command | What it does |
|---|---|
| `npm start` | Start the store on port 3000 (`PORT=8080 npm start` to change it) |
| `npm run dev` | Start and auto-restart when you edit server code |
| `npm run reset-db` | Re-create the database from seed data (stop the server first) |
| `npm test` | Run the 46 built-in API + DB tests (uses a temporary database) |
| `QUIET=1 npm start` | Start without request logs (use this for load tests) |

Docker: `docker run -d -p 3000:3000 -v ka-data:/app/data pkarthik9/karthikautomation-store:latest`

## 2. Practice accounts & test data

| Who | Email | Password |
|---|---|---|
| Customer | `demo@karthikautomation.test` | `Passw0rd!` |
| Admin | `admin@karthikautomation.test` | `Admin@123` |
| 50 load-test users | `user1@…` to `user50@karthikautomation.test` | `Passw0rd!` |
| Disabled account (negative tests) | `locked@karthikautomation.test` | `Passw0rd!` |

| Payments | Result |
|---|---|
| UPI `success@kaupi` | Paid |
| UPI `failure@kaupi` | 402 declined |
| UPI `timeout@kaupi` | 504 timeout |
| Card `4111 1111 1111 1111` | Paid |
| Card `4000 0000 0000 0002` | 402 declined |
| Card `4000 0000 0000 9995` | 402 insufficient funds |
| Card `4000 0000 0000 0119` | 502 gateway error |
| Cash on delivery | Allowed only up to ₹3,000 |

| Coupons | Rule |
|---|---|
| `WELCOME50` | ₹50 off, first order only, minimum ₹199 |
| `SAVE10` | 10% off up to ₹100, minimum ₹299 |
| `FRESH20` | 20% off **Fruits & Vegetables items only**, max ₹150 |
| `FREEDEL` | Free delivery |
| `EXPIRED25` | Expired → 410 |

**Business rules to test:**
- Max 10 units per item.
- Free delivery from ₹499 (otherwise ₹30).
- A delivery slot closes 60 minutes before it starts, and each slot holds 20 orders.
- Cancel only before "out for delivery".
- Return within 7 days of delivery.
- Up to 5 saved addresses.
- Indian mobile number (10 digits starting 6–9) and 6-digit PIN code.
- Passwords need upper and lower case, a number and a symbol.
- 5 wrong logins per minute → 429.
- Sessions last 2 hours, or 7 days with "Remember me".

## 3. What's inside

| Area | Where | Highlights |
|---|---|---|
| Store | `/#/` | Carousel, 8 categories, 55 products, 77 pack-size variants, search suggestions, filters (brand, price, veg, discount, rating), sorting, pagination, wishlist, reviews |
| Checkout | `/#/checkout` | Saved addresses, delivery-slot picker, UPI/card/COD, coupon engine, idempotency |
| Orders | `/#/orders` | Status filters, tracking timeline, cancel, return, reorder, invoice download |
| Account | `/#/account/profile` | Profile, addresses CRUD, change password, active sessions, log out everywhere |
| Auth | `/#/login` | Register (strength meter), login, remember me, forgot password with 6-digit OTP |
| Admin | `/#/admin` (admin login) | Dashboard KPIs and charts, product CRUD, stock/price edits, order status workflow, returns, users, audit log |
| Practice | `/#/practice` | 15 pages: forms, alerts, iframes, tabs, upload/download, drag & drop, web tables, waits, infinite scroll, mouse/keyboard, date pickers, shadow DOM, broken links, storage, API playground |
| Test mailbox | `/#/mailbox` | Every email the store "sends" (welcome, OTP, order updates) |
| DB explorer | `/#/db` | Browse tables and run read-only SQL in the browser |
| API docs | `/#/api-docs` | All 80+ endpoints, OpenAPI spec, Postman collection |
| **Coverage** (header) | `/#/coverage` | Full testing life cycle: STLC, coverage matrix (manual, automation, security, API, performance, AI), test plan, 8 business cases, 22 scenarios, 60 test cases (CSV download), test data, bug reporting with 6 reproducible sample bugs, traceability matrix |
| Performance testing | `/#/performance` | Live metrics, chaos controls (latency, errors, CPU cost), performance bugs, quick browser load test, test-type guide |
| Security testing | `/#/security` | 3 vulnerability switches, security-headers check, JWT decoder, OWASP Top 10 mapped to the store, checklist |

## 4. Test examples included

| Folder | Tool | Status |
|---|---|---|
| `tests/api/` | Node test runner: 46 API + DB tests | ✅ All passing (`npm test`) |
| `examples/playwright/` | Playwright: UI (auth, shopping, practice), API and DB tests with page objects | ✅ 29/29 passing |
| `examples/cypress/` | Cypress: UI, API (`cy.request`), network stubbing, DB via `cy.task` | Written, not yet run on a machine |
| `examples/selenium-python/` | Selenium 4 + pytest: login, shadow DOM, iframe | Written, not yet run on a machine |
| `examples/neoload/` | NeoLoad as Code YAML: correlation, populations, SLA, 4 scenarios | Starter: check the keys against your NeoLoad version |
| `examples/k6/` | k6 load test with thresholds | Written, not yet run on a machine |
| `examples/postman/` | Postman collection (82 requests, auto-saves the token) | Generated from the live API |

Run Playwright:
```bash
cd examples/playwright && npm install && npx playwright install chromium
npx playwright test            # with the store running in another terminal
npx playwright show-report
```

Run Cypress:
```bash
cd examples/cypress && npm install && npx cypress open
```

## 5. The database (for DB testing)

The file is `data/store.db` (SQLite). Open it with **DB Browser for SQLite**, **DBeaver**, the VS Code *SQLite Viewer* extension, or `sqlite3 data/store.db`.

Tables:
- users, sessions, password_resets, addresses
- categories, products, variants
- reviews, wishlist, carts, cart_items, coupons
- delivery_slots, orders, order_items, order_events, returns
- emails, audit_log

Sample queries are on the `/#/db` page and in `TESTING.md`.

## 6. Project structure

```
ka-store/
├── src/server.js              HTTP server, routing, auth, CSRF, chaos, static files
├── src/db/                    schema, seed data, helpers (node:sqlite)
├── src/routes/                auth, account, catalog, cart, orders, admin, practice, dev
├── public/                    front end (vanilla JS modules, no build step)
├── tests/api/                 built-in API + DB test suite
├── examples/                  playwright · cypress · selenium-python · neoload · k6 · postman
├── test-data/                 CSV files for data-driven and load tests
├── TESTING.md                 learning guide: every testing type with exercises
└── data/store.db              created on first start (git-ignored)
```

---
*KarthikAutomation Practice Store · Product designed by Karthik Puttoju · For automation learning only.*
