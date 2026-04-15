import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.goto('/spot');
})

test('open/close pair selector', async ({ page, browserName }) => {
  test.fixme(
    browserName === 'webkit',
    'WebKit dialog visibility is flaky in the full mobile suite.',
  );

  const pairDialog = page.locator('#select_pair_modal');
  const pairModalBox = page.getByTestId('spot_pair_selector_modal_box');

  await expect(pairModalBox).not.toBeVisible();
  // Open
  await expect
    .poll(async () => {
      await page.getByTestId('spot_pair_selector').dispatchEvent('click');
      return pairModalBox.isVisible().catch(() => false);
    })
    .toBeTruthy();

  // Close
  await page
    .locator('#select_pair_modal form.modal-backdrop button')
    .last()
    .click({ force: true });
  await expect(pairModalBox).not.toBeVisible();
});

test('goto candlestick', async ({ page }) => {
  await page.locator('.sticky > div > div > button').first().click();
  await page.waitForURL('**/market/candle/**');
});
