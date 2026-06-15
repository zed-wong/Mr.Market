import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import "../../../../i18n/i18n";
import type {
  DirectOrderStatus,
  DirectOrderSummary,
} from "$lib/types/hufi/admin-direct-market-making";
import type { OrderPerformance } from "$lib/types/hufi/order-performance";
import OrderPerformanceDialog from "./OrderPerformanceDialog.svelte";
import OrderConfigDialog from "./OrderConfigDialog.svelte";
import OrderRoutingDialog from "./OrderRoutingDialog.svelte";
import OrderErrorsDialog from "./OrderErrorsDialog.svelte";
import OrderDetailsDialog from "./OrderDetailsDialog.svelte";

const noop = () => {};

const baseOrder: DirectOrderSummary = {
  orderId: "order-detail-1",
  exchangeName: "binance",
  pair: "BTC/USDT",
  state: "running",
  runtimeState: "running",
  strategyName: "Pure Market Making",
  controllerType: "pureMarketMaking",
  directExecutionMode: "single_account",
  createdAt: "2026-06-08T00:00:00.000Z",
  lastTickAt: "2026-06-08T00:00:05.000Z",
  accountLabel: "main",
  makerAccountLabel: "maker",
  takerAccountLabel: "taker",
  apiKeyId: "key-1",
  makerApiKeyId: null,
  takerApiKeyId: null,
  warnings: [],
};

const baseStatus: DirectOrderStatus = {
  orderId: "order-detail-1",
  state: "running",
  runtimeState: "running",
  controllerType: "pureMarketMaking",
  directExecutionMode: "single_account",
  accountLabel: "main",
  makerAccountLabel: "maker",
  takerAccountLabel: "taker",
  makerAccountName: "maker-main",
  takerAccountName: "taker-alt",
  apiKeyId: "key-1",
  makerApiKeyId: null,
  takerApiKeyId: null,
  executorHealth: "active",
  lastTickAt: "2026-06-08T00:00:05.000Z",
  lastUpdatedAt: "2026-06-08T00:00:10.000Z",
  privateStreamEventAt: null,
  openOrders: [],
  intents: [],
  fillCount1h: 3,
  recentErrors: [],
  orderConfig: {
    mode: null,
    orderAmount: "0.25",
    bidSpread: "0.001",
    askSpread: "0.002",
    numberOfLayers: "2",
    baseIntervalTime: 30,
    numTrades: null,
    baseIncrementPercentage: null,
    pricePushRate: null,
    postOnlySide: null,
    dynamicRoleSwitching: false,
    targetQuoteVolume: null,
    cadenceVariance: null,
    tradeAmountVariance: null,
    priceOffsetVariance: null,
    publishedCycles: null,
    completedCycles: null,
    tradedQuoteVolume: null,
    realizedPnlQuote: null,
  },
  readiness: null,
  cycles: [],
  spread: { bid: "0.001", ask: "0.002", absolute: "0.003" },
  inventoryBalances: [
    { asset: "BTC", free: "1", used: "0", total: "1" },
    { asset: "USDT", free: "1000", used: "0", total: "1000" },
  ],
  stale: false,
};

const basePerformance: OrderPerformance = {
  series: [],
  summary: {
    realizedPnlQuote: "12.5",
    feesQuote: "1.25",
    netPnlQuote: "11.25",
    tradedQuoteVolume: "5000",
    effectiveSpreadBps: "3.4",
    fillCount: 10,
    otherFees: [],
  },
};

const stoppedEfficientOrder: DirectOrderSummary = {
  ...baseOrder,
  state: "stopped",
  runtimeState: "stopped",
  controllerType: "efficientDualAccountVolume",
  directExecutionMode: "dual_account",
  strategyName: "Efficient Dual Account Volume",
};

const stoppedEfficientStatus: DirectOrderStatus = {
  ...baseStatus,
  state: "stopped",
  runtimeState: "stopped",
  controllerType: "efficientDualAccountVolume",
  directExecutionMode: "dual_account",
  readiness: null,
  cycles: [],
};

describe("Order detail sub-dialogs", () => {
  it("renders performance metrics with a back affordance", () => {
    const { body } = render(OrderPerformanceDialog, {
      props: {
        order: baseOrder,
        performance: basePerformance,
        onBack: noop,
        onClose: noop,
      },
    });

    expect(body).toContain("Performance");
    expect(body).toContain("Back to overview");
    expect(body).toContain("11.25 USDT");
    expect(body).toContain("5,000 USDT");
  });

  it("renders known-strategy order config", () => {
    const { body } = render(OrderConfigDialog, {
      props: {
        data: baseStatus,
        isDualAccountStrategy: false,
        isBestCapacityStrategy: false,
        isKnownStrategy: true,
        onBack: noop,
        onClose: noop,
      },
    });

    expect(body).toContain("Order Config");
    expect(body).toContain("0.25");
  });

  it("renders single-account routing", () => {
    const { body } = render(OrderRoutingDialog, {
      props: {
        order: baseOrder,
        data: baseStatus,
        isDualAccountStrategy: false,
        onBack: noop,
        onClose: noop,
      },
    });

    expect(body).toContain("Account &amp; Balance");
    expect(body).toContain("main");
    expect(body).toContain("BTC");
    expect(body).toContain("USDT");
  });

  it("renders dual-account routing with balances", () => {
    const { body } = render(OrderRoutingDialog, {
      props: {
        order: baseOrder,
        data: {
          ...stoppedEfficientStatus,
          makerAccountLabel: "4",
          takerAccountLabel: "8",
          makerAccountName: "maker-main",
          takerAccountName: "taker-alt",
          inventoryBalances: [
            {
              accountLabel: "maker",
              asset: "BTC",
              free: "0.5",
              used: "0",
              total: "0.5",
            },
            {
              accountLabel: "taker",
              asset: "USDT",
              free: "500",
              used: "0",
              total: "500",
            },
          ],
          cycles: [
            {
              cycleId: "efficient-dual-account-volume:cycle:1:2026-06-08T00:00:00.000Z",
              aggregateStatus: "completed",
              failureReason: null,
              legs: [],
            },
          ],
        },
        isDualAccountStrategy: true,
        onBack: noop,
        onClose: noop,
      },
    });

    expect(body).toContain("Account &amp; Balance");
    expect(body).toContain("maker-main");
    expect(body).toContain("taker-alt");
    expect(body).toContain("Maker Balances");
    expect(body).toContain("Taker Balances");
    expect(body).not.toContain("Efficient Volume runtime cycles");
  });

  it("renders the empty state when there are no recent errors", () => {
    const { body } = render(OrderErrorsDialog, {
      props: { recentErrors: [], onBack: noop, onClose: noop },
    });

    expect(body).toContain("Recent Errors");
    expect(body).toContain("No recent errors");
  });

  it("keeps efficient resume actionable when readiness blocks immediate trading", () => {
    const { body } = render(OrderDetailsDialog, {
      props: {
        show: true,
        order: stoppedEfficientOrder,
        data: stoppedEfficientStatus,
        performance: basePerformance,
        loading: false,
        refreshing: false,
        error: null,
        onClose: noop,
        onRefresh: noop,
        onStartOrder: noop,
        onStopOrder: noop,
        onRemoveOrder: noop,
      },
    });

    expect(body).toContain("Resume Order");
    expect(body).not.toContain('aria-disabled="true"');
    expect(body).not.toContain("Resolve planner readiness blockers before resuming.");
    expect(body).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)[^>]*>[\s\S]*Resume Order/);
  });
});
