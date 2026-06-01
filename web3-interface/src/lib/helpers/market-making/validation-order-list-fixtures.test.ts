import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadFixtures = async () =>
  import('./validation-order-list-fixtures');

let validationEnabled = false;

vi.mock('$lib/helpers/constants', () => ({
  isValidationWalletEnabled: () => validationEnabled,
}));

describe('market-making validation order list fixtures', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    validationEnabled = false;
  });

  it('stays disabled unless the validation wallet/runtime flag is enabled', async () => {
    const { validationOrderListFixtureForState } = await loadFixtures();

    expect(validationOrderListFixtureForState('empty')).toBeNull();
    expect(validationOrderListFixtureForState('many')).toBeNull();
  });

  it('returns a deterministic zero-order state for authenticated empty-list validation', async () => {
    validationEnabled = true;
    const { validationOrderListFixtureForState } = await loadFixtures();

    const fixture = validationOrderListFixtureForState('empty');

    expect(fixture).toEqual({
      namespace: '/web3/market-making',
      total: 0,
      orders: [],
    });
    expect(validationOrderListFixtureForState('zero')).toEqual(fixture);
  });

  it('returns more than four web3 order summaries for compact-list validation', async () => {
    validationEnabled = true;
    const { validationOrderListFixtureForState } = await loadFixtures();

    const fixture = validationOrderListFixtureForState('many');

    expect(fixture?.namespace).toBe('/web3/market-making');
    expect(fixture?.orders).toHaveLength(5);
    expect(fixture?.total).toBe(5);
    expect(fixture?.orders.every((order) => order.source === 'web3_market_making_order')).toBe(true);
    expect(fixture?.orders.map((order) => order.orderId)).toEqual([
      'validation-mm-01',
      'validation-mm-02',
      'validation-mm-03',
      'validation-mm-04',
      'validation-mm-05',
    ]);
    expect(fixture?.orders[0]?.balances.map((balance) => balance.assetId)).toContain('asset-usdt');
    expect(validationOrderListFixtureForState('compact')?.orders).toHaveLength(5);
  });
});
