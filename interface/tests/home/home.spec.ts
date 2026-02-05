import { test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/spot');
})

test('bottom navigation', async ({ page }) => {
  await page.getByTestId('bottom-nav-home').click();
  await page.waitForURL('**/home');
  await page.getByTestId('bottom-nav-market').click();
  await page.waitForURL('**/market/**');
  await page.getByTestId('bottom-nav-market-making').click();
  await page.waitForURL('**/market-making');
  await page.getByTestId('bottom-nav-wallet').click();
  await page.waitForURL('**/wallet');
})
