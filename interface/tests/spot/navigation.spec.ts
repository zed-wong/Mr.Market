import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.goto('/spot');
})

test('open/close pair selector', async ({ page }) => {
  const pairDialog = page.locator('#select_pair_modal');

  await expect(pairDialog).not.toHaveClass(/modal-open/);
  // Open
  await page.getByTestId('spot_pair_selector').click();
  await expect(pairDialog).toHaveClass(/modal-open/);

  // Close
  await page.locator('#select_pair_modal form.modal-backdrop button').last().click();
  await expect(pairDialog).not.toHaveClass(/modal-open/);
});

test('goto candlestick', async ({ page }) => {
  await page.locator('.sticky > div > div > button').first().click();
  await page.waitForURL('**/market/candle/**');
});
