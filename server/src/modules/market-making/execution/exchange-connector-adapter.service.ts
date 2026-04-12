/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
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
  private readonly queueByExchange = new Map<
    string,
    Array<{
      priority: number;
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
      costMin?: number;
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
    return await this.withRateLimit(exchangeName, 'write', async () => {
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
    });
  }

  async cancelOrder(
    exchangeName: string,
    pair: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, 'write', async () => {
      const exchange = this.exchangeInitService.getExchange(
        exchangeName,
        accountLabel,
      );

      return await exchange.cancelOrder(exchangeOrderId, pair);
    });
  }

  async fetchOrder(
    exchangeName: string,
    pair: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, 'stateRead', async () => {
      const exchange = this.exchangeInitService.getExchange(
        exchangeName,
        accountLabel,
      );

      return await exchange.fetchOrder(exchangeOrderId, pair);
    });
  }

  async fetchOpenOrders(
    exchangeName: string,
    pair?: string,
    accountLabel?: string,
  ): Promise<any[]> {
    return await this.withRateLimit(exchangeName, 'stateRead', async () => {
      const exchange = this.exchangeInitService.getExchange(
        exchangeName,
        accountLabel,
      );

      return await exchange.fetchOpenOrders(pair);
    });
  }

  async fetchOrderBook(exchangeName: string, pair: string): Promise<any> {
    return await this.withRateLimit(exchangeName, 'marketRead', async () => {
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
    });
  }

  async watchOrderBook(exchangeName: string, pair: string): Promise<any> {
    const exchange = this.exchangeInitService.getExchange(exchangeName);

    if (typeof exchange.watchOrderBook !== 'function') {
      return null;
    }

    return await exchange.watchOrderBook(pair);
  }

  async watchBalance(exchangeName: string): Promise<any> {
    const exchange = this.exchangeInitService.getExchange(exchangeName);

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
    costMin?: number;
    makerFee?: number;
  }> {
    const key = this.toMarketKey(exchangeName, pair);
    const cached = this.marketRulesByKey.get(key);

    if (cached) {
      return cached;
    }

    return await this.withRateLimit(exchangeName, 'marketRead', async () => {
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
        costMin: this.toFiniteNumber(market?.limits?.cost?.min),
        makerFee: this.toFiniteNumber(
          market?.maker || exchange?.fees?.trading?.maker,
        ),
      };

      this.marketRulesByKey.set(key, rules);

      return rules;
    });
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
    return await this.withRateLimit(exchangeName, 'stateRead', async () => {
      const exchange = this.exchangeInitService.getExchange(
        exchangeName,
        accountLabel,
      );

      return await exchange.fetchBalance();
    });
  }

  private async withRateLimit<T>(
    exchangeName: string,
    requestKind: keyof typeof ExchangeConnectorAdapterService.REQUEST_PRIORITY_BY_KIND,
    work: () => Promise<T>,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const queue = this.queueByExchange.get(exchangeName) || [];

      queue.push({
        priority:
          ExchangeConnectorAdapterService.REQUEST_PRIORITY_BY_KIND[requestKind],
        work: work as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      queue.sort((a, b) => a.priority - b.priority);
      this.queueByExchange.set(exchangeName, queue);
      void this.drainQueue(exchangeName);
    });
  }

  private async drainQueue(exchangeName: string): Promise<void> {
    if (this.drainingExchanges.has(exchangeName)) {
      return;
    }

    this.drainingExchanges.add(exchangeName);

    try {
      while (true) {
        const queue = this.queueByExchange.get(exchangeName) || [];
        const next = queue.shift();

        if (!next) {
          this.queueByExchange.delete(exchangeName);

          return;
        }

        this.queueByExchange.set(exchangeName, queue);

        try {
          const lastAt = this.lastRequestAtMsByExchange.get(exchangeName) || 0;
          const now = Date.now();
          const waitMs = Math.max(
            0,
            this.minRequestIntervalMs - (now - lastAt),
          );

          if (waitMs > 0) {
            await this.sleep(waitMs);
          }

          const result = await next.work();

          this.lastRequestAtMsByExchange.set(exchangeName, Date.now());
          next.resolve(result);
        } catch (error) {
          this.lastRequestAtMsByExchange.set(exchangeName, Date.now());
          next.reject(error);
        }
      }
    } finally {
      this.drainingExchanges.delete(exchangeName);
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toMarketKey(exchangeName: string, pair: string): string {
    return `${exchangeName}:${pair}`;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
