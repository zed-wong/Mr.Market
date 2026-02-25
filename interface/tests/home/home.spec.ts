import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.setTimeout(15000);

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
})

test('bottom navigation', async ({ page }) => {
  await page.getByTestId('bottom-nav-home').click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 10000 });
  await page.getByTestId('bottom-nav-market-making').click();
  await expect(page).toHaveURL(/\/market-making$/, { timeout: 10000 });
  await page.getByTestId('bottom-nav-wallet').click();
  await expect(page).toHaveURL(/\/wallet$/, { timeout: 10000 });
})
