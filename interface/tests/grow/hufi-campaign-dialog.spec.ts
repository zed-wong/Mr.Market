import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
});

const campaignId = 'test-campaign';
const campaignResponse = {
  chain_id: 137,
  address: '0x0000000000000000000000000000000000000001',
  type: 'MARKET_MAKING',
  exchange_name: 'binance',
  symbol: 'BTC/USDT',
  details: {
    daily_volume_target: 120000,
  },
  start_date: '2025-01-01T00:00:00Z',
  end_date: '2025-12-31T00:00:00Z',
  fund_amount: '500000000',
  fund_token: '0x0000000000000000000000000000000000000002',
  fund_token_symbol: 'USDT',
  fund_token_decimals: 6,
  status: 'active',
  escrow_status: 'approved',
  amount_paid: '0',
  daily_paid_amounts: [],
  launcher: '0x0000000000000000000000000000000000000003',
  exchange_oracle: '0x0000000000000000000000000000000000000004',
  recording_oracle: '0x0000000000000000000000000000000000000005',
  reputation_oracle: '0x0000000000000000000000000000000000000006',
  balance: '500000000',
  exchange_oracle_fee_percent: 0,
  recording_oracle_fee_percent: 0,
  reputation_oracle_fee_percent: 0,
  intermediate_results_url: null,
  final_results_url: null,
  reserved_funds: '0',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/campaigns/137-test-campaign', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(campaignResponse),
    });
  });

  await page.goto(`/market-making/hufi/campaign/${campaignId}`);
});

test('opens create dialog with campaign defaults', async ({ page }) => {
  await page.getByTestId('hufi-create-button').click();
  const dialog = page.getByTestId('hufi-create-dialog');

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('binance', { exact: true })).toBeVisible();
  await expect(dialog.getByText('BTC/USDT', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/not supported/i)).toBeVisible();
});
