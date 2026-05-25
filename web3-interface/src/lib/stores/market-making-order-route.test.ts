import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const orderCreateSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/order/new/+page.svelte', import.meta.url)),
    'utf8'
  );

const campaignDetailSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/campaign/[id]/+page.svelte', import.meta.url)),
    'utf8'
  );

const orderDetailSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/market-making/order/[id]/+page.svelte', import.meta.url)),
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
    expect(source).toContain('/market-making/order/${encodeURIComponent(response.orderId)}');
    expect(source).not.toContain('order-create-campaign-not-found');
    expect(source).not.toContain('requestedCampaignId');
    expect(source).not.toContain('Choose a valid market-making campaign before creating an order.');
    expect(source).not.toContain('/market-making/campaign/');
  });

  it('surfaces wallet interaction recovery states and duplicate submit protection', () => {
    const source = orderCreateSource();

    expect(source).toContain('walletInteractionMode');
    expect(source).toContain('getCreateOrderSubmissionBlockReason');
    expect(source).toContain('getCreateOrderSessionBlockReason');
    expect(source).toContain('Preview user rejection');
    expect(source).toContain('Preview wallet timeout');
    expect(source).toContain('Preview network mismatch');
    expect(source).toContain('isSubmitting,');
    expect(source).toContain('disabled={isSubmitting');
  });

  it('keeps strategy selection explicitly unselected until the user chooses one', () => {
    const source = orderCreateSource();

    expect(source).toContain('<option value="">Choose a strategy…</option>');
    expect(source).toContain('Choose a market-making strategy.');
    expect(source).toContain('selectedStrategyId && !strategies.some');
    expect(source).not.toContain('selectedStrategyId = strategies[0].id');
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

    expect(source).toContain("goto('/market-making'");
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
    expect(source).toContain('order-event-timeline');
    expect(source).toContain('snapshot.additionalMetrics');
    expect(source).toContain('formatAdditionalMetricValue');
    expect(source).toContain('walletInteractionMode');
    expect(source).not.toContain('transitionOrderLifecycle');
    expect(source).not.toContain('allCampaigns');
    expect(source).not.toContain('Unknown campaign');
  });
});
