import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const listRouteSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/+page.svelte', import.meta.url)),
    'utf8'
  );

const apiHelperSource = () =>
  readFileSync(
    fileURLToPath(new URL('../helpers/api/web3.ts', import.meta.url)),
    'utf8'
  );

const layoutSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/+layout.svelte', import.meta.url)),
    'utf8'
  );

const localeSource = (locale: 'en' | 'zh') =>
  readFileSync(fileURLToPath(new URL(`../../i18n/${locale}.json`, import.meta.url)), 'utf8');

const legacyWeb3MarketMakingNamespace = () => ['/api/v1/web3', 'market-making'].join('/');

describe('/app/market-making order list route', () => {
  it('loads market-making orders from the web3 market-making API namespace', () => {
    const route = listRouteSource();
    const helper = apiHelperSource();

    expect(route).toContain('listMarketMakingOrders');
    expect(helper).toContain('/web3/market-making');
    expect(helper).not.toContain(legacyWeb3MarketMakingNamespace());
    expect(helper).toContain('listMarketMakingOrders');
  });

  it('renders order-first loading, empty, error, retry, and populated states', () => {
    const source = listRouteSource();

    expect(source).toContain("$_('market_making_list_title')");
    expect(source).toContain("$_('market_making_list_empty_cta')");
    expect(source).toContain('/app/market-making/order/new');
    expect(source).toContain('validationListState');
    expect(source).toContain('validationLoadingRequested');
    expect(source).toContain('order-list-loading-state');
    expect(source).toContain('order-list-empty-state');
    expect(source).toContain('order-list-error-state');
    expect(source).toContain('order-list-retry');
    expect(source).toContain('order-list');
    expect(source).toContain('orderDetailHref(order.orderId)');
    expect(source).toContain('encodeURIComponent(orderId)');
  });

  it('adapts small order counts to rich cards and larger counts to compact rows', () => {
    const source = listRouteSource();

    expect(source).toContain('filteredOrders.length <= 4');
    expect(source).toContain('useRichOrderCards');
    expect(source).toContain('data-layout="cards"');
    expect(source).toContain('data-layout="compact"');
    expect(source).toContain('order-card-{order.orderId}');
    expect(source).toContain('order-row-{order.orderId}');
  });

  it('prioritizes status, PnL and fees, locked funds, and lifecycle actions on each order item', () => {
    const source = listRouteSource();

    expect(source).toContain('order-status-{order.orderId}');
    expect(source).toContain("$_('market_making_list_pnl_fees')");
    expect(source).toContain('orderFinancials(order)');
    expect(source).toContain("$_('market_making_list_fees')");
    expect(source).toContain("$_('market_making_list_locked_funds')");
    expect(source).toContain('orderLockedFunds(order)');
    expect(source).toContain('order-quick-start-{order.orderId}');
    expect(source).toContain('order-quick-pause-{order.orderId}');
    expect(source).toContain('order-quick-resume-{order.orderId}');
    expect(source).not.toContain('uppercase');
  });

  it('keeps market-making list copy in the English and Chinese locale files', () => {
    const en = JSON.parse(localeSource('en')) as Record<string, string>;
    const zh = JSON.parse(localeSource('zh')) as Record<string, string>;
    const expectedKeys = [
      'market_making_list_title',
      'market_making_list_connect_title',
      'market_making_list_empty_cta',
      'market_making_list_pnl_fees',
      'market_making_list_fees',
      'market_making_list_locked_funds',
      'market_making_list_action_start',
      'market_making_list_action_pause',
      'market_making_list_action_resume',
    ];

    for (const key of expectedKeys) {
      expect(en[key]).toBeTruthy();
      expect(zh[key]).toBeTruthy();
    }
  });

  it('clears stale rows and waits for auth that matches the active wallet scope', () => {
    const source = listRouteSource();
    const layout = layoutSource();

    expect(source).toContain('authMatchesActiveWallet');
    expect(source).toContain('hasUsableAuthSession');
    expect(source).toContain('authMatchesWalletScope');
    expect(source).toContain('address: activeWalletAddress');
    expect(source).toContain('chainId: activeWalletChainId');
    expect(source).toContain('orders = [];');
    expect(source).toContain('market-making-public-overview');
    expect(source).toContain('order-sign-in-gate');
    expect(layout).toContain('authenticatedWalletKey !== walletKey');
    expect(layout).toContain('checkSession()');
    expect(layout).toContain('/app/login');
    expect(layout).not.toContain('demo-signature');
    expect(layout).not.toContain('ensureWeb3Auth');
  });

  it('allows public market-making browsing while keeping private app routes protected', () => {
    const source = listRouteSource();
    const layout = layoutSource();
    const en = JSON.parse(localeSource('en')) as Record<string, string>;
    const zh = JSON.parse(localeSource('zh')) as Record<string, string>;

    expect(layout).toContain("page.url.pathname === '/app/market-making'");
    expect(layout).toContain('isPublicReadOnlyRoute');
    expect(layout).toContain('canRenderCurrentRoute');
    expect(layout).toContain("goto(loginHref())");
    expect(source).toContain('createOrderHref');
    expect(source).toContain("encodeURIComponent('/app/market-making/order/new')");
    expect(source).toContain("$_('market_making_list_public_title')");
    expect(source).toContain("$_('market_making_list_sign_in_to_create')");
    expect(source).not.toContain('order-list-authenticating-state');

    for (const key of [
      'market_making_list_public_title',
      'market_making_list_public_message',
      'market_making_list_sign_in_title',
      'market_making_list_sign_in_to_create',
    ]) {
      expect(en[key]).toBeTruthy();
      expect(zh[key]).toBeTruthy();
    }
  });

  it('removes campaign discovery controls and terminology from the list page', () => {
    const source = listRouteSource().toLowerCase();

    expect(source).not.toContain('campaign');
    expect(source).not.toContain('discovery');
    expect(source).not.toContain('join campaign');
    expect(source).not.toContain('/app/market-making/campaign');
  });
});
