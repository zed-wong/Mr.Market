import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },  // iPhone 14 Pro
});

test.beforeEach(async ({ page }) => {
  await page.route('**/grow/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        market_making: {
          exchanges: [
            { exchange_id: 'binance', name: 'Binance', enable: true },
          ],
          pairs: [
            {
              id: 'pair-1',
              symbol: 'BTC/USDT',
              exchange_id: 'binance',
              base_price: '100000',
              target_price: '1',
              enable: true,
            },
          ],
        },
      }),
    });
  });

  await page.route('**/fees/market-making/fee**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base_asset_id: 'btc-id',
        quote_asset_id: 'usdt-id',
        base_fee_id: 'fee-btc',
        quote_fee_id: 'fee-usdt',
        base_fee_amount: '0.0001',
        quote_fee_amount: '1',
        direction: 'deposit_to_exchange',
      }),
    });
  });

  await page.goto('/market-making/create-new');
});

test('create market making', async ({ page }) => {
  const exchangeOptions = page.locator('[data-testid="market-making-exchange-binance"]');

  await expect(exchangeOptions.first()).toBeVisible();
  await exchangeOptions.first().click();
  await page.getByTestId('market-making-continue').click();

  const pairOptions = page.locator('[data-testid^="market-making-pair-"]');
  await expect(pairOptions.first()).toBeVisible();
  await pairOptions.first().click();
  await page.getByTestId('market-making-pair-confirm').click();

  await expect(page.getByTestId('amount-input-0')).toBeVisible();
  await expect(page.getByTestId('amount-input-1')).toBeVisible();
  await expect(page.getByTestId('amount-balance-connect-0')).toBeVisible();
  await expect(page.getByTestId('amount-balance-connect-1')).toBeVisible();

  await page.getByTestId('amount-input-0').fill('0.00000001');
  await page.getByTestId('amount-input-1').fill('0.00000001');
  await expect(page.getByTestId('market-making-next-step')).toBeEnabled();
  await page.getByTestId('market-making-next-step').click();

  await expect(page.getByTestId('market-making-pay')).toBeVisible();
});
