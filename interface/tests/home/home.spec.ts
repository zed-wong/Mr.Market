import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.setTimeout(15000);

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/spot');
})

test('bottom navigation', async ({ page }) => {
  await page.getByTestId('bottom-nav-home').click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 10000 });
  await page.getByTestId('bottom-nav-market').click();
  await expect(page).toHaveURL(/\/market\//, { timeout: 10000 });
  await page.getByTestId('bottom-nav-market-making').click();
  await expect(page).toHaveURL(/\/market-making$/, { timeout: 10000 });
  await page.getByTestId('bottom-nav-wallet').click();
  await expect(page).toHaveURL(/\/wallet$/, { timeout: 10000 });
})
