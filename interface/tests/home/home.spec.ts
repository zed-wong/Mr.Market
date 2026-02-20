import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.goto('/spot');
})

test('bottom navigation', async ({ page }) => {
  await page.getByTestId('bottom-nav-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId('bottom-nav-market').click();
  await expect(page).toHaveURL(/\/market\//);
  await page.getByTestId('bottom-nav-market-making').click();
  await expect(page).toHaveURL(/\/market-making/);
  await page.getByTestId('bottom-nav-wallet').click();
  await expect(page).toHaveURL(/\/wallet$/);
})
