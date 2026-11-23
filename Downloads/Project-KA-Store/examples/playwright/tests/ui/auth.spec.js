const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../pages/pages');

test.describe('Authentication (UI)', () => {
  test('customer can log in and log out', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('demo@karthikautomation.test', 'Passw0rd!');
    await expect(page.getByTestId('user-name')).toHaveText('Demo');
    await page.getByTestId('account-menu').click();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('nav-login')).toBeVisible();
  });

  test('wrong password shows an error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('demo@karthikautomation.test', 'wrong-password');
    await expect(login.error()).toHaveText('Invalid email or password');
  });

  test('disabled account cannot log in', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('locked@karthikautomation.test', 'Passw0rd!');
    await expect(login.error()).toContainText('disabled');
  });

  test('registration validates fields, then creates an account', async ({ page }) => {
    await page.goto('/#/register');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('error-acceptTerms')).toHaveText('You must accept the terms');

    const email = `student${Date.now()}@example.com`;
    await page.getByTestId('input-name').fill('Playwright Student');
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-phone').fill('9876512345');
    await page.getByTestId('input-password').fill('Secret@123');
    await expect(page.getByTestId('password-strength')).toHaveText('Strong');
    await page.getByTestId('input-confirmPassword').fill('Secret@123');
    await page.getByTestId('input-acceptTerms').check();
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('user-name')).toHaveText('Playwright');

    // the welcome email is visible in the test mailbox
    await page.goto('/#/mailbox?email=' + encodeURIComponent(email));
    await expect(page.getByTestId('mail-subject').first()).toHaveText('Welcome to KarthikAutomation Store');
  });

  test('forgot password with OTP from the mailbox API', async ({ page, request }) => {
    const email = 'user20@karthikautomation.test';
    await page.goto('/#/forgot-password');
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('send-otp').click();
    await expect(page.getByTestId('otp-inputs')).toBeVisible();

    const mails = await (await request.get('/api/dev/mailbox?email=' + email)).json();
    const otp = mails[0].body.match(/\b(\d{6})\b/)[1];
    for (let i = 0; i < 6; i++) await page.getByTestId(`otp-${i + 1}`).fill(otp[i]);
    await page.getByTestId('input-newPassword').fill('Changed@123');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('page-login')).toBeVisible();

    await new LoginPage(page).login(email, 'Changed@123');
    await expect(page.getByTestId('user-name')).toBeVisible();
  });
});
