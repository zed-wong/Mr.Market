import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { balances } from './balances';
import {
  allCampaigns,
  allOrders,
  clearOrderDraft,
  createMockCampaign,
  createMockOrder,
  feeEstimateFor,
  orderDraft,
  resetMarketMakingSession,
  saveOrderDraft,
  sessionMarketMakingActivity,
  validateCampaignCreation,
  validateOrderDraft,
} from './market-making';
import { connectMockWallet, setWalletDisconnected } from './wallet';
import { mockCampaigns } from '$lib/helpers/mock-web3';

describe('mock market-making flows', () => {
  afterEach(() => {
    clearOrderDraft();
    resetMarketMakingSession();
    setWalletDisconnected();
  });

  it('validates campaign creation and inserts created campaigns into surfaces', () => {
    expect(
      validateCampaignCreation({
        name: '',
        namespace: '',
        assets: '',
        minimumContribution: '0',
        duration: '',
        status: 'open',
        liquidityTarget: '',
        volumeTarget: '',
        terms: '',
      })
    ).toMatchObject({
      name: 'Campaign name is required.',
      namespace: 'Choose a supported chain namespace.',
      assets: 'At least one supported asset is required.',
    });

    const campaign = createMockCampaign({
      name: 'Validator Stable Depth',
      namespace: 'evm',
      assets: 'USDC, ETH',
      minimumContribution: '750',
      duration: 'Jun 1, 2026 → Jul 1, 2026',
      status: 'open',
      liquidityTarget: '1000000',
      volumeTarget: '5000000',
      terms: 'Keep inventory funded.\nRewards follow mocked fills.',
    });

    expect(campaign.id).toBe('validator-stable-depth-1');
    expect(get(allCampaigns)[0]).toMatchObject({
      name: 'Validator Stable Depth',
      minimum: '$750.00',
      chains: ['evm'],
    });
    expect(get(sessionMarketMakingActivity)[0].href).toBe(`/market-making/campaign/${campaign.id}`);
  });

  it('validates order constraints and computes a deterministic fee estimate', async () => {
    await connectMockWallet('evm-primary', 0);
    const campaign = mockCampaigns[0];
    const balanceSnapshot = get(balances);

    expect(validateOrderDraft(campaign, 'evm', true, false, '', balanceSnapshot).amount).toContain('required');
    expect(validateOrderDraft(campaign, 'evm', true, false, '100', balanceSnapshot).amount).toContain('Minimum contribution');
    expect(validateOrderDraft(campaign, 'evm', true, false, '999999', balanceSnapshot).amount).toContain('exceeds available');
    expect(validateOrderDraft(campaign, 'solana', true, false, '500', balanceSnapshot).wallet).toContain('not supported');
    expect(validateOrderDraft(campaign, 'evm', true, false, '500', balanceSnapshot)).toEqual({});

    expect(feeEstimateFor('500')).toEqual({
      campaignFee: '$1.75',
      liquidityContribution: '$498.25',
      expectedVolume: '$4,600.00',
      expectedProfit: '+$12.00',
    });
  });

  it('persists drafts, creates orders, clears drafts, and records linked activity', async () => {
    await connectMockWallet('solana-primary', 0);
    const campaign = mockCampaigns[1];

    saveOrderDraft({
      campaignId: campaign.id,
      namespace: 'solana',
      amount: '250',
      selectedAssets: 'SOL + USDC',
      updatedAt: '2026-05-23 09:18',
    });
    expect(get(orderDraft)?.amount).toBe('250');

    const order = createMockOrder(campaign, 'solana', '250');

    expect(get(orderDraft)).toBeNull();
    expect(get(allOrders)[0]).toMatchObject({
      id: order.id,
      campaignId: campaign.id,
      namespace: 'solana',
      status: 'active',
      contributionAmount: '$250.00',
    });
    expect(order.logs.map((log) => log.status)).toEqual([
      'pending',
      'approval',
      'signing',
      'submitted',
      'active',
    ]);
    expect(get(sessionMarketMakingActivity)[0]).toMatchObject({
      label: 'Market-making order',
      href: `/market-making/order/${order.id}`,
    });
  });
});
