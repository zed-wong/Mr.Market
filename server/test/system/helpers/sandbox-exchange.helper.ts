/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';

import {
  pollUntil,
  readSystemSandboxConfig,
  SandboxExchangeTestConfig,
} from './sandbox-system.helper';

// Re-export for backward compatibility
export { pollUntil, readSystemSandboxConfig };
export type { SandboxExchangeTestConfig };

type CcxtExchangeClass = new (
  params?: Record<string, unknown>,
) => ccxt.Exchange;
type CcxtExchangeInstance = ccxt.Exchange & {
  close?: () => Promise<void>;
  market?: (symbol: string) => any;
  priceToPrecision?: (symbol: string, price: number) => string;
  amountToPrecision?: (symbol: string, amount: number) => string;
  setSandboxMode?: (enabled: boolean) => void;
};

type TrackedSandboxOrder = {
  exchangeOrderId: string;
  symbol: string;
};

export type SafeTrackedLimitOrderParams = {
  side: 'buy' | 'sell';
  symbol?: string;
  clientOrderId?: string;
  amountMultiplier?: number | string;
  priceDistanceRatio?: number | string;
};

export function buildSandboxClientOrderId(prefix = 'sandbox'): string {
  const safePrefix = prefix
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12);
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const orderId = [safePrefix || 'sandbox', uniqueSuffix].join('-');

  return orderId.slice(0, 36);
}

export async function buildSafeSandboxLimitOrderRequest(
  exchange: CcxtExchangeInstance,
  params: {
    side: 'buy' | 'sell';
    symbol: string;
    amountMultiplier?: number | string;
    priceDistanceRatio?: number | string;
  },
): Promise<{ amount: string; price: string }> {
  const market = getMarketFromExchange(exchange, params.symbol);
  const orderBook = await exchange.fetchOrderBook(params.symbol);
  const referencePrice =
    params.side === 'buy'
      ? orderBook.bids?.[0]?.[0] || orderBook.asks?.[0]?.[0]
      : orderBook.asks?.[0]?.[0] || orderBook.bids?.[0]?.[0];

  if (!referencePrice) {
    throw new Error(`No reference price available for ${params.symbol}`);
  }

  const priceDistanceRatio = new BigNumber(
    params.priceDistanceRatio || (params.side === 'buy' ? '0.8' : '1.2'),
  );
  const rawPrice = new BigNumber(referencePrice).times(priceDistanceRatio);

  if (!rawPrice.isFinite() || rawPrice.lte(0)) {
    throw new Error(`Invalid sandbox order price for ${params.symbol}`);
  }

  const minAmount = new BigNumber(market?.limits?.amount?.min || '0.0001');
  const minCost = new BigNumber(market?.limits?.cost?.min || '0');
  const amountMultiplier = new BigNumber(params.amountMultiplier || '1.2');
  const baseAmount =
    minCost.gt(0) && rawPrice.gt(0)
      ? BigNumber.maximum(minAmount, minCost.div(rawPrice))
      : minAmount;
  const rawAmount = baseAmount.times(amountMultiplier);

  return {
    amount:
      typeof exchange.amountToPrecision === 'function'
        ? exchange.amountToPrecision(params.symbol, rawAmount.toNumber())
        : rawAmount.toFixed(8),
    price:
      typeof exchange.priceToPrecision === 'function'
        ? exchange.priceToPrecision(params.symbol, rawPrice.toNumber())
        : rawPrice.toFixed(8),
  };
}

export class SandboxExchangeHelper {
  private readonly trackedOrders: TrackedSandboxOrder[] = [];
  private readonly config: SandboxExchangeTestConfig;
  private exchange: CcxtExchangeInstance | null = null;

  constructor(
    config: SandboxExchangeTestConfig = readSystemSandboxConfig(),
  ) {
    this.config = config;
  }

  getConfig(): SandboxExchangeTestConfig {
    return this.config;
  }

  async init(): Promise<CcxtExchangeInstance> {
    if (this.exchange) {
      return this.exchange;
    }

    const ExchangeClass = this.resolveExchangeClass(this.config.exchangeId);
    const exchange = new ExchangeClass({
      apiKey: this.config.apiKey,
      secret: this.config.secret,
      password: this.config.password,
      uid: this.config.uid,
      enableRateLimit: false,
    }) as CcxtExchangeInstance;

    if (typeof exchange.setSandboxMode !== 'function') {
      throw new Error(
        `Exchange ${this.config.exchangeId} does not expose setSandboxMode(true)`,
      );
    }

    this.applySandboxExchangeOverrides(exchange);
    exchange.setSandboxMode(true);
    await exchange.loadMarkets();

    this.exchange = exchange;

    return exchange;
  }

  getExchange(): CcxtExchangeInstance {
    if (!this.exchange) {
      throw new Error('Sandbox exchange is not initialized');
    }

    return this.exchange;
  }

  async fetchOrderBook(symbol = this.config.symbol): Promise<ccxt.OrderBook> {
    const exchange = await this.init();

    return await exchange.fetchOrderBook(symbol);
  }

  async placeSafeCleanupAwareLimitOrder(
    params: SafeTrackedLimitOrderParams,
  ): Promise<ccxt.Order> {
    const exchange = await this.init();
    const symbol = params.symbol || this.config.symbol;
    const { amount, price } = await buildSafeSandboxLimitOrderRequest(
      exchange,
      {
        side: params.side,
        symbol,
        amountMultiplier: params.amountMultiplier,
        priceDistanceRatio: params.priceDistanceRatio,
      },
    );
    const order = await exchange.createOrder(
      symbol,
      'limit',
      params.side,
      Number(amount),
      Number(price),
      params.clientOrderId
        ? { clientOrderId: params.clientOrderId }
        : undefined,
    );

    if (order?.id) {
      this.trackedOrders.push({
        exchangeOrderId: String(order.id),
        symbol,
      });
    }

    return order;
  }

  async cancelTrackedOpenOrders(): Promise<void> {
    const exchange = this.exchange;

    if (!exchange) {
      return;
    }

    for (const trackedOrder of [...this.trackedOrders].reverse()) {
      try {
        const order = await exchange.fetchOrder(
          trackedOrder.exchangeOrderId,
          trackedOrder.symbol,
        );
        const status = String(order?.status || '').toLowerCase();

        if (
          status === 'canceled' ||
          status === 'cancelled' ||
          status === 'closed'
        ) {
          continue;
        }

        await exchange.cancelOrder(
          trackedOrder.exchangeOrderId,
          trackedOrder.symbol,
        );
      } catch (error) {
        if (this.isIgnorableCleanupError(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.cancelTrackedOpenOrders();
    } finally {
      const exchange = this.exchange;

      this.exchange = null;

      if (exchange && typeof exchange.close === 'function') {
        await exchange.close();
      }
    }
  }

  private resolveExchangeClass(exchangeId: string): CcxtExchangeClass {
    const ExchangeClass = (ccxt as Record<string, unknown>)[exchangeId];

    if (typeof ExchangeClass !== 'function') {
      throw new Error(`Unknown CCXT exchange class "${exchangeId}"`);
    }

    return ExchangeClass as CcxtExchangeClass;
  }

  private applySandboxExchangeOverrides(exchange: CcxtExchangeInstance): void {
    if (this.config.exchangeId !== 'binance') {
      return;
    }

    const existingOptions =
      exchange.options && typeof exchange.options === 'object'
        ? exchange.options
        : {};

    exchange.options = {
      ...existingOptions,
      defaultType: 'spot',
    };
  }

  private isIgnorableCleanupError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : String(error || '');

    return (
      /order.*not found/i.test(message) ||
      /unknown order/i.test(message) ||
      /already closed/i.test(message) ||
      /already cancelled/i.test(message) ||
      /already canceled/i.test(message)
    );
  }
}

function getMarketFromExchange(
  exchange: CcxtExchangeInstance,
  symbol: string,
): any {
  if (typeof exchange.market === 'function') {
    return exchange.market(symbol);
  }

  const markets = exchange.markets as Record<string, any> | undefined;

  return markets?.[symbol];
}
