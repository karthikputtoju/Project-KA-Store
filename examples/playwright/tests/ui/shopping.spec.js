const { test, expect } = require('@playwright/test');
const { ShopPage, CartPage, CheckoutPage, apiLogin } = require('../../pages/pages');

test.describe('Shopping journey (UI)', () => {
  let csrf;
  test.beforeEach(async ({ page }) => {
    ({ csrfToken: csrf } = await apiLogin(page));   // fast login via API (cookie shared with the page)
    // Cookie sessions need the CSRF header on writes — without it the server answers 403
    const r = await page.request.delete('/api/cart', { headers: { 'X-CSRF-Token': csrf } });
    expect(r.ok()).toBeTruthy();                    // start from an empty cart
  });

  test('guest is redirected to login when adding to cart', async ({ browser }) => {
    const guest = await browser.newPage();
    await guest.goto('/#/shop?category=dairy-bakery');
    await guest.locator('[data-add]').first().click();
    await expect(guest.getByTestId('page-login')).toBeVisible();
    await guest.close();
  });

  test('search, add to cart, apply coupon and place an order with UPI', async ({ page }) => {
    await page.goto('/');
    const shop = new ShopPage(page);
    await shop.search('banana');
    await expect(page.getByTestId('result-count')).toContainText('for “banana”');
    await shop.add('Banana Robusta');
    await shop.increase('Banana Robusta');
    await expect(shop.cartCount()).toHaveText('2');

    const cart = new CartPage(page);
    await cart.goto();
    await cart.applyCoupon('FRESH20');
    await expect(page.getByTestId('coupon-applied')).toContainText('FRESH20');
    await expect(page.getByTestId('summary-discount')).toHaveText('−₹19.20');
    await cart.checkout();

    const co = new CheckoutPage(page);
    await co.chooseFirstAvailableSlot();
    await co.payWithUpi('success@kaupi');
    await co.placeOrder();
    await expect(page.getByTestId('order-success')).toBeVisible();
    await expect(page.getByTestId('order-number')).toHaveText(/^KA\d{8}-\d+$/);
    await expect(page.getByTestId('payment-status')).toHaveText('paid');
  });

  test('declined card shows an error and keeps the cart', async ({ page }) => {
    await page.request.post('/api/cart/items', { data: { variantId: 1, qty: 1 }, headers: { 'X-CSRF-Token': csrf } });
    await page.goto('/#/checkout');
    const co = new CheckoutPage(page);
    await co.chooseFirstAvailableSlot();
    await co.payWithCard('4000 0000 0000 0002');
    await co.placeOrder();
    await expect(co.error()).toHaveText('Your card was declined');
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  test('filters: vegetarian + max price + sort by price', async ({ page }) => {
    await page.goto('/#/shop?category=snacks');
    // Each filter re-renders the page. Wait for each one to apply before the next step,
    // otherwise you type into an element that is about to be replaced (a classic flaky test).
    await page.getByTestId('filter-veg').check();
    await expect(page.getByTestId('active-filter-veg')).toBeVisible();
    await page.getByTestId('filter-max-price').fill('60');
    await page.getByTestId('filter-price-apply').click();
    await expect(page.getByTestId('active-filter-maxPrice')).toBeVisible();
    await page.getByTestId('sort-select').selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page.getByTestId('result-count')).not.toHaveText('Loading…');
    const prices = await page.getByTestId('product-price').locator('b').allInnerTexts();
    const nums = prices.map(p => Number(p.replace(/[₹,]/g, '')));
    expect(nums.length).toBeGreaterThan(0);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(nums.every(n => n <= 60)).toBeTruthy();
  });

  test('wishlist add and remove', async ({ page }) => {
    await page.goto('/#/product/2');
    const btn = page.getByTestId('pdp-wishlist');
    if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/#/wishlist');
    await expect(page.getByTestId('product-name').getByText('Apple Shimla')).toBeVisible();
  });

  test('a brand-new customer adds their first address at checkout and pays (regression)', async ({ browser }) => {
    // Regression test: "Add new address" used to crash for customers without any saved address,
    // so new users could never pay.
    const page = await browser.newPage();
    const email = `newbuyer${Date.now()}@example.com`;
    await page.goto('/#/register');
    await page.getByTestId('input-name').fill('New Buyer');
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-phone').fill('9876512345');
    await page.getByTestId('input-password').fill('Secret@123');
    await page.getByTestId('input-confirmPassword').fill('Secret@123');
    await page.getByTestId('input-acceptTerms').check();
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('user-name')).toHaveText('New');

    await page.goto('/#/product/21');
    await page.getByTestId('pdp-add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
    await page.goto('/#/checkout');
    await expect(page.getByTestId('address-option')).toHaveCount(0);

    await page.getByTestId('add-new-address').click();
    const modal = page.getByTestId('address-modal');
    await modal.getByTestId('input-line1').fill('Flat 12, Lake View');
    await modal.getByTestId('input-city').fill('Hyderabad');
    await modal.getByTestId('input-state').selectOption('Telangana');
    await modal.getByTestId('input-pincode').fill('500081');
    await modal.getByTestId('address-save').click();
    await expect(page.getByTestId('address-option')).toHaveCount(1);

    // the earliest open slot is pre-selected
    await expect(page.locator('[data-testid="slot-list"] input:checked')).toHaveCount(1);
    await page.getByTestId('pay-upi').check();
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('order-success')).toBeVisible();
    await expect(page.getByTestId('payment-status')).toHaveText('paid');
    await page.close();
  });
});
