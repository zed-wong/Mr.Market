import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

@Injectable()
export class ExchangeConnectorAdapterService {
  private readonly lastRequestAtMsByExchange = new Map<string, number>();
  private readonly minRequestIntervalMs: number;

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
  ): Promise<any> {
    return await this.withRateLimit(exchangeName, async () => {
      const exchange = this.exchangeInitService.getExchange(exchangeName);

      return await exchange.createOrder(
        pair,
        'limit',
        side,
        Number(qty),
        Number(price),
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

      return await exchange.fetchOrderBook(pair);
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

  private async withRateLimit<T>(
    exchangeName: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const lastAt = this.lastRequestAtMsByExchange.get(exchangeName) || 0;
    const now = Date.now();
    const waitMs = Math.max(0, this.minRequestIntervalMs - (now - lastAt));

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    const result = await work();

    this.lastRequestAtMsByExchange.set(exchangeName, Date.now());

    return result;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
