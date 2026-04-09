/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

@Injectable()
export class ExchangeConnectorAdapterService {
  private readonly logger = new CustomLogger(
    ExchangeConnectorAdapterService.name,
  );
  private readonly lastRequestAtMsByExchange = new Map<string, number>();
  private readonly requestChainByExchange = new Map<string, Promise<void>>();
  private readonly minRequestIntervalMs: number;
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
    options?: { postOnly?: boolean },
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);
      const params = {
        ...(clientOrderId ? { clientOrderId } : {}),
        ...(options?.postOnly ? { postOnly: true } : {}),
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
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

      return await exchange.cancelOrder(exchangeOrderId, pair);
    });
  }

  async fetchOrder(
    exchangeName: string,
    pair: string,
    exchangeOrderId: string,
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

      return await exchange.fetchOrder(exchangeOrderId, pair);
    });
  }

  async fetchOpenOrders(exchangeName: string, pair?: string): Promise<any[]> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

      return await exchange.fetchOpenOrders(pair);
    });
  }

  async fetchOrderBook(exchangeName: string, pair: string): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
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

    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

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
  ): { qty: string; price: string } {
    const exchange = this.exchangeInitService.getExchange(exchangeName);
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

  async fetchBalance(exchangeName: string): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

      return await exchange.fetchBalance();
    });
  }

  private async withRateLimit<T>(
    exchangeName: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previousChain =
      this.requestChainByExchange.get(exchangeName) || Promise.resolve();
    let releaseCurrentChain!: () => void;
    const currentChain = new Promise<void>((resolve) => {
      releaseCurrentChain = resolve;
    });
    const chainedRequests = previousChain.then(async () => await currentChain);

    this.requestChainByExchange.set(exchangeName, chainedRequests);

    await previousChain;

    try {
      const lastAt = this.lastRequestAtMsByExchange.get(exchangeName) || 0;
      const now = Date.now();
      const waitMs = Math.max(0, this.minRequestIntervalMs - (now - lastAt));

      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      const result = await work();

      this.lastRequestAtMsByExchange.set(exchangeName, Date.now());

      return result;
    } finally {
      releaseCurrentChain();

      if (this.requestChainByExchange.get(exchangeName) === chainedRequests) {
        this.requestChainByExchange.delete(exchangeName);
      }
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
