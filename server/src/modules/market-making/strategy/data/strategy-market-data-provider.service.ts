import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { MarketdataService } from '../../../data/market-data/market-data.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { OrderBookTrackerService } from '../../trackers/order-book-tracker.service';

type BookLevel = [number, number];

@Injectable()
export class StrategyMarketDataProviderService {
  constructor(
    private readonly orderBookTrackerService: OrderBookTrackerService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    private readonly marketdataService: MarketdataService,
  ) {}

  async getReferencePrice(
    exchangeName: string,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (tracked) {
      const trackedPrice = this.pickPriceFromOrderBook(
        tracked.bids,
        tracked.asks,
        priceSourceType,
      );

      if (trackedPrice !== undefined) {
        return trackedPrice;
      }
    }

    try {
      const fetchedOrderBook =
        await this.exchangeConnectorAdapterService.fetchOrderBook(
          exchangeName,
          pair,
        );
      const fetchedPrice = this.pickPriceFromOrderBook(
        this.asBookLevels(fetchedOrderBook?.bids),
        this.asBookLevels(fetchedOrderBook?.asks),
        priceSourceType,
      );

      if (fetchedPrice !== undefined) {
        return fetchedPrice;
      }
    } catch {
      // fall through to ticker fallback
    }

    const ticker = await this.marketdataService.getTickerPrice(
      exchangeName,
      pair,
    );
    const fallbackPrice =
      this.toPositiveNumber(ticker?.last) ??
      this.toPositiveNumber(ticker?.bid) ??
      this.toPositiveNumber(ticker?.ask);

    if (fallbackPrice !== undefined) {
      return fallbackPrice;
    }

    throw new Error('no usable price from tracker, order book, or ticker');
  }

  async getBestBidAsk(
    exchangeName: string,
    pair: string,
  ): Promise<{ bestBid: number; bestAsk: number }> {
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (tracked) {
      const trackedBestBid = this.toPositiveNumber(tracked.bids?.[0]?.[0]);
      const trackedBestAsk = this.toPositiveNumber(tracked.asks?.[0]?.[0]);

      if (trackedBestBid !== undefined && trackedBestAsk !== undefined) {
        return { bestBid: trackedBestBid, bestAsk: trackedBestAsk };
      }
    }

    try {
      const fetchedOrderBook =
        await this.exchangeConnectorAdapterService.fetchOrderBook(
          exchangeName,
          pair,
        );
      const bestBid = this.toPositiveNumber(fetchedOrderBook?.bids?.[0]?.[0]);
      const bestAsk = this.toPositiveNumber(fetchedOrderBook?.asks?.[0]?.[0]);

      if (bestBid !== undefined && bestAsk !== undefined) {
        return { bestBid, bestAsk };
      }
    } catch {
      // fall through to ticker fallback
    }

    const ticker = await this.marketdataService.getTickerPrice(
      exchangeName,
      pair,
    );
    const tickerBid = this.toPositiveNumber(ticker?.bid);
    const tickerAsk = this.toPositiveNumber(ticker?.ask);

    if (tickerBid !== undefined && tickerAsk !== undefined) {
      return { bestBid: tickerBid, bestAsk: tickerAsk };
    }

    const last = this.toPositiveNumber(ticker?.last);

    if (last !== undefined) {
      return { bestBid: last, bestAsk: last };
    }

    throw new Error('no usable bid/ask from tracker, order book, or ticker');
  }

  async getOrderBook(
    exchangeName: string,
    pair: string,
  ): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> {
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (
      tracked &&
      Array.isArray(tracked.bids) &&
      tracked.bids.length > 0 &&
      Array.isArray(tracked.asks) &&
      tracked.asks.length > 0
    ) {
      return {
        bids: this.asBookLevels(tracked.bids),
        asks: this.asBookLevels(tracked.asks),
      };
    }

    const fetchedOrderBook =
      await this.exchangeConnectorAdapterService.fetchOrderBook(
        exchangeName,
        pair,
      );

    return {
      bids: this.asBookLevels(fetchedOrderBook?.bids),
      asks: this.asBookLevels(fetchedOrderBook?.asks),
    };
  }

  private pickPriceFromOrderBook(
    bids: BookLevel[] | undefined,
    asks: BookLevel[] | undefined,
    priceSourceType: PriceSourceType,
  ): number | undefined {
    const bestBid = this.toPositiveNumber(bids?.[0]?.[0]);
    const bestAsk = this.toPositiveNumber(asks?.[0]?.[0]);

    if (priceSourceType === PriceSourceType.MID_PRICE) {
      if (bestBid !== undefined && bestAsk !== undefined) {
        return new BigNumber(bestBid).plus(bestAsk).dividedBy(2).toNumber();
      }

      return undefined;
    }

    if (priceSourceType === PriceSourceType.BEST_BID) {
      return bestBid;
    }

    if (priceSourceType === PriceSourceType.BEST_ASK) {
      return bestAsk;
    }

    if (priceSourceType === PriceSourceType.LAST_PRICE) {
      if (bestBid !== undefined && bestAsk !== undefined) {
        return new BigNumber(bestBid).plus(bestAsk).dividedBy(2).toNumber();
      }
    }

    return undefined;
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private asBookLevels(value: unknown): BookLevel[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((level): level is [number, number] => {
        return (
          Array.isArray(level) &&
          level.length >= 2 &&
          Number.isFinite(Number(level[0])) &&
          Number.isFinite(Number(level[1]))
        );
      })
      .map((level) => [Number(level[0]), Number(level[1])]);
  }
}
