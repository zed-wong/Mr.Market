import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const listRouteSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/+page.svelte', import.meta.url)),
    'utf8'
  );

const apiHelperSource = () =>
  readFileSync(
    fileURLToPath(new URL('../helpers/api/web3.ts', import.meta.url)),
    'utf8'
  );

describe('/market-making order list route', () => {
  it('loads market-making orders from the web3 market-making API namespace', () => {
    const route = listRouteSource();
    const helper = apiHelperSource();

    expect(route).toContain('listMarketMakingOrders');
    expect(helper).toContain('/api/v1/web3/market-making');
    expect(helper).toContain('listMarketMakingOrders');
  });

  it('renders order-first loading, empty, error, retry, and populated states', () => {
    const source = listRouteSource();

    expect(source).toContain('Market-making orders');
    expect(source).toContain('/market-making/order/new');
    expect(source).toContain('order-list-loading-state');
    expect(source).toContain('order-list-empty-state');
    expect(source).toContain('order-list-error-state');
    expect(source).toContain('order-list-retry');
    expect(source).toContain('order-list');
    expect(source).toContain('orderDetailHref(order.orderId)');
    expect(source).toContain('encodeURIComponent(orderId)');
  });

  it('removes campaign discovery controls and terminology from the list page', () => {
    const source = listRouteSource().toLowerCase();

    expect(source).not.toContain('campaign');
    expect(source).not.toContain('discovery');
    expect(source).not.toContain('join campaign');
    expect(source).not.toContain('/market-making/campaign');
  });
});
