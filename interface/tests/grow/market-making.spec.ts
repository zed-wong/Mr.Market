import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.goto('/market-making/create-new');
});

test('create market making', async ({ page }) => {
  const exchangeOptions = page.locator('[data-testid^="market-making-exchange-"]');
  await expect(exchangeOptions.first()).toBeVisible();
  await exchangeOptions.first().click();
  await page.getByTestId('market-making-exchange-continue').click();

  const pairOptions = page.locator('[data-testid^="market-making-pair-"]');
  await expect(pairOptions.first()).toBeVisible();
  await pairOptions.first().click();
  await page.getByTestId('market-making-pair-confirm').click();

  await expect(page.getByTestId('amount-input-0')).toBeVisible();
  await expect(page.getByTestId('amount-input-1')).toBeVisible();

  await page.getByTestId('amount-input-0').fill('0.00000001');
  await page.getByTestId('amount-input-1').fill('0.00000001');
  await expect(page.getByTestId('market-making-next-step')).toBeEnabled();
  await page.getByTestId('market-making-next-step').click();

  await expect(page.getByTestId('market-making-pay')).toBeVisible();
});
