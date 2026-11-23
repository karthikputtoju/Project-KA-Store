# Changelog

## v3.1: bug-fix release

Every fix below was found by testing: a manual exploratory sweep plus the automated suites. Each entry is written like a bug report, so you can study it as a real-world example.

| # | Bug | Severity | Root cause | Fix |
|---|---|---|---|---|
| 1 | **New customers could not pay.** "Add new address" did nothing for anyone with no saved address, so checkout could never be completed. The same crash affected *Account → Addresses → Add address*. | Critical | The address form was opened with `null` instead of an empty object, so reading `a.label` threw a JavaScript error. | Treat `null` as "new address". Regression test added: `shopping.spec.js → a brand-new customer adds their first address at checkout and pays`. |
| 2 | Admin actions sometimes showed the previous list (old filters) while the URL showed the new one. | High | After an action, pages redrew themselves with the filters they were *opened* with, not the current URL. | All post-action redraws now go through `refreshView()`, which redraws the page matching the current URL. Also applied to address book, order cancel/return, reviews, wishlist and reset buttons. |
| 3 | Moving to another page while the previous one was still loading could overwrite the new page with "Something went wrong". | High | Late responses from the old page wrote into the new page. | The router tracks a token per navigation. Stale pages are discarded and the current page is redrawn. Background updates check that their page still exists. |
| 4 | In pop-ups, typing that started right after the pop-up opened could land in the wrong field. | Medium | The first field was focused 30 ms *after* opening, stealing focus from a field already being typed in. | Focus is set immediately when the pop-up opens. |
| 5 | Admin → Add product: the Stock field was empty instead of defaulting to 10. | Low | The input had two `value` attributes; the browser used the first (empty) one. | Default passed correctly. |
| 6 | Infinite scroll sometimes stopped loading new items. | Medium | IntersectionObserver only fires when visibility *changes*; if the loader stayed on screen after a load, nothing triggered the next page. | After each load, keep loading while the loader is still visible. |
| 7 | After login, the user's name appeared before the redirect finished, so an immediate click could be undone by the late redirect. | Low | The redirect waited for the cart to load. | Redirect first, then update the header; the cart loads in the background. |
| 8 | Product page: the main price and rating shared test IDs (`product-price`, `product-rating`) with the "Similar products" cards, so locators matched 7 elements. | Low (testability) | Duplicate `data-testid` values. | Renamed to `pdp-price` and `pdp-rating`. |
| 9 | Checkout did not pre-select a delivery slot, so "Place order" failed with "Select a delivery slot" until the user picked one. | Low (usability) | No default chosen. | The earliest open slot is now pre-selected (you can still change it). |

**Test status after the fixes:**
- 46/46 API + DB tests (`npm test`)
- 29/29 Playwright tests (run twice in a row with no failures)
- 45/45 manual-style exploratory checks across the store, admin, account, practice pages and tools, run 3 times in a row with no failures
