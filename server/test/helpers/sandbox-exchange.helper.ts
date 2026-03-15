/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';

const REQUIRED_SANDBOX_ENV_VARS = [
  'CCXT_SANDBOX_EXCHANGE',
  'CCXT_SANDBOX_API_KEY',
  'CCXT_SANDBOX_SECRET',
] as const;

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

export type SandboxExchangeTestConfig = {
  exchangeId: string;
  apiKey: string;
  secret: string;
  password?: string;
  uid?: string;
  symbol: string;
  minRequestIntervalMs: number;
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

export function getSandboxIntegrationSkipReason(): string | null {
  const missingEnvVars = REQUIRED_SANDBOX_ENV_VARS.filter(
    (key) => !process.env[key]?.trim(),
  );

  if (missingEnvVars.length === 0) {
    return null;
  }

  return `missing sandbox env vars: ${missingEnvVars.join(', ')}`;
}

export function readSandboxExchangeTestConfig(): SandboxExchangeTestConfig {
  const skipReason = getSandboxIntegrationSkipReason();

  if (skipReason) {
    throw new Error(skipReason);
  }

  const minRequestIntervalMs = Number(
    process.env.CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS || 100,
  );

  return {
    exchangeId: process.env.CCXT_SANDBOX_EXCHANGE!.trim(),
    apiKey: process.env.CCXT_SANDBOX_API_KEY!.trim(),
    secret: process.env.CCXT_SANDBOX_SECRET!.trim(),
    password: process.env.CCXT_SANDBOX_PASSWORD?.trim() || undefined,
    uid: process.env.CCXT_SANDBOX_UID?.trim() || undefined,
    symbol: process.env.CCXT_SANDBOX_SYMBOL?.trim() || 'BTC/USDT',
    minRequestIntervalMs:
      Number.isFinite(minRequestIntervalMs) && minRequestIntervalMs >= 0
        ? minRequestIntervalMs
        : 100,
  };
}

export async function pollUntil<T>(
  work: () => Promise<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    description?: string;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 45000;
  const intervalMs = options?.intervalMs ?? 1000;
  const deadlineAtMs = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadlineAtMs) {
    try {
      const value = await work();

      if (await predicate(value)) {
        return value;
      }

      lastError = null;
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(
    `Timed out waiting for ${options?.description || 'sandbox condition'}`,
  );
}

export class SandboxExchangeHelper {
  private readonly trackedOrders: TrackedSandboxOrder[] = [];
  private readonly config: SandboxExchangeTestConfig;
  private exchange: CcxtExchangeInstance | null = null;

  constructor(
    config: SandboxExchangeTestConfig = readSandboxExchangeTestConfig(),
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
    const market = this.getMarket(symbol);
    const orderBook = await exchange.fetchOrderBook(symbol);
    const referencePrice =
      params.side === 'buy'
        ? orderBook.bids?.[0]?.[0] || orderBook.asks?.[0]?.[0]
        : orderBook.asks?.[0]?.[0] || orderBook.bids?.[0]?.[0];

    if (!referencePrice) {
      throw new Error(`No reference price available for ${symbol}`);
    }

    const priceDistanceRatio = new BigNumber(
      params.priceDistanceRatio || (params.side === 'buy' ? '0.8' : '1.2'),
    );
    const rawPrice = new BigNumber(referencePrice).times(priceDistanceRatio);

    if (!rawPrice.isFinite() || rawPrice.lte(0)) {
      throw new Error(`Invalid sandbox order price for ${symbol}`);
    }

    const minAmount = new BigNumber(market?.limits?.amount?.min || '0.0001');
    const minCost = new BigNumber(market?.limits?.cost?.min || '0');
    const amountMultiplier = new BigNumber(params.amountMultiplier || '1.2');
    const baseAmount =
      minCost.gt(0) && rawPrice.gt(0)
        ? BigNumber.maximum(minAmount, minCost.div(rawPrice))
        : minAmount;
    const rawAmount = baseAmount.times(amountMultiplier);
    const amount =
      typeof exchange.amountToPrecision === 'function'
        ? exchange.amountToPrecision(symbol, rawAmount.toNumber())
        : rawAmount.toFixed(8);
    const price =
      typeof exchange.priceToPrecision === 'function'
        ? exchange.priceToPrecision(symbol, rawPrice.toNumber())
        : rawPrice.toFixed(8);
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
      this.trackedOrders.length = 0;

      if (exchange && typeof exchange.close === 'function') {
        await exchange.close();
      }
    }
  }

  private getMarket(symbol: string): any {
    const exchange = this.getExchange();

    if (typeof exchange.market === 'function') {
      return exchange.market(symbol);
    }

    const markets = (exchange as any).markets || {};
    const market = markets[symbol];

    if (!market) {
      throw new Error(
        `Market ${symbol} is not available on ${this.config.exchangeId}`,
      );
    }

    return market;
  }

  private resolveExchangeClass(exchangeId: string): CcxtExchangeClass {
    const ccxtPro = (ccxt as any).pro || {};
    const ExchangeClass =
      ccxtPro[exchangeId] || ((ccxt as any)[exchangeId] as CcxtExchangeClass);

    if (!ExchangeClass) {
      throw new Error(`Unsupported CCXT exchange ${exchangeId}`);
    }

    return ExchangeClass;
  }

  private applySandboxExchangeOverrides(exchange: CcxtExchangeInstance): void {
    if (this.config.exchangeId !== 'binance') {
      return;
    }

    const exchangeOptions = (exchange as any).options || {};

    (exchange as any).options = {
      ...exchangeOptions,
      defaultType: 'spot',
      fetchMarkets: {
        ...(exchangeOptions.fetchMarkets || {}),
        types: ['spot'],
      },
      fetchOrder: {
        ...(exchangeOptions.fetchOrder || {}),
        defaultType: 'spot',
      },
      fetchOpenOrders: {
        ...(exchangeOptions.fetchOpenOrders || {}),
        defaultType: 'spot',
      },
      cancelOrder: {
        ...(exchangeOptions.cancelOrder || {}),
        defaultType: 'spot',
      },
    };
  }

  private isIgnorableCleanupError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : String(error || 'unknown error');

    return /already canceled|already closed|does not exist|not found|unknown order/i.test(
      message,
    );
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
