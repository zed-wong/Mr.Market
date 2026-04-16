/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

@Injectable()
export class ExchangeConnectorAdapterService {
  private static readonly REQUEST_PRIORITY_BY_KIND = {
    write: 0,
    stateRead: 1,
    marketRead: 2,
  } as const;

  private readonly logger = new CustomLogger(
    ExchangeConnectorAdapterService.name,
  );
  private readonly lastRequestAtMsByExchange = new Map<string, number>();
  private readonly minRequestIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly queueByExchange = new Map<
    string,
    Array<{
      priority: number;
      label: string;
      work: () => Promise<unknown>;
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }>
  >();
  private readonly drainingExchanges = new Set<string>();
  private readonly marketRulesByKey = new Map<
    string,
    {
      amountMin?: number;
      amountMax?: number;
      costMin?: number;
      costMax?: number;
      makerFee?: number;
    }
  >();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    private readonly configService: ConfigService,
  ) {
    this.minRequestIntervalMs = Number(
      this.configService.get('strategy.exchange_min_request_interval_ms', 200),
    );
    const parsedRequestTimeoutMs = Number(
      this.configService.get('strategy.exchange_request_timeout_ms', 15_000),
    );

    this.requestTimeoutMs =
      Number.isFinite(parsedRequestTimeoutMs) && parsedRequestTimeoutMs > 0
        ? parsedRequestTimeoutMs
        : 15_000;
    if (this.requestTimeoutMs !== parsedRequestTimeoutMs) {
      this.logger.warn(
        `Invalid strategy.exchange_request_timeout_ms value: ${parsedRequestTimeoutMs}. Falling back to ${this.requestTimeoutMs}`,
      );
    }
  }

  async placeLimitOrder(
    exchangeName: string,
    pair: string,
    side: 'buy' | 'sell',
    qty: string,
    price: string,
    clientOrderId?: string,
    options?: { postOnly?: boolean; timeInForce?: 'GTC' | 'IOC' },
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'write',
      `placeLimitOrder ${exchangeName}:${accountLabel || 'default'} ${pair} ${side}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );
        const params = {
          ...(clientOrderId ? { clientOrderId } : {}),
          ...(options?.postOnly ? { postOnly: true } : {}),
          ...(options?.timeInForce ? { timeInForce: options.timeInForce } : {}),
        };

        return await exchange.createOrder(
          pair,
          'limit',
          side,
          Number(qty),
          Number(price),
          Object.keys(params).length > 0 ? params : undefined,
        );
      },
    );
  }

  async cancelOrder(
    exchangeName: string,
    pair: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'write',
      `cancelOrder ${exchangeName}:${accountLabel || 'default'} ${pair}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );

        return await exchange.cancelOrder(exchangeOrderId, pair);
      },
    );
  }

  async fetchOrder(
    exchangeName: string,
    pair: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'stateRead',
      `fetchOrder ${exchangeName}:${accountLabel || 'default'} ${pair}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );

        return await exchange.fetchOrder(exchangeOrderId, pair);
      },
    );
  }

  async fetchOpenOrders(
    exchangeName: string,
    pair?: string,
    accountLabel?: string,
  ): Promise<any[]> {
    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'stateRead',
      `fetchOpenOrders ${exchangeName}:${accountLabel || 'default'} ${pair || 'all'}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );

        return await exchange.fetchOpenOrders(pair);
      },
    );
  }

  async fetchOrderBook(exchangeName: string, pair: string): Promise<any> {
    return await this.withRateLimit(
      exchangeName,
      'marketRead',
      `fetchOrderBook ${pair}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(exchangeName);
        const orderBook = await exchange.fetchOrderBook(pair);

        this.logger.log(
          `fetchOrderBook ${exchange.id || exchangeName} ${pair} bids=${
            Array.isArray(orderBook?.bids) ? orderBook.bids.length : 0
          } asks=${
            Array.isArray(orderBook?.asks) ? orderBook.asks.length : 0
          } topBid=${
            Array.isArray(orderBook?.bids) && orderBook.bids.length > 0
              ? JSON.stringify(orderBook.bids[0])
              : 'null'
          } topAsk=${
            Array.isArray(orderBook?.asks) && orderBook.asks.length > 0
              ? JSON.stringify(orderBook.asks[0])
              : 'null'
          }`,
        );

        return orderBook;
      },
    );
  }

  async watchOrderBook(exchangeName: string, pair: string): Promise<any> {
    const exchange = this.exchangeInitService.getExchange(exchangeName);

    if (typeof exchange.watchOrderBook !== 'function') {
      return null;
    }

    return await exchange.watchOrderBook(pair);
  }

  async watchMyTrades(
    exchangeName: string,
    pair?: string,
    accountLabel?: string,
  ): Promise<any> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );

    if (typeof exchange.watchMyTrades !== 'function') {
      return null;
    }

    return await exchange.watchMyTrades(pair);
  }

  async watchBalance(exchangeName: string, accountLabel?: string): Promise<any> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );

    if (typeof exchange.watchBalance !== 'function') {
      return null;
    }

    return await exchange.watchBalance();
  }

  async loadTradingRules(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
  ): Promise<{
    amountMin?: number;
    amountMax?: number;
    costMin?: number;
    costMax?: number;
    makerFee?: number;
    takerFee?: number;
  }> {
    const key = this.toMarketKey(exchangeName, pair);
    const cached = this.marketRulesByKey.get(key);

    if (cached) {
      return cached;
    }

    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'marketRead',
      `loadTradingRules ${exchangeName}:${accountLabel || 'default'} ${pair}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );

        if (!exchange?.markets || !exchange.markets[pair]) {
          await exchange.loadMarkets();
        }

        const market = exchange?.markets?.[pair] || {};
        const rules = {
          amountMin: this.toFiniteNumber(market?.limits?.amount?.min),
          amountMax: this.toFiniteNumber(market?.limits?.amount?.max),
          costMin: this.toFiniteNumber(market?.limits?.cost?.min),
          costMax: this.toFiniteNumber(market?.limits?.cost?.max),
          makerFee: this.toFiniteNumber(
            market?.maker || exchange?.fees?.trading?.maker,
          ),
          takerFee: this.toFiniteNumber(
            market?.taker || exchange?.fees?.trading?.taker,
          ),
        };

        this.marketRulesByKey.set(key, rules);

        return rules;
      },
    );
  }

  quantizeOrder(
    exchangeName: string,
    pair: string,
    qty: string,
    price: string,
    accountLabel?: string,
  ): { qty: string; price: string } {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );
    const quantizedQty =
      typeof exchange.amountToPrecision === 'function'
        ? exchange.amountToPrecision(pair, Number(qty))
        : qty;
    const quantizedPrice =
      typeof exchange.priceToPrecision === 'function'
        ? exchange.priceToPrecision(pair, Number(price))
        : price;

    return {
      qty: String(quantizedQty),
      price: String(quantizedPrice),
    };
  }

  async fetchBalance(
    exchangeName: string,
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(
      this.toRateLimitKey(exchangeName, accountLabel),
      'stateRead',
      `fetchBalance ${exchangeName}:${accountLabel || 'default'}`,
      async () => {
        const exchange = this.exchangeInitService.getExchange(
          exchangeName,
          accountLabel,
        );

        return await exchange.fetchBalance();
      },
    );
  }

  private async withRateLimit<T>(
    queueKey: string,
    requestKind: keyof typeof ExchangeConnectorAdapterService.REQUEST_PRIORITY_BY_KIND,
    label: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const queue = this.queueByExchange.get(queueKey) || [];

      queue.push({
        priority:
          ExchangeConnectorAdapterService.REQUEST_PRIORITY_BY_KIND[requestKind],
        label,
        work: work as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      queue.sort((a, b) => a.priority - b.priority);
      this.queueByExchange.set(queueKey, queue);
      void this.drainQueue(queueKey);
    });
  }

  private async drainQueue(queueKey: string): Promise<void> {
    if (this.drainingExchanges.has(queueKey)) {
      return;
    }

    this.drainingExchanges.add(queueKey);

    try {
      while (true) {
        const queue = this.queueByExchange.get(queueKey) || [];
        const next = queue.shift();

        if (!next) {
          this.queueByExchange.delete(queueKey);

          return;
        }

        this.queueByExchange.set(queueKey, queue);

        try {
          const lastAt = this.lastRequestAtMsByExchange.get(queueKey) || 0;
          const now = Date.now();
          const waitMs = Math.max(
            0,
            this.minRequestIntervalMs - (now - lastAt),
          );

          if (waitMs > 0) {
            await this.sleep(waitMs);
          }

          const result = await this.withRequestTimeout(
            queueKey,
            next.label,
            next.work,
          );

          this.lastRequestAtMsByExchange.set(queueKey, Date.now());
          next.resolve(result);
        } catch (error) {
          this.lastRequestAtMsByExchange.set(queueKey, Date.now());
          next.reject(error);
        }
      }
    } finally {
      this.drainingExchanges.delete(queueKey);
    }
  }

  private toRateLimitKey(exchangeName: string, accountLabel?: string): string {
    return `${exchangeName}:${accountLabel || 'default'}`;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRequestTimeout<T>(
    exchangeName: string,
    label: string,
    work: () => Promise<T>,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        work(),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            const message = [
              `Exchange request timed out after ${this.requestTimeoutMs}ms`,
              `exchange=${exchangeName}`,
              `request=${label}`,
            ].join(' ');

            this.logger.warn(message);
            reject(new ServiceUnavailableException(message));
          }, this.requestTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private toMarketKey(exchangeName: string, pair: string): string {
    return `${exchangeName}:${pair}`;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
