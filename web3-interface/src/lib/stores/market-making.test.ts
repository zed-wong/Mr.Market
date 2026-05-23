import { get } from 'svelte/store';
import { describe, expect, it, beforeEach } from 'vitest';
import { mockCampaigns, type MockCampaign, type MockOrderStatus } from '$lib/helpers/mock-web3';
import {
  allCampaigns,
  allOrders,
  canPauseOrder,
  canResumeOrder,
  canStopOrder,
  createMockOrder,
  orderDraft,
  resetMarketMakingSession,
  restoreMarketMakingSession,
  sessionCampaigns,
  sessionMarketMakingActivity,
  sessionOrders,
  transitionOrderLifecycle,
  validateOrderDraft,
} from './market-making';

const evmCampaign = mockCampaigns.find((campaign) => campaign.id === 'eth-usdc-depth');
const evmBalances = [
  {
    asset: 'usdc',
    chainNamespace: 'evm' as const,
    chainId: 1,
    tokenAddress: null,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    amount: '2000',
    usdValue: '2000',
  },
];

const installSessionStorageMock = () => {
  const storage: Record<string, string> = {};
  const sessionStorageMock = {
    get length() {
      return Object.keys(storage).length;
    },
    clear: () => {
      for (const key of Object.keys(storage)) delete storage[key];
    },
    getItem: (key: string) => storage[key] ?? null,
    key: (index: number) => Object.keys(storage)[index] ?? null,
    removeItem: (key: string) => {
      delete storage[key];
    },
    setItem: (key: string, value: string) => {
      storage[key] = String(value);
    },
  } as Storage;

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageMock,
    configurable: true,
  });

  return storage;
};

describe('market-making order flow store', () => {
  beforeEach(() => {
    resetMarketMakingSession();
  });

  it('validates wallet, campaign, minimum contribution, and balance constraints', () => {
    expect(evmCampaign).toBeDefined();
    if (!evmCampaign) return;

    expect(validateOrderDraft(evmCampaign, 'evm', false, false, '500', evmBalances)).toMatchObject({
      wallet: 'Connect a mocked Reown wallet before creating an order.',
    });
    expect(validateOrderDraft(evmCampaign, 'evm', true, true, '500', evmBalances)).toMatchObject({
      wallet: 'Unsupported chain selected. Switch to EVM or Solana before creating an order.',
    });
    expect(validateOrderDraft(evmCampaign, 'solana', true, false, '500', evmBalances)).toMatchObject({
      wallet: 'Solana / SVM is not supported for this campaign.',
    });
    expect(validateOrderDraft(evmCampaign, 'evm', true, false, '', evmBalances)).toMatchObject({
      amount: 'Contribution amount is required.',
    });
    expect(validateOrderDraft(evmCampaign, 'evm', true, false, '250', evmBalances)).toMatchObject({
      amount: 'Minimum contribution for ETH / USDC Depth Builder is $500.',
    });
    expect(validateOrderDraft(evmCampaign, 'evm', true, false, '2500', evmBalances)).toMatchObject({
      amount: 'Amount exceeds available mocked balance of $2,000.00.',
    });
    expect(validateOrderDraft(evmCampaign, 'evm', true, false, '500', evmBalances)).toEqual({});
  });

  it('blocks paused campaigns from entering review', () => {
    expect(evmCampaign).toBeDefined();
    if (!evmCampaign) return;
    const pausedCampaign: MockCampaign = { ...evmCampaign, status: 'paused' };

    expect(validateOrderDraft(pausedCampaign, 'evm', true, false, '500', evmBalances)).toMatchObject({
      wallet: 'ETH / USDC Depth Builder is paused. New market-making orders are temporarily disabled.',
    });
  });

  it('creates a deterministic local order and activity entries for participation surfaces', () => {
    expect(evmCampaign).toBeDefined();
    if (!evmCampaign) return;

    const order = createMockOrder(evmCampaign, 'evm', '750', 'evm-primary');

    expect(order).toMatchObject({
      id: 'MM-EVM-3001',
      accountId: 'evm-primary',
      campaignId: 'eth-usdc-depth',
      status: 'active',
      contributionAmount: '$750.00',
      participation: 'joined',
    });
    expect(order.logs.map((log) => log.status)).toEqual([
      'pending',
      'approval',
      'signing',
      'submitted',
      'active',
    ]);
    expect(get(sessionOrders).map((item) => item.id)).toEqual(['MM-EVM-3001']);
    expect(get(sessionMarketMakingActivity).map((entry) => entry.id)).toEqual([
      'activity-order-MM-EVM-3001',
      'activity-campaign-join-MM-EVM-3001',
    ]);
    expect(get(orderDraft)).toBeNull();
  });

  it('pauses and resumes deterministic session orders with appended logs and activity', () => {
    expect(evmCampaign).toBeDefined();
    if (!evmCampaign) return;

    const order = createMockOrder(evmCampaign, 'evm', '750', 'evm-primary');
    const paused = transitionOrderLifecycle(order.id, 'pause');

    expect(paused).toMatchObject({
      id: 'MM-EVM-3001',
      status: 'paused',
      updatedAt: '2026-05-23 10:05',
    });
    expect(paused?.logs.at(-1)).toMatchObject({
      label: 'Placement paused',
      status: 'paused',
      outcome: 'New maker order placement paused while existing fills remain tracked.',
    });

    const resumed = transitionOrderLifecycle(order.id, 'resume');

    expect(resumed).toMatchObject({
      id: 'MM-EVM-3001',
      status: 'active',
      updatedAt: '2026-05-23 10:06',
    });
    expect(resumed?.logs.at(-1)).toMatchObject({
      label: 'Placement resumed',
      status: 'active',
      outcome: 'Maker order placement resumed using the existing deterministic contribution.',
    });
    expect(get(sessionOrders)).toHaveLength(1);
    expect(get(sessionMarketMakingActivity).slice(0, 2).map((entry) => entry.id)).toEqual([
      'activity-order-lifecycle-MM-EVM-3001-10-06',
      'activity-order-lifecycle-MM-EVM-3001-10-05',
    ]);
  });

  it('stops and resumes fixture orders through local session overrides', () => {
    const stopped = transitionOrderLifecycle('MM-1001', 'stop');

    expect(stopped).toMatchObject({
      id: 'MM-1001',
      status: 'stopped',
      updatedAt: '2026-05-23 10:06',
    });
    expect(stopped?.logs.at(-1)).toMatchObject({
      label: 'Placement stopped',
      status: 'stopped',
      outcome: 'Active maker order placement stopped; inventory remains reserved for deterministic settlement.',
    });
    expect(get(sessionOrders).map((order) => order.id)).toEqual(['MM-1001']);
    expect(get(allOrders).filter((order) => order.id === 'MM-1001')).toHaveLength(1);

    const resumed = transitionOrderLifecycle('MM-1001', 'resume');

    expect(resumed).toMatchObject({
      id: 'MM-1001',
      status: 'active',
      updatedAt: '2026-05-23 10:07',
    });
    expect(resumed?.logs.at(-1)).toMatchObject({
      label: 'Placement resumed',
      status: 'active',
    });
    expect(get(sessionOrders).map((order) => order.status)).toEqual(['active']);
  });

  it('only exposes lifecycle actions for semantically valid active statuses', () => {
    const preActiveStatuses: MockOrderStatus[] = ['draft', 'pending', 'approval', 'signing', 'submitted'];

    for (const status of preActiveStatuses) {
      expect(canPauseOrder(status)).toBe(false);
      expect(canResumeOrder(status)).toBe(false);
      expect(canStopOrder(status)).toBe(false);
    }

    expect(canPauseOrder('active')).toBe(true);
    expect(canStopOrder('active')).toBe(true);
    expect(canResumeOrder('paused')).toBe(true);
    expect(canResumeOrder('stopped')).toBe(true);
  });

  it('does not mutate pending or draft fixture orders with lifecycle actions', () => {
    for (const orderId of ['MM-2001', 'MM-2003']) {
      expect(transitionOrderLifecycle(orderId, 'pause')).toBeNull();
      expect(transitionOrderLifecycle(orderId, 'resume')).toBeNull();
      expect(transitionOrderLifecycle(orderId, 'stop')).toBeNull();
    }

    expect(get(sessionOrders)).toEqual([]);
    expect(get(sessionMarketMakingActivity)).toEqual([]);
  });

  it('does not mutate terminal fixture orders with lifecycle actions', () => {
    expect(transitionOrderLifecycle('MM-1002', 'pause')).toBeNull();
    expect(transitionOrderLifecycle('MM-1002', 'resume')).toBeNull();
    expect(transitionOrderLifecycle('MM-1002', 'stop')).toBeNull();
    expect(get(sessionOrders)).toEqual([]);
    expect(get(sessionMarketMakingActivity)).toEqual([]);
  });

  it('restores malformed parseable market-making snapshots with safe defaults', () => {
    const storage = installSessionStorageMock();
    storage['mrm-web3-market-making-session'] = JSON.stringify({
      campaignSequence: 'not-a-number',
      orderSequence: null,
      sessionCampaigns: { id: 'bad-campaign' },
      sessionOrders: [
        null,
        { id: 'bad-order', status: 'active' },
        {
          id: 'MM-BAD-9999',
          accountId: 'evm-primary',
          campaignId: 'eth-usdc-depth',
          status: 'active',
          namespace: 'evm',
          logs: { label: 'not an array' },
        },
      ],
      sessionMarketMakingActivity: { id: 'bad-activity' },
      orderDraft: { campaignId: 42, namespace: 'evm' },
    });

    expect(() => restoreMarketMakingSession()).not.toThrow();
    expect(get(sessionCampaigns)).toEqual([]);
    expect(get(sessionOrders)).toEqual([]);
    expect(get(sessionMarketMakingActivity)).toEqual([]);
    expect(get(orderDraft)).toBeNull();
    expect(get(allCampaigns).map((campaign) => campaign.id)).toContain('eth-usdc-depth');
    expect(get(allOrders).map((order) => order.id)).toContain('MM-1001');

    expect(evmCampaign).toBeDefined();
    if (!evmCampaign) return;
    expect(createMockOrder(evmCampaign, 'evm', '750', 'evm-primary')).toMatchObject({
      id: 'MM-EVM-3001',
    });
  });
});
