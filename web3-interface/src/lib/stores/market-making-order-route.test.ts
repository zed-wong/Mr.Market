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

describe('market-making campaign detail to order route', () => {
  it('renders order-first creation without a campaign prerequisite', () => {
    const source = orderCreateSource();

    expect(source).toContain('loadCreateOptions');
    expect(source).toContain('listMarketMakingStrategies');
    expect(source).toContain('listMarketMakingOptions');
    expect(source).toContain('createMarketMakingOrder');
    expect(source).toContain('/market-making/order/${response.orderId}');
    expect(source).not.toContain('order-create-campaign-not-found');
    expect(source).not.toContain('requestedCampaignId');
    expect(source).not.toContain('Choose a valid market-making campaign before creating an order.');
    expect(source).not.toContain('/market-making/campaign/');
  });

  it('surfaces wallet interaction recovery states and duplicate submit protection', () => {
    const source = orderCreateSource();

    expect(source).toContain('walletInteractionMode');
    expect(source).toContain('Preview user rejection');
    expect(source).toContain('Preview wallet timeout');
    expect(source).toContain('Preview network mismatch');
    expect(source).toContain('if (isSubmitting) return;');
    expect(source).toContain('disabled={isSubmitting');
  });

  it('wires the web3 market-making API helpers for create options and submission', () => {
    const helper = readFileSync(
      fileURLToPath(new URL('../helpers/api/web3.ts', import.meta.url)),
      'utf8'
    );

    expect(helper).toContain('/api/v1/web3/market-making');
    expect(helper).toContain('listMarketMakingStrategies');
    expect(helper).toContain('/strategies');
    expect(helper).toContain('listMarketMakingOptions');
    expect(helper).toContain('/options');
    expect(helper).toContain('createMarketMakingOrder');
    expect(helper).toContain('method: \'POST\'');
    expect(helper).toContain('/orders');
  });

  it('blocks paused campaign details and exposes state variants', () => {
    const source = campaignDetailSource();

    expect(source).toContain("eligibility?.state === 'campaign-paused'");
    expect(source).toContain('campaign-detail-loading-state');
    expect(source).toContain('campaign-detail-error-state');
    expect(source).toContain('campaign-detail-state-select');
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
    expect(helper).toContain('/orders/${orderId}');
    expect(helper).toContain('/orders/${orderId}/deposit');
    expect(helper).toContain('/orders/${orderId}/withdraw');
    expect(helper).toContain('/orders/${orderId}/start');
    expect(helper).toContain('/orders/${orderId}/pause');
    expect(helper).toContain('/orders/${orderId}/resume');

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
    expect(source).toContain('walletInteractionMode');
    expect(source).not.toContain('transitionOrderLifecycle');
    expect(source).not.toContain('allCampaigns');
    expect(source).not.toContain('Unknown campaign');
  });
});
