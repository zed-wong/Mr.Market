import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.setTimeout(15000);

test.beforeEach(async ({ page }) => {
  await page.goto('/wallet');
})

test('connect wallet', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Connect Wallet' })).toBeVisible();
})
