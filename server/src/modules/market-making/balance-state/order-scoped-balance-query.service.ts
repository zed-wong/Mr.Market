import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { PureMarketMakingStrategyDto } from '../strategy/config/strategy.dto';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { BalanceStateCacheService } from './balance-state-cache.service';

export type PairAvailableBalances = {
  base: BigNumber;
  quote: BigNumber;
  assets: { base: string; quote: string };
};

@Injectable()
export class OrderScopedBalanceQueryService {
  private readonly logger = new CustomLogger(OrderScopedBalanceQueryService.name);

  constructor(
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
  ) {}

  async resolveInventoryRatio(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
  ): Promise<number> {
    const configuredRatio = Number(params.currentBaseRatio || 0.5);

    if (!params.marketMakingOrderId || !this.balanceLedgerService) {
      return configuredRatio;
    }

    const assets = this.parseBaseQuote(params.pair);

    if (!assets) {
      return configuredRatio;
    }

    try {
      const [baseBalance, quoteBalance] = await Promise.all([
        this.balanceLedgerService.getExistingBalance(
          params.marketMakingOrderId,
          assets.base,
        ),
        this.balanceLedgerService.getExistingBalance(
          params.marketMakingOrderId,
          assets.quote,
        ),
      ]);
      const baseTotal = new BigNumber(baseBalance?.total || 0);
      const quoteTotal = new BigNumber(quoteBalance?.total || 0);

      if (
        !baseTotal.isFinite() ||
        baseTotal.isLessThan(0) ||
        !quoteTotal.isFinite() ||
        quoteTotal.isLessThan(0) ||
        !referencePrice.isFinite() ||
        referencePrice.isLessThanOrEqualTo(0)
      ) {
        return configuredRatio;
      }

      const baseQuoteValue = baseTotal.multipliedBy(referencePrice);
      const totalQuoteValue = baseQuoteValue.plus(quoteTotal);

      if (totalQuoteValue.isLessThanOrEqualTo(0)) {
        return configuredRatio;
      }

      return baseQuoteValue.dividedBy(totalQuoteValue).toNumber();
    } catch (error) {
      this.logger.warn(
        `Falling back to configured PMM inventory ratio for ${
          params.marketMakingOrderId
        }: ${error instanceof Error ? error.message : String(error)}`,
      );

      return configuredRatio;
    }
  }

  async getAvailableBalancesForPair(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
    marketMakingOrderId?: string,
  ): Promise<PairAvailableBalances | null> {
    const assets = this.parseBaseQuote(pair);

    if (!assets) {
      return null;
    }

    const orderId = String(marketMakingOrderId || '').trim();

    if (orderId && this.balanceLedgerService) {
      try {
        const [baseBalance, quoteBalance] = await Promise.all([
          this.balanceLedgerService.getExistingBalance(orderId, assets.base),
          this.balanceLedgerService.getExistingBalance(orderId, assets.quote),
        ]);

        return {
          base: new BigNumber(baseBalance?.available || 0),
          quote: new BigNumber(quoteBalance?.available || 0),
          assets,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to read order-scoped balances for ${orderId} ${pair}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return null;
      }
    }

    return this.getCachedAvailableBalances(exchangeName, pair, accountLabel);
  }

  private getCachedAvailableBalances(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
  ): PairAvailableBalances | null {
    const assets = this.parseBaseQuote(pair);

    if (!assets) {
      return null;
    }

    const normalizedAccountLabel = accountLabel || 'default';
    const nowMs = Date.now();
    const snapshotFresh =
      this.balanceStateCacheService?.hasFreshAccountSnapshot(
        exchangeName,
        normalizedAccountLabel,
        nowMs,
      ) ?? false;
    const snapshotDiagnostic =
      this.balanceStateCacheService?.getSnapshotDiagnostic(
        exchangeName,
        normalizedAccountLabel,
        nowMs,
      );

    if (!snapshotFresh) {
      this.logger.warn(
        [
          `Balance cache diagnostic for ${exchangeName} ${pair} account=${normalizedAccountLabel}`,
          `snapshotPresent=${snapshotDiagnostic?.present ?? false}`,
          `snapshotFresh=${snapshotDiagnostic?.fresh ?? false}`,
          `snapshotAgeMs=${snapshotDiagnostic?.ageMs ?? 'missing'}`,
          `snapshotSource=${snapshotDiagnostic?.source ?? 'missing'}`,
          `snapshotFreshnessTs=${
            snapshotDiagnostic?.freshnessTimestamp ?? 'missing'
          }`,
          `baseAsset=${assets.base}`,
          `quoteAsset=${assets.quote}`,
        ].join(' | '),
      );
      this.logger.warn(
        `Skipping balance-dependent strategy read for ${exchangeName} ${pair} account=${normalizedAccountLabel}: balance cache missing or stale`,
      );

      return null;
    }

    const cachedBase = this.balanceStateCacheService?.getBalance(
      exchangeName,
      normalizedAccountLabel,
      assets.base,
    );
    const cachedQuote = this.balanceStateCacheService?.getBalance(
      exchangeName,
      normalizedAccountLabel,
      assets.quote,
    );

    return {
      base: new BigNumber(cachedBase?.free || 0),
      quote: new BigNumber(cachedQuote?.free || 0),
      assets,
    };
  }

  private parseBaseQuote(pair: string): { base: string; quote: string } | null {
    const [base, quote] = String(pair || '').split('/');

    if (!base || !quote) {
      return null;
    }

    return { base, quote };
  }
}
