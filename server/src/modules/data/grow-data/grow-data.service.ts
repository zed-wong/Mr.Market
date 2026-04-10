import { CACHE_MANAGER } from '@nestjs/cache-manager';
import BigNumber from 'bignumber.js';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { MixinClientService } from 'src/modules/mixin/client/mixin-client.service';

type ExchangeMarketSnapshot = {
  symbol?: string;
  limits?: {
    amount?: {
      min?: number | string | null;
      max?: number | string | null;
    };
    cost?: {
      min?: number | string | null;
    };
  };
  precision?: {
    amount?: number | string | null;
    price?: number | string | null;
  };
};

@Injectable()
export class GrowdataService {
  private readonly logger = new CustomLogger(GrowdataService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly growdataRepository: GrowdataRepository,
    private readonly mixinClientService: MixinClientService,
    private readonly exchangeInitService: ExchangeInitService,
  ) {}

  private cachingTTL = 60; // 1 minute

  async getGrowData() {
    try {
      const exchanges = await this.getAllExchanges();
      const simplyGrowTokens = await this.getAllSimplyGrowTokens();
      const arbitragePairs = await this.getAllArbitragePairs();
      const marketMakingPairs = await this.getAllMarketMakingPairs();

      return {
        exchanges,
        simply_grow: {
          tokens: simplyGrowTokens,
        },
        arbitrage: {
          pairs: arbitragePairs,
        },
        market_making: {
          pairs: marketMakingPairs,
          exchanges: exchanges.filter((exchange) =>
            marketMakingPairs.some(
              (pair) => pair.exchange_id === exchange.exchange_id,
            ),
          ),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching grow data', error.stack);

      return {
        statusCode: 500,
        message: 'Internal server error',
        error: error.message,
      };
    }
  }

  private normalizeMarketSymbol(symbol?: string) {
    return String(symbol || '')
      .split(':')[0]
      .trim()
      .toUpperCase();
  }

  private readFiniteString(value: unknown): string | undefined {
    const trimmed = String(value ?? '').trim();

    return trimmed ? trimmed : undefined;
  }

  private readPositiveString(value: unknown): string | undefined {
    const trimmed = String(value ?? '').trim();

    if (!trimmed) {
      return undefined;
    }

    const amount = new BigNumber(trimmed);

    if (!amount.isFinite() || !amount.isGreaterThan(0)) {
      return undefined;
    }

    return amount.toString();
  }

  private readPositiveBigNumber(value: unknown): BigNumber | undefined {
    const amount = this.readPositiveString(value);

    return amount ? new BigNumber(amount) : undefined;
  }

  private resolveDerivedPairPrice(
    pair: Pick<GrowdataMarketMakingPair, 'base_price' | 'target_price'>,
  ): BigNumber | undefined {
    const basePrice = this.readPositiveBigNumber(pair.base_price);
    const quotePrice = this.readPositiveBigNumber(pair.target_price);

    if (!basePrice || !quotePrice) {
      return undefined;
    }

    return basePrice.dividedBy(quotePrice);
  }

  private async applyExchangeMarketMetadata(
    pairs: GrowdataMarketMakingPair[],
  ): Promise<GrowdataMarketMakingPair[]> {
    const exchangeIds = [...new Set(pairs.map((pair) => pair.exchange_id).filter(Boolean))];
    const marketsByExchange = new Map<string, ExchangeMarketSnapshot[]>();

    await Promise.all(
      exchangeIds.map(async (exchangeId) => {
        try {
          const markets = (await this.exchangeInitService.getCcxtExchangeMarkets(
            exchangeId,
          )) as ExchangeMarketSnapshot[];
          marketsByExchange.set(
            exchangeId,
            Array.isArray(markets) ? markets : [],
          );
        } catch (error) {
          this.logger.warn(
            `Failed to resolve exchange market metadata for ${exchangeId}`,
            error,
          );
        }
      }),
    );

    return pairs.map((pair) => {
      const markets = marketsByExchange.get(pair.exchange_id) || [];
      const normalizedSymbol = this.normalizeMarketSymbol(pair.symbol);
      const market = markets.find(
        (item) => this.normalizeMarketSymbol(item?.symbol) === normalizedSymbol,
      );

      if (!market) {
        return pair;
      }

      return {
        ...pair,
        min_order_amount:
          this.readPositiveString(pair.min_order_amount) ??
          this.readPositiveString(market.limits?.amount?.min),
        max_order_amount:
          this.readPositiveString(pair.max_order_amount) ??
          this.readPositiveString(market.limits?.amount?.max),
        amount_significant_figures:
          this.readFiniteString(pair.amount_significant_figures) ??
          this.readFiniteString(market.precision?.amount),
        price_significant_figures:
          this.readFiniteString(pair.price_significant_figures) ??
          this.readFiniteString(market.precision?.price),
      };
    });
  }


  private async applyEffectiveMinimumOrderAmounts(
    pairs: GrowdataMarketMakingPair[],
  ): Promise<GrowdataMarketMakingPair[]> {
    const exchangeIds = [...new Set(pairs.map((pair) => pair.exchange_id).filter(Boolean))];
    const marketsByExchange = new Map<string, ExchangeMarketSnapshot[]>();

    await Promise.all(
      exchangeIds.map(async (exchangeId) => {
        try {
          const markets = (await this.exchangeInitService.getCcxtExchangeMarkets(
            exchangeId,
          )) as ExchangeMarketSnapshot[];
          marketsByExchange.set(
            exchangeId,
            Array.isArray(markets) ? markets : [],
          );
        } catch (error) {
          this.logger.warn(
            `Failed to resolve cost minimums for ${exchangeId}`,
            error,
          );
        }
      }),
    );

    return pairs.map((pair) => {
      const markets = marketsByExchange.get(pair.exchange_id) || [];
      const normalizedSymbol = this.normalizeMarketSymbol(pair.symbol);
      const market = markets.find(
        (item) => this.normalizeMarketSymbol(item?.symbol) === normalizedSymbol,
      );
      const candidates = [this.readPositiveBigNumber(pair.min_order_amount)].filter(
        (value): value is BigNumber => value !== undefined,
      );
      const costMinimum = this.readPositiveBigNumber(market?.limits?.cost?.min);
      const derivedPairPrice = this.resolveDerivedPairPrice(pair);

      if (costMinimum && derivedPairPrice) {
        candidates.push(costMinimum.dividedBy(derivedPairPrice));
      }

      if (candidates.length === 0) {
        return pair;
      }

      return {
        ...pair,
        min_order_amount: candidates
          .reduce((maximum, candidate) =>
            candidate.isGreaterThan(maximum) ? candidate : maximum,
          )
          .toString(),
      };
    });
  }

  // Exchange Methods
  async getAllExchanges() {
    return this.growdataRepository.findAllExchanges();
  }

  async getExchangeById(exchange_id: string) {
    return this.growdataRepository.findExchangeById(exchange_id);
  }

  // SimplyGrowToken Methods
  async getAllSimplyGrowTokens() {
    return this.growdataRepository.findAllSimplyGrowTokens();
  }

  async getSimplyGrowTokenById(asset_id: string) {
    return this.growdataRepository.findSimplyGrowTokenById(asset_id);
  }

  // ArbitragePair Methods
  async getAllArbitragePairs() {
    const pairs = await this.growdataRepository.findAllArbitragePairs();

    const assetIds = pairs.flatMap((pair) => [
      pair.base_asset_id,
      pair.quote_asset_id,
    ]);
    const priceMap = await this.fetchExternalPriceData(assetIds);

    for (const pair of pairs) {
      pair.base_price = priceMap.get(pair.base_asset_id) || '0';
      pair.target_price = priceMap.get(pair.quote_asset_id) || '0';
    }

    return pairs;
  }

  async getArbitragePairById(id: string) {
    return this.growdataRepository.findArbitragePairById(id);
  }

  // MarketMakingPair Methods
  async getAllMarketMakingPairs() {
    const storedPairs = await this.growdataRepository.findAllMarketMakingPairs();
    const pairs = await this.applyExchangeMarketMetadata(storedPairs);

    const assetIds = pairs.flatMap((pair) => [
      pair.base_asset_id,
      pair.quote_asset_id,
    ]);
    const priceMap = await this.fetchExternalPriceData(assetIds);

    for (const pair of pairs) {
      pair.base_price = priceMap.get(pair.base_asset_id) || '0';
      pair.target_price = priceMap.get(pair.quote_asset_id) || '0';
    }

    return this.applyEffectiveMinimumOrderAmounts(pairs);
  }

  async getMarketMakingPairById(id: string) {
    return this.growdataRepository.findMarketMakingPairById(id);
  }

  async removeMarketMakingPair(id: string) {
    return this.growdataRepository.removeMarketMakingPair(id);
  }

  async updateMarketMakingPair(
    id: string,
    modifications: Partial<GrowdataMarketMakingPair>,
  ) {
    try {
      await this.growdataRepository.updateMarketMakingPair(id, modifications);
    } catch (error) {
      this.logger.error(
        `Failed to modify market making pair with ID ${id}`,
        error,
      );
    }
  }

  private async fetchExternalPriceData(asset_ids: string[]) {
    const uniqueAssetIds = [...new Set(asset_ids.filter((id) => !!id))];

    if (uniqueAssetIds.length === 0) return new Map<string, string>();

    const priceMap = new Map<string, string>();
    const missingAssetIds: string[] = [];

    for (const assetId of uniqueAssetIds) {
      const cacheKey = `asset_price_${assetId}`;
      const cachedPrice = await this.cacheService.get<string>(cacheKey);

      if (cachedPrice) {
        priceMap.set(assetId, cachedPrice);
      } else {
        missingAssetIds.push(assetId);
      }
    }

    if (missingAssetIds.length === 0) {
      return priceMap;
    }

    try {
      const assets = await this.mixinClientService.client.safe.fetchAssets(
        missingAssetIds,
      );

      for (const asset of assets) {
        const price = asset.price_usd || '0';

        priceMap.set(asset.asset_id, price);
        await this.cacheService.set(
          `asset_price_${asset.asset_id}`,
          price,
          this.cachingTTL,
        );
      }

      return priceMap;
    } catch (error) {
      this.logger.error(
        `Failed to fetch prices for assets: ${missingAssetIds.join(', ')}`,
        error.stack,
      );

      return priceMap;
    }
  }
}
