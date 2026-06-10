import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import type { DirectOrderStatus } from '$lib/types/hufi/admin-direct-market-making';
import RuntimeCyclePanel from './RuntimeCyclePanel.svelte';

const baseStatus: DirectOrderStatus = {
  orderId: 'order-runtime-1',
  state: 'paused',
  runtimeState: 'paused',
  controllerType: 'efficientDualAccountVolume',
  directExecutionMode: 'dual_account',
  accountLabel: 'maker-main',
  makerAccountLabel: 'maker',
  takerAccountLabel: 'taker',
  makerAccountName: 'maker-main',
  takerAccountName: 'taker-alt',
  apiKeyId: null,
  makerApiKeyId: 'maker-key',
  takerApiKeyId: 'taker-key',
  executorHealth: 'active',
  lastTickAt: '2026-06-04T00:00:00.000Z',
  lastUpdatedAt: '2026-06-04T00:00:05.000Z',
  privateStreamEventAt: null,
  openOrders: [],
  intents: [],
  fillCount1h: 2,
  recentErrors: [],
  orderConfig: {
    mode: 'balanced',
    orderAmount: '0.5',
    bidSpread: null,
    askSpread: null,
    numberOfLayers: null,
    baseIntervalTime: 30,
    numTrades: null,
    baseIncrementPercentage: null,
    pricePushRate: null,
    postOnlySide: null,
    dynamicRoleSwitching: true,
    targetQuoteVolume: '45000',
    cadenceVariance: null,
    tradeAmountVariance: null,
    priceOffsetVariance: null,
    publishedCycles: 2,
    completedCycles: 1,
    tradedQuoteVolume: '15000',
    realizedPnlQuote: null,
  },
  readiness: {
    canStart: false,
    mode: 'balanced',
    bestFirstAction: {
      makerAccountLabel: 'maker-main',
      takerAccountLabel: 'taker-alt',
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      quantity: '0.5',
      price: '30000',
      notional: '15000',
    },
    maximumCycleQty: '0.8',
    recommendedCycleQty: '0.5',
    currentBalancesByAccountAsset: [],
    minimumCapitalByAccountAsset: [],
    recommendedCapitalByAccountAsset: [],
    maximumUsefulCapitalByAccountAsset: [],
    missingBalances: [
      {
        accountLabel: 'taker-alt',
        asset: 'BTC',
        availableAmount: '0.1',
        minimumUsefulAmount: '0.5',
        missingAmount: '0.4',
      },
    ],
    estimatedCycles: {
      count: '3',
      basis: 'current_available_balances',
    },
    estimatedVolume: {
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      baseAmount: '1.5',
      quoteAmount: '45000',
    },
    blockingReasons: [],
  },
  cycles: [
    {
      cycleId: 'cycle-runtime-1',
      aggregateStatus: 'failed',
      failureReason: 'taker IOC rejected',
      legs: [
        {
          cycleId: 'cycle-runtime-1',
          cycleRole: 'maker',
          accountLabel: 'maker',
          side: 'buy',
          plannedQty: '0.5',
          plannedPrice: '30000',
          filledQty: '0.5',
          notional: '15000',
          status: 'filled',
          failureReason: null,
          linkedIntentId: 'intent-maker',
          linkedTrackedOrderId: 'tracked-maker',
        },
        {
          cycleId: 'cycle-runtime-1',
          cycleRole: 'taker',
          accountLabel: 'taker',
          side: 'sell',
          plannedQty: '0.5',
          plannedPrice: '30000',
          filledQty: '0',
          notional: '15000',
          status: 'failed',
          failureReason: 'taker IOC rejected',
          linkedIntentId: 'intent-taker',
          linkedTrackedOrderId: null,
        },
      ],
    },
  ],
  spread: null,
  inventoryBalances: [],
  stale: false,
};

describe('RuntimeCyclePanel', () => {
  it('renders grouped maker and inline taker legs without planner blockers', () => {
    const { body } = render(RuntimeCyclePanel, {
      props: {
        data: baseStatus,
        warnings: ['execution_blocked'],
      },
    });

    expect(body).toContain('Efficient Volume runtime cycles');
    expect(body).toContain('Cycle failed');
    expect(body).toContain('Balanced');
    expect(body).toContain('0.5');
    expect(body).toContain('cycle-runtime-1');
    expect(body).toContain('failed');
    expect(body).toContain('data-testid="efficient-runtime-failed-cycles">1');
    expect(body).not.toContain('Blocked by planner');
    expect(body).not.toContain('Actionable runtime blockers');
    expect(body).not.toContain('Trading rules are unavailable');
    expect(body).toContain('maker-main');
    expect(body).toContain('taker-alt');
    expect(body).toContain('taker IOC rejected');
  });

  it('renders newest cycles first and still selects cycle 10 as latest runtime cycle', () => {
    const { body } = render(RuntimeCyclePanel, {
      props: {
        data: {
          ...baseStatus,
          cycles: [
            {
              cycleId: 'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
              aggregateStatus: 'completed',
              failureReason: null,
              legs: [],
            },
            {
              cycleId: 'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
              aggregateStatus: 'partial',
              failureReason: null,
              legs: [],
            },
          ],
        },
        warnings: [],
      },
    });

    const cycle9Position = body.indexOf(
      'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
    );
    const cycle10Position = body.indexOf(
      'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
    );
    const cycle10ListPosition = body.lastIndexOf(
      'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
    );

    expect(body).toContain('cycle 10');
    expect(body).toContain('title="efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z"');
    expect(body).toContain('completed');
    expect(cycle9Position).toBeGreaterThanOrEqual(0);
    expect(cycle10Position).toBeGreaterThanOrEqual(0);
    expect(cycle10ListPosition).toBeLessThan(cycle9Position);
  });
});
