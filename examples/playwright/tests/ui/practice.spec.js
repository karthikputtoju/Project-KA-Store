const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.describe('Practice playground (UI)', () => {
  test('iframe and nested iframe', async ({ page }) => {
    await page.goto('/#/practice/frames');
    const frame = page.frameLocator('#frame-one');
    await frame.getByTestId('frame-name').fill('Karthik');
    await frame.getByTestId('frame-city').selectOption('Pune');
    await frame.getByTestId('frame-submit').click();
    await expect(page.getByTestId('frame-message')).toContainText('Karthik from Pune');

    const inner = page.frameLocator('#frame-outer').frameLocator('#frame-inner');
    await inner.getByTestId('inner-input').fill('secret');
    await inner.getByTestId('inner-submit').click();
    await expect(inner.getByTestId('inner-output')).toContainText('secret');
  });

  test('alert, confirm and prompt dialogs', async ({ page }) => {
    await page.goto('/#/practice/alerts');
    page.once('dialog', d => d.accept());
    await page.getByTestId('btn-alert').click();
    await expect(page.getByTestId('alert-result')).toHaveText('You closed the alert');

    page.once('dialog', d => d.dismiss());
    await page.getByTestId('btn-confirm').click();
    await expect(page.getByTestId('alert-result')).toHaveText('You clicked Cancel');

    page.once('dialog', d => d.accept('Playwright'));
    await page.getByTestId('btn-prompt').click();
    await expect(page.getByTestId('alert-result')).toHaveText('Hello, Playwright!');
  });

  test('shadow DOM is pierced automatically', async ({ page }) => {
    await page.goto('/#/practice/shadow-dom');
    await page.getByTestId('shadow-input').fill('save10');
    await page.getByTestId('shadow-button').click();
    await expect(page.getByTestId('shadow-message')).toHaveText('Coupon accepted ✅');
    await expect(page.getByTestId('nested-shadow-badge')).toBeVisible();
  });

  test('web table sorts by salary descending', async ({ page }) => {
    await page.goto('/#/practice/tables');
    await page.getByTestId('sort-salary').click();
    await page.getByTestId('sort-salary').click();
    await expect(page.locator('th[data-col="salary"]')).toHaveAttribute('aria-sort', 'descending');
    const salaries = (await page.getByTestId('employee-salary').allInnerTexts()).map(s => Number(s.replace(/[₹,]/g, '')));
    expect(salaries).toEqual([...salaries].sort((a, b) => b - a));
  });

  test('waits for a delayed element', async ({ page }) => {
    await page.goto('/#/practice/dynamic');
    await page.getByTestId('btn-start-delay').click();
    await expect(page.getByTestId('delayed-element')).toBeVisible({ timeout: 8000 });
  });

  test('upload a file and download a CSV', async ({ page }, testInfo) => {
    await page.goto('/#/practice/upload-download');
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello automation') });
    await page.getByTestId('upload-button').click();
    await expect(page.getByTestId('upload-success')).toContainText('notes.txt · 16 bytes');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-sample-csv').click()]);
    expect(download.suggestedFilename()).toBe('sample.csv');
    const file = testInfo.outputPath('sample.csv');
    await download.saveAs(file);
    expect(fs.readFileSync(file, 'utf8')).toContain('Banana Robusta');
  });

  test('new tab opens and can be controlled', async ({ page, context }) => {
    await page.goto('/#/practice/windows');
    const [tab] = await Promise.all([context.waitForEvent('page'), page.getByTestId('link-new-tab').click()]);
    await expect(tab.getByTestId('new-window-title')).toContainText('new tab');
    await tab.close();
  });

  test('drag & drop into the basket', async ({ page }) => {
    await page.goto('/#/practice/drag-drop');
    await page.getByTestId('drag-item-0').dragTo(page.getByTestId('drop-basket'));
    await expect(page.getByTestId('drop-result')).toContainText('Basket: 1 items');
  });
});
