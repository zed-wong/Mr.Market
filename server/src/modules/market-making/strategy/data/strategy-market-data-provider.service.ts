import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import BigNumber from 'bignumber.js';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketdataService } from '../../../data/market-data/market-data.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import {
  MidPriceSample,
  OrderBookTrackerService,
} from '../../trackers/order-book-tracker.service';

type BookLevel = [number, number];
type CachedPrice = { price: number; ts: number };
type TrackedReferencePriceSnapshot = {
  price: number;
  sourceType: PriceSourceType;
  ageMs: number | null;
};
export type AdaptivePmmStaleStatus =
  | 'missing'
  | 'fresh'
  | 'soft_stale'
  | 'hard_stale';
export type AdaptivePmmSignalSnapshotOptions = {
  priceSourceType?: PriceSourceType;
  sigmaWindowMs?: number;
  staleSoftMs?: number;
  staleHardMs?: number;
  imbalanceDepthLevels?: number;
  marketCrashWindowMs?: number;
  marketCrashBps?: number;
};
export type AdaptivePmmSignalSnapshot = {
  exchangeName: string;
  pair: string;
  asOfMs: number;
  referencePrice: TrackedReferencePriceSnapshot | null;
  microprice: number | null;
  imbalance: number | null;
  realizedVolatility: number | null;
  midPriceHistory: MidPriceSample[];
  freshness: {
    status: AdaptivePmmStaleStatus;
    ageMs: number | null;
    staleSoftMs: number;
    staleHardMs: number;
  };
  crash: {
    crashed: boolean;
    changeBps: number | null;
    windowMs: number;
    thresholdBps: number | null;
  };
  unavailableReasons: string[];
};

@Injectable()
export class StrategyMarketDataProviderService {
  private readonly logger = new CustomLogger(
    StrategyMarketDataProviderService.name,
  );
  private readonly priceCache = new Map<string, CachedPrice>();
  private readonly priceCacheTtlMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly orderBookTrackerService: OrderBookTrackerService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    private readonly marketdataService: MarketdataService,
  ) {
    this.priceCacheTtlMs = Math.max(
      0,
      Number(this.configService.get('strategy.price_cache_ttl_ms', 0)),
    );
  }

  async getReferencePrice(
    exchangeName: string,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    const normalizedPriceSourceType =
      this.normalizePriceSourceType(priceSourceType);
    const cacheKey = `${exchangeName}:${pair}:${normalizedPriceSourceType}`;
    const cached =
      this.priceCacheTtlMs > 0 ? this.priceCache.get(cacheKey) : undefined;

    if (cached && Date.now() - cached.ts < this.priceCacheTtlMs) {
      return cached.price;
    }

    const price = await this.fetchReferencePrice(
      exchangeName,
      pair,
      normalizedPriceSourceType,
    );

    if (this.priceCacheTtlMs > 0) {
      this.priceCache.set(cacheKey, { price, ts: Date.now() });
    }

    return price;
  }

  private async fetchReferencePrice(
    exchangeName: string,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    const allowTickerFallback = priceSourceType === PriceSourceType.LAST_PRICE;
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

      this.logger.warn(
        `Tracked order book unusable for ${exchangeName} ${pair} (${priceSourceType})`,
      );
    } else {
      this.logger.warn(
        `Tracked order book miss for ${exchangeName} ${pair} (${priceSourceType})`,
      );
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

      this.logger.warn(
        `fetchOrderBook returned unusable book for ${exchangeName} ${pair} (${priceSourceType})`,
      );
    } catch (error) {
      this.logger.warn(
        `fetchOrderBook failed for ${exchangeName} ${pair} (${priceSourceType}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!allowTickerFallback) {
      throw new Error(
        `no usable order book for ${exchangeName} ${pair} (${priceSourceType})`,
      );
    }

    this.logger.warn(
      `Falling back to ticker for ${exchangeName} ${pair} (${priceSourceType})`,
    );
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
    const tracked = this.getTrackedBestBidAsk(exchangeName, pair);

    if (tracked) {
      return tracked;
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

  getTrackedBestBidAsk(
    exchangeName: string,
    pair: string,
  ): { bestBid: number; bestAsk: number } | null {
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

    return null;
  }

  getTrackedReferencePriceSnapshot(
    exchangeName: string,
    pair: string,
    priceSourceType: PriceSourceType,
    maxAgeMs?: number,
  ): TrackedReferencePriceSnapshot | null {
    const normalizedPriceSourceType =
      this.normalizePriceSourceType(priceSourceType);
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (!tracked) {
      return null;
    }

    const lastUpdateAt = this.orderBookTrackerService.getLastUpdateAt(
      exchangeName,
      pair,
    );
    const ageMs = lastUpdateAt === undefined ? null : Date.now() - lastUpdateAt;

    if (maxAgeMs !== undefined && (ageMs === null || ageMs > maxAgeMs)) {
      return null;
    }

    const price = this.pickPriceFromOrderBook(
      tracked.bids,
      tracked.asks,
      normalizedPriceSourceType,
    );

    if (price === undefined) {
      return null;
    }

    return {
      price,
      sourceType: normalizedPriceSourceType,
      ageMs,
    };
  }

  getAdaptivePmmSignalSnapshot(
    exchangeName: string,
    pair: string,
    options: AdaptivePmmSignalSnapshotOptions = {},
  ): AdaptivePmmSignalSnapshot {
    const asOfMs = Date.now();
    const staleSoftMs = this.toNonNegativeNumber(options.staleSoftMs, 2000);
    const staleHardMs = Math.max(
      staleSoftMs,
      this.toNonNegativeNumber(options.staleHardMs, 10000),
    );
    const sigmaWindowMs = this.toNonNegativeNumber(
      options.sigmaWindowMs,
      60_000,
    );
    const imbalanceDepthLevels = Math.max(
      1,
      Math.floor(this.toNonNegativeNumber(options.imbalanceDepthLevels, 1)),
    );
    const priceSourceType = this.normalizePriceSourceType(
      options.priceSourceType || PriceSourceType.MID_PRICE,
    );
    const freshness = this.getAdaptivePmmFreshness(
      exchangeName,
      pair,
      staleSoftMs,
      staleHardMs,
      asOfMs,
    );
    const referencePrice = this.getTrackedReferencePriceSnapshot(
      exchangeName,
      pair,
      priceSourceType,
      staleHardMs,
    );
    const midPriceHistory = this.getTrackedMidPriceHistory(
      exchangeName,
      pair,
      sigmaWindowMs,
    );
    const crashWindowMs = this.toNonNegativeNumber(
      options.marketCrashWindowMs,
      60_000,
    );
    const crashThresholdBps =
      options.marketCrashBps === undefined
        ? null
        : this.toNonNegativeNumber(options.marketCrashBps, 0);
    const crash = this.getMarketCrashSignal(
      exchangeName,
      pair,
      crashWindowMs,
      crashThresholdBps,
    );
    const unavailableReasons: string[] = [];

    if (freshness.status === 'missing') {
      unavailableReasons.push('missing_order_book');
    }
    if (freshness.status === 'soft_stale') {
      unavailableReasons.push('soft_stale_order_book');
    }
    if (freshness.status === 'hard_stale') {
      unavailableReasons.push('hard_stale_order_book');
    }
    if (!referencePrice) {
      unavailableReasons.push('missing_reference_price');
    }
    if (crash.crashed) {
      unavailableReasons.push('market_crash');
    }

    return {
      exchangeName,
      pair,
      asOfMs,
      referencePrice,
      microprice: this.getTrackedMicroprice(exchangeName, pair),
      imbalance: this.getTrackedOrderBookImbalance(
        exchangeName,
        pair,
        imbalanceDepthLevels,
      ),
      realizedVolatility: this.getRealizedVolatility(
        exchangeName,
        pair,
        sigmaWindowMs,
      ),
      midPriceHistory,
      freshness,
      crash,
      unavailableReasons,
    };
  }

  getTrackedMidPriceHistory(
    exchangeName: string,
    pair: string,
    windowMs: number,
  ): MidPriceSample[] {
    return this.orderBookTrackerService.getMidPriceHistory(
      exchangeName,
      pair,
      windowMs,
    );
  }

  getTrackedMicroprice(exchangeName: string, pair: string): number | null {
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (!tracked) {
      return null;
    }

    const bestBidPrice = this.toPositiveNumber(tracked.bids?.[0]?.[0]);
    const bestBidSize = this.toPositiveNumber(tracked.bids?.[0]?.[1]);
    const bestAskPrice = this.toPositiveNumber(tracked.asks?.[0]?.[0]);
    const bestAskSize = this.toPositiveNumber(tracked.asks?.[0]?.[1]);

    if (
      bestBidPrice === undefined ||
      bestBidSize === undefined ||
      bestAskPrice === undefined ||
      bestAskSize === undefined
    ) {
      return null;
    }

    const totalSize = new BigNumber(bestBidSize).plus(bestAskSize);

    if (totalSize.isLessThanOrEqualTo(0)) {
      return null;
    }

    return new BigNumber(bestBidPrice)
      .multipliedBy(bestAskSize)
      .plus(new BigNumber(bestAskPrice).multipliedBy(bestBidSize))
      .dividedBy(totalSize)
      .toNumber();
  }

  getTrackedOrderBookImbalance(
    exchangeName: string,
    pair: string,
    depth: number,
  ): number | null {
    const tracked = this.orderBookTrackerService.getOrderBook(
      exchangeName,
      pair,
    );

    if (!tracked) {
      return null;
    }

    const normalizedDepth = Math.max(1, Math.floor(Number(depth || 0)));
    const bidNotional = this.sumBookNotional(tracked.bids, normalizedDepth);
    const askNotional = this.sumBookNotional(tracked.asks, normalizedDepth);
    const totalNotional = bidNotional.plus(askNotional);

    if (totalNotional.isLessThanOrEqualTo(0)) {
      return null;
    }

    return bidNotional.minus(askNotional).dividedBy(totalNotional).toNumber();
  }

  getRealizedVolatility(
    exchangeName: string,
    pair: string,
    windowMs: number,
  ): number | null {
    const history = this.getTrackedMidPriceHistory(exchangeName, pair, windowMs)
      .filter((sample) => this.toPositiveNumber(sample.price) !== undefined)
      .sort((left, right) => left.ts - right.ts);

    if (history.length < 2) {
      return null;
    }

    const returns: BigNumber[] = [];

    for (let index = 1; index < history.length; index += 1) {
      const previous = new BigNumber(history[index - 1].price);
      const current = new BigNumber(history[index].price);

      if (previous.isLessThanOrEqualTo(0) || current.isLessThanOrEqualTo(0)) {
        continue;
      }

      returns.push(
        new BigNumber(Math.log(current.dividedBy(previous).toNumber())),
      );
    }

    if (returns.length === 0) {
      return null;
    }

    const mean = returns
      .reduce((sum, value) => sum.plus(value), new BigNumber(0))
      .dividedBy(returns.length);
    const variance = returns
      .reduce(
        (sum, value) => sum.plus(value.minus(mean).pow(2)),
        new BigNumber(0),
      )
      .dividedBy(returns.length);

    return Math.sqrt(variance.toNumber());
  }

  hasTrackedOrderBook(exchangeName: string, pair: string): boolean {
    return this.getTrackedBestBidAsk(exchangeName, pair) !== null;
  }

  getTrackedOrderBookFreshness(
    exchangeName: string,
    pair: string,
    maxAgeMs: number,
  ): {
    fresh: boolean;
    ageMs: number | null;
    freshnessTimestamp: string | null;
  } {
    const lastUpdateAt = this.orderBookTrackerService.getLastUpdateAt(
      exchangeName,
      pair,
    );

    if (lastUpdateAt === undefined) {
      return {
        fresh: false,
        ageMs: null,
        freshnessTimestamp: null,
      };
    }

    const ageMs = Date.now() - lastUpdateAt;

    return {
      fresh: ageMs <= maxAgeMs && this.hasTrackedOrderBook(exchangeName, pair),
      ageMs,
      freshnessTimestamp: new Date(lastUpdateAt).toISOString(),
    };
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
    const normalizedPriceSourceType =
      this.normalizePriceSourceType(priceSourceType);
    const bestBid = this.toPositiveNumber(bids?.[0]?.[0]);
    const bestAsk = this.toPositiveNumber(asks?.[0]?.[0]);

    if (normalizedPriceSourceType === PriceSourceType.MID_PRICE) {
      if (bestBid !== undefined && bestAsk !== undefined) {
        return new BigNumber(bestBid).plus(bestAsk).dividedBy(2).toNumber();
      }

      return undefined;
    }

    if (normalizedPriceSourceType === PriceSourceType.MICROPRICE) {
      const bestBidSize = this.toPositiveNumber(bids?.[0]?.[1]);
      const bestAskSize = this.toPositiveNumber(asks?.[0]?.[1]);

      if (
        bestBid !== undefined &&
        bestBidSize !== undefined &&
        bestAsk !== undefined &&
        bestAskSize !== undefined
      ) {
        const totalSize = new BigNumber(bestBidSize).plus(bestAskSize);

        if (totalSize.isGreaterThan(0)) {
          return new BigNumber(bestBid)
            .multipliedBy(bestAskSize)
            .plus(new BigNumber(bestAsk).multipliedBy(bestBidSize))
            .dividedBy(totalSize)
            .toNumber();
        }
      }

      return undefined;
    }

    if (normalizedPriceSourceType === PriceSourceType.BEST_BID) {
      return bestBid;
    }

    if (normalizedPriceSourceType === PriceSourceType.BEST_ASK) {
      return bestAsk;
    }

    if (normalizedPriceSourceType === PriceSourceType.LAST_PRICE) {
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

  private toNonNegativeNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private getAdaptivePmmFreshness(
    exchangeName: string,
    pair: string,
    staleSoftMs: number,
    staleHardMs: number,
    asOfMs: number,
  ): AdaptivePmmSignalSnapshot['freshness'] {
    const lastUpdateAt = this.orderBookTrackerService.getLastUpdateAt(
      exchangeName,
      pair,
    );

    if (
      lastUpdateAt === undefined ||
      !this.hasTrackedOrderBook(exchangeName, pair)
    ) {
      return {
        status: 'missing',
        ageMs: null,
        staleSoftMs,
        staleHardMs,
      };
    }

    const ageMs = Math.max(0, asOfMs - lastUpdateAt);

    if (ageMs >= staleHardMs) {
      return {
        status: 'hard_stale',
        ageMs,
        staleSoftMs,
        staleHardMs,
      };
    }

    if (ageMs >= staleSoftMs) {
      return {
        status: 'soft_stale',
        ageMs,
        staleSoftMs,
        staleHardMs,
      };
    }

    return {
      status: 'fresh',
      ageMs,
      staleSoftMs,
      staleHardMs,
    };
  }

  private getMarketCrashSignal(
    exchangeName: string,
    pair: string,
    windowMs: number,
    thresholdBps: number | null,
  ): AdaptivePmmSignalSnapshot['crash'] {
    const history = this.getTrackedMidPriceHistory(exchangeName, pair, windowMs)
      .filter((sample) => this.toPositiveNumber(sample.price) !== undefined)
      .sort((left, right) => left.ts - right.ts);

    if (thresholdBps === null || history.length < 2) {
      return {
        crashed: false,
        changeBps: null,
        windowMs,
        thresholdBps,
      };
    }

    const firstPrice = new BigNumber(history[0].price);
    const lastPrice = new BigNumber(history[history.length - 1].price);

    if (firstPrice.isLessThanOrEqualTo(0)) {
      return {
        crashed: false,
        changeBps: null,
        windowMs,
        thresholdBps,
      };
    }

    const changeBps = lastPrice
      .minus(firstPrice)
      .dividedBy(firstPrice)
      .multipliedBy(10_000)
      .toNumber();

    return {
      crashed: Math.abs(changeBps) >= thresholdBps,
      changeBps,
      windowMs,
      thresholdBps,
    };
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

  private sumBookNotional(
    levels: BookLevel[] | undefined,
    depth: number,
  ): BigNumber {
    return this.asBookLevels(levels)
      .slice(0, depth)
      .reduce((sum, [price, size]) => {
        const normalizedPrice = this.toPositiveNumber(price);
        const normalizedSize = this.toPositiveNumber(size);

        if (normalizedPrice === undefined || normalizedSize === undefined) {
          return sum;
        }

        return sum.plus(
          new BigNumber(normalizedPrice).multipliedBy(normalizedSize),
        );
      }, new BigNumber(0));
  }

  private normalizePriceSourceType(value: unknown): PriceSourceType {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();

    if (normalized === 'mid_price' || normalized === 'midprice') {
      return PriceSourceType.MID_PRICE;
    }

    if (normalized === 'microprice' || normalized === 'micro_price') {
      return PriceSourceType.MICROPRICE;
    }

    if (normalized === 'best_bid' || normalized === 'bestbid') {
      return PriceSourceType.BEST_BID;
    }

    if (normalized === 'best_ask' || normalized === 'bestask') {
      return PriceSourceType.BEST_ASK;
    }

    if (normalized === 'last_price' || normalized === 'lastprice') {
      return PriceSourceType.LAST_PRICE;
    }

    return value as PriceSourceType;
  }
}
