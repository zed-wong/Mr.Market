import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const orderCreateSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/order/new/+page.svelte', import.meta.url)),
    'utf8'
  );

const campaignDetailSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/campaign/[id]/+page.svelte', import.meta.url)),
    'utf8'
  );

const orderDetailSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/order/[id]/+page.svelte', import.meta.url)),
    'utf8'
  );

const legacyWeb3MarketMakingNamespace = () => ['/api/v1/web3', 'market-making'].join('/');

describe('market-making campaign detail to order route', () => {
  it('renders order-first creation without a campaign prerequisite', () => {
    const source = orderCreateSource();

    expect(source).toContain('loadCreateOptions');
    expect(source).toContain('listMarketMakingStrategies');
    expect(source).toContain('listMarketMakingOptions');
    expect(source).toContain('createMarketMakingOrder');
    expect(source).toContain('/app/market-making/order/${encodeURIComponent(response.orderId)}');
    expect(source).not.toContain('order-create-campaign-not-found');
    expect(source).not.toContain('requestedCampaignId');
    expect(source).not.toContain('Choose a valid market-making campaign before creating an order.');
    expect(source).not.toContain('/app/market-making/campaign/');
  });

  it('requires SIWE and wallet approval before pure market-making submission', () => {
    const source = orderCreateSource();

    expect(source).toContain('signInWithEthereum');
    expect(source).toContain('hasAuthenticatedOrderScope');
    expect(source).toContain('signWalletMessage(approvalMessage)');
    expect(source).toContain("const PURE_MARKET_MAKING_KEY = 'pure_market_making'");
    expect(source).toContain("submitState = 'signing'");
    expect(source).toContain('isSubmitting = true');
    expect(source).toContain('disabled={isSubmitting');
  });

  it('hides normal strategy selection and derives the pure strategy automatically', () => {
    const source = orderCreateSource();

    expect(source).toContain('isPureMarketMakingStrategy');
    expect(source).toContain('selectedPureStrategy');
    expect(source).toContain('strategyDefinitionId: selectedPureStrategy.id');
    expect(source).not.toContain('data-testid="order-strategy-select"');
    expect(source).not.toContain('Choose a strategy');
    expect(source).not.toContain('selectedStrategyId');
  });

  it('wires the web3 market-making API helpers for create options and submission', () => {
    const helper = readFileSync(
      fileURLToPath(new URL('../helpers/api/web3.ts', import.meta.url)),
      'utf8'
    );

    expect(helper).toContain('/web3/market-making');
    expect(helper).not.toContain(legacyWeb3MarketMakingNamespace());
    expect(helper).toContain('listMarketMakingStrategies');
    expect(helper).toContain('/strategies');
    expect(helper).toContain('listMarketMakingOptions');
    expect(helper).toContain('/options');
    expect(helper).toContain('createMarketMakingOrder');
    expect(helper).toContain('method: \'POST\'');
    expect(helper).toContain('/orders');
  });

  it('replaces legacy market-making URLs with order-list navigation', () => {
    const source = campaignDetailSource();

    expect(source).toContain("goto('/app/market-making'");
    expect(source).toContain('legacy-detail-replaced');
    expect(source).toContain('Open orders');
    expect(source.toLowerCase()).not.toContain('join');
    expect(source.toLowerCase()).not.toContain('discovery');
  });

  it('wires order detail to server-backed detail and mutation helpers', () => {
    const source = orderDetailSource();
    const helper = readFileSync(
      fileURLToPath(new URL('../helpers/api/web3.ts', import.meta.url)),
      'utf8'
    );

    expect(helper).toContain('getMarketMakingOrderDetail');
    expect(helper).toContain('depositMarketMakingOrder');
    expect(helper).toContain('withdrawMarketMakingOrder');
    expect(helper).toContain('startMarketMakingOrder');
    expect(helper).toContain('pauseMarketMakingOrder');
    expect(helper).toContain('resumeMarketMakingOrder');
    expect(helper).toContain('encodeURIComponent(orderId)');
    expect(helper).toContain("orderEndpoint(orderId, '/deposit')");
    expect(helper).toContain("orderEndpoint(orderId, '/withdraw')");
    expect(helper).toContain("orderEndpoint(orderId, '/start')");
    expect(helper).toContain("orderEndpoint(orderId, '/pause')");
    expect(helper).toContain("orderEndpoint(orderId, '/resume')");

    expect(source).toContain('getMarketMakingOrderDetail');
    expect(source).toContain('depositMarketMakingOrder');
    expect(source).toContain('withdrawMarketMakingOrder');
    expect(source).toContain('startMarketMakingOrder');
    expect(source).toContain('pauseMarketMakingOrder');
    expect(source).toContain('resumeMarketMakingOrder');
    expect(source).toContain('order.validActions.start');
    expect(source).toContain('order.validActions.pause');
    expect(source).toContain('order.validActions.resume');
    expect(source).toContain('order.validActions.deposit');
    expect(source).toContain('order.validActions.withdraw');
    expect(source).toContain('order-detail-top-controls');
    expect(source).toContain('order-event-timeline');
    expect(source).toContain('order-spread-capture');
    expect(source).toContain('snapshot.additionalMetrics');
    expect(source).toContain('formatAdditionalMetricValue');
    expect(source).toContain('depositMarketMakingOrder(order.orderId, request)');
    expect(source).toContain('withdrawMarketMakingOrder(order.orderId, request)');
    expect(source).not.toContain('transitionOrderLifecycle');
    expect(source).not.toContain('walletInteractionMode');
    expect(source).not.toContain('allCampaigns');
    expect(source).not.toContain('Unknown campaign');
  });

  it('localizes order detail copy and keeps funding validation inline', () => {
    const source = orderDetailSource();
    const en = readFileSync(fileURLToPath(new URL('../../i18n/en.json', import.meta.url)), 'utf8');
    const zh = readFileSync(fileURLToPath(new URL('../../i18n/zh.json', import.meta.url)), 'utf8');

    expect(source).toContain("import { _ } from 'svelte-i18n'");
    expect(source).toContain("$_('market_making_detail_funding_title')");
    expect(source).toContain("$_('market_making_detail_performance_title')");
    expect(source).toContain("$_('market_making_detail_events_title')");
    expect(source).toContain('order-deposit-validation');
    expect(source).toContain('order-withdraw-validation');
    expect(en).toContain('"market_making_detail_funding_title"');
    expect(en).toContain('"market_making_detail_spread_capture"');
    expect(zh).toContain('"market_making_detail_funding_title"');
    expect(zh).toContain('"market_making_detail_spread_capture"');
  });
});
