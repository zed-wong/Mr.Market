import BigNumber from 'bignumber.js';
import { Injectable } from '@nestjs/common';
import {
  GrowdataArbitragePair,
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import {
  GrowdataArbitragePairDto,
  GrowdataMarketMakingPairDto,
} from 'src/modules/admin/growdata/adminGrow.dto';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { GrowdataService } from 'src/modules/data/grow-data/grow-data.service';
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
  };
  precision?: {
    amount?: number | string | null;
    price?: number | string | null;
  };
};

@Injectable()
export class AdminGrowService {
  private readonly logger = new CustomLogger(AdminGrowService.name);

  constructor(
    private readonly growDataService: GrowdataService,
    private readonly growdataRepository: GrowdataRepository,
    private readonly mixinClientService: MixinClientService,
    private readonly exchangeInitService: ExchangeInitService,
  ) {}

  private async resolveChainInfo(assetId?: string) {
    if (!assetId || !this.mixinClientService?.client?.safe) {
      return { chainId: undefined, chainIconUrl: undefined };
    }

    try {
      const asset = await this.mixinClientService.client.safe.fetchAsset(
        assetId,
      );
      const chainId = asset?.chain_id;

      if (!chainId) {
        return { chainId: undefined, chainIconUrl: undefined };
      }
      const chainAsset = await this.mixinClientService.client.safe.fetchAsset(
        chainId,
      );

      return {
        chainId,
        chainIconUrl: chainAsset?.icon_url,
      };
    } catch (error) {
      this.logger.warn(`Failed to resolve chain info for ${assetId}`, error);

      return { chainId: undefined, chainIconUrl: undefined };
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

  private async applyExchangeMarketMetadata(
    pair: GrowdataMarketMakingPair,
  ): Promise<GrowdataMarketMakingPair> {
    if (!pair.exchange_id || !pair.symbol) {
      return pair;
    }

    try {
      const markets =
        (await this.exchangeInitService.getCcxtExchangeMarkets(
          pair.exchange_id,
        )) as ExchangeMarketSnapshot[];
      const normalizedSymbol = this.normalizeMarketSymbol(pair.symbol);
      const market = Array.isArray(markets)
        ? markets.find(
            (item) =>
              this.normalizeMarketSymbol(item?.symbol) === normalizedSymbol,
          )
        : undefined;

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
    } catch (error) {
      this.logger.warn(
        `Failed to resolve exchange market metadata for ${pair.exchange_id} ${pair.symbol}`,
        error,
      );

      return pair;
    }
  }

  private async applyChainInfo(
    pair: GrowdataMarketMakingPair,
  ): Promise<GrowdataMarketMakingPair> {
    // Resolve chain icon metadata at storage time.
    const [baseChain, quoteChain] = await Promise.all([
      this.resolveChainInfo(pair.base_asset_id),
      this.resolveChainInfo(pair.quote_asset_id),
    ]);

    return {
      ...pair,
      base_chain_id: baseChain.chainId || pair.base_chain_id,
      base_chain_icon_url: baseChain.chainIconUrl || pair.base_chain_icon_url,
      quote_chain_id: quoteChain.chainId || pair.quote_chain_id,
      quote_chain_icon_url:
        quoteChain.chainIconUrl || pair.quote_chain_icon_url,
    };
  }

  // Exchange
  async addExchange(exchange: GrowdataExchange) {
    return this.growdataRepository.addExchange(exchange);
  }

  async removeExchange(exchange_id: string) {
    return this.growdataRepository.removeExchange(exchange_id);
  }

  async removeAllExchanges() {
    const exchanges = await this.growDataService.getAllExchanges();

    for (const exchange of exchanges) {
      await this.growdataRepository.removeExchange(exchange.exchange_id);
    }
  }

  async updateExchange(
    exchange_id: string,
    modifications: Partial<GrowdataExchange>,
  ) {
    try {
      await this.growdataRepository.updateExchange(exchange_id, modifications);
    } catch (error) {
      this.logger.error(
        `Failed to modify exchange with ID ${exchange_id}`,
        error,
      );
      throw error;
    }
  }

  // SimplyGrow token
  async addSimplyGrowToken(token: GrowdataSimplyGrowToken) {
    return this.growdataRepository.addSimplyGrowToken(token);
  }

  async removeSimplyGrowToken(asset_id: string) {
    return this.growdataRepository.removeSimplyGrowToken(asset_id);
  }

  async removeAllSimplyGrowTokens() {
    const tokens = await this.growDataService.getAllSimplyGrowTokens();

    for (const token of tokens) {
      await this.growdataRepository.removeSimplyGrowToken(token.asset_id);
    }
  }

  async updateSimplyGrowToken(
    asset_id: string,
    modifications: Partial<GrowdataSimplyGrowToken>,
  ) {
    try {
      await this.growdataRepository.updateSimplyGrowToken(
        asset_id,
        modifications,
      );
    } catch (error) {
      this.logger.error(
        `Failed to modify simply grow token with ID ${asset_id}`,
        error,
      );
    }
  }

  // Market making
  async addMarketMakingPair(pairDto: GrowdataMarketMakingPairDto) {
    const exchange = await this.growDataService.getExchangeById(
      pairDto.exchange_id,
    );

    if (!exchange) {
      throw new Error('Exchange not found');
    }
    const pairWithChainInfo = await this.applyChainInfo({
      ...pairDto,
      exchange_id: exchange.exchange_id,
    } as GrowdataMarketMakingPair);
    const pair = await this.applyExchangeMarketMetadata(pairWithChainInfo);

    return this.growdataRepository.addMarketMakingPair(pair);
  }

  async removeMarketMakingPair(id: string) {
    return this.growdataRepository.removeMarketMakingPair(id);
  }

  async removeAllMarketMakingPairs() {
    const pairs = await this.growDataService.getAllMarketMakingPairs();

    for (const pair of pairs) {
      await this.growDataService.removeMarketMakingPair(pair.id);
    }
  }

  async updateMarketMakingPair(
    id: string,
    modifications: Partial<GrowdataMarketMakingPair>,
  ) {
    const pair = await this.growDataService.getMarketMakingPairById(id);

    if (pair) {
      Object.assign(pair, modifications);
      // Assuming there's a method to update the pair
      const pairWithChainInfo = await this.applyChainInfo(pair);
      const updatedPair = await this.applyExchangeMarketMetadata(
        pairWithChainInfo,
      );

      return this.growdataRepository.addMarketMakingPair(updatedPair);
    }
  }

  // Arbitrage
  async addArbitragePair(pairDto: GrowdataArbitragePairDto) {
    const base_exchange = await this.growDataService.getExchangeById(
      pairDto.base_exchange_id,
    );
    const target_exchange = await this.growDataService.getExchangeById(
      pairDto.target_exchange_id,
    );

    if (!base_exchange || !target_exchange) {
      throw new Error('Exchange not found');
    }
    const pair: GrowdataArbitragePair = {
      ...pairDto,
      base_exchange_id: base_exchange.exchange_id,
      target_exchange_id: target_exchange.exchange_id,
    };

    return this.growdataRepository.addArbitragePair(pair);
  }

  async removeArbitragePair(id: string) {
    return this.growdataRepository.removeArbitragePair(id);
  }

  async removeAllArbitragePairs() {
    const pairs = await this.growDataService.getAllArbitragePairs();

    for (const pair of pairs) {
      await this.growdataRepository.removeArbitragePair(pair.id);
    }
  }

  async updateArbitragePair(
    id: string,
    modifications: Partial<GrowdataArbitragePair>,
  ) {
    try {
      await this.growdataRepository.updateArbitragePair(id, modifications);
    } catch (error) {
      this.logger.error(`Failed to modify arbitrage pair with ID ${id}`, error);
    }
  }
}
