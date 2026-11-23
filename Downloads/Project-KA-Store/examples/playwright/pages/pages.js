// Page Object Model for the store. Locators use data-testid (configured as testIdAttribute).
const { expect } = require('@playwright/test');

class LoginPage {
  constructor(page) { this.page = page; }
  async goto() { await this.page.goto('/#/login'); }
  async login(email, password) {
    await this.page.getByTestId('input-email').fill(email);
    await this.page.getByTestId('input-password').fill(password);
    await this.page.getByTestId('login-submit').click();
  }
  error() { return this.page.getByTestId('login-error'); }
}

class ShopPage {
  constructor(page) { this.page = page; }
  async search(term) {
    await this.page.getByTestId('search-input').fill(term);
    await this.page.getByTestId('search-submit').click();
    await expect(this.page.getByTestId('page-shop')).toBeVisible();
  }
  card(name) { return this.page.getByTestId('product-card').filter({ has: this.page.getByTestId('product-name').getByText(name, { exact: true }) }); }
  async add(name) { await this.card(name).getByTestId('add-to-cart').click(); await expect(this.card(name).getByTestId('qty-value')).toHaveText('1'); }
  async increase(name) { await this.card(name).getByTestId('qty-increase').click(); }
  cartCount() { return this.page.getByTestId('cart-count'); }
}

class CartPage {
  constructor(page) { this.page = page; }
  async goto() { await this.page.goto('/#/cart'); await expect(this.page.getByTestId('page-cart')).toBeVisible(); }
  async applyCoupon(code) { await this.page.getByTestId('coupon-input').fill(code); await this.page.getByTestId('coupon-apply').click(); }
  total() { return this.page.getByTestId('summary-total'); }
  async checkout() { await this.page.getByTestId('checkout-button').click(); await expect(this.page.getByTestId('page-checkout')).toBeVisible(); }
}

class CheckoutPage {
  constructor(page) { this.page = page; }
  async chooseFirstAvailableSlot() {
    // Today's slots may already be closed — pick tomorrow's first open slot
    await this.page.locator('[data-testid^="slot-day-"]').nth(1).click();
    await this.page.locator('[data-testid="slot-list"] label:not(:has(input:disabled))').first().click();
  }
  async payWithUpi(upi = 'success@kaupi') { await this.page.getByTestId('pay-upi').check(); await this.page.getByTestId('input-upiId').fill(upi); }
  async payWithCard(number, expiry = '12/30', cvv = '123') {
    await this.page.getByTestId('pay-card').check();
    await this.page.getByTestId('input-cardNumber').fill(number);
    await this.page.getByTestId('input-cardExpiry').fill(expiry);
    await this.page.getByTestId('input-cardCvv').fill(cvv);
  }
  async placeOrder() { await this.page.getByTestId('place-order').click(); }
  error() { return this.page.getByTestId('checkout-error'); }
}

/** Fast login through the API: the session cookie is stored in the browser context. */
async function apiLogin(page, email = 'demo@karthikautomation.test', password = 'Passw0rd!') {
  const r = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(r.ok()).toBeTruthy();
  return r.json();
}

module.exports = { LoginPage, ShopPage, CartPage, CheckoutPage, apiLogin };
