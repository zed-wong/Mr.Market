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

describe('market-making campaign detail to order route', () => {
  it('requires a campaign query and routes created orders to detail', () => {
    const source = orderCreateSource();

    expect(source).toContain('order-create-campaign-not-found');
    expect(source).toContain('Choose a valid market-making campaign before creating an order.');
    expect(source).not.toContain('?? $allCampaigns[0]');
    expect(source).toContain('await goto(`/market-making/order/${submittedOrder.id}`)');
  });

  it('surfaces deterministic approval, signing, and submission statuses', () => {
    const source = orderCreateSource();

    expect(source).toContain("flowStep = 'approving'");
    expect(source).toContain("flowStep = 'signing'");
    expect(source).toContain("flowStep = 'submitting'");
    expect(source).toContain('order-processing-${flowStep}');
    expect(source).toContain('No real signature is performed.');
  });

  it('blocks paused campaign details and exposes state variants', () => {
    const source = campaignDetailSource();

    expect(source).toContain("eligibility?.state === 'campaign-paused'");
    expect(source).toContain('campaign-detail-loading-state');
    expect(source).toContain('campaign-detail-error-state');
    expect(source).toContain('campaign-detail-state-select');
  });
});
