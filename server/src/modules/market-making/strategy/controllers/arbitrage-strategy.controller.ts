import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ArbitrageStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import type { StrategyExecutionCategory } from '../config/strategy-execution-category';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

@Injectable()
export class ArbitrageStrategyController implements StrategyController {
  readonly strategyType = 'arbitrage' as const;

  constructor(
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    return Math.max(
      1000,
      Number(parameters?.checkIntervalSeconds || 10) * 1000,
    );
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.startArbitrageStrategyForUser(
      config as unknown as ArbitrageStrategyDto,
      Number(config.checkIntervalSeconds || 10),
      Number(config.maxOpenOrders || 1),
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.buildArbitrageActions(
      ctx.session.strategyKey,
      ctx.session.params as unknown as ArbitrageStrategyDto,
      ctx.ts,
    );
  }

  async buildArbitrageActions(
    strategyKey: string,
    strategyParamsDto: ArbitrageStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const { userId, clientId, pair, amountToTrade, minProfitability } =
      strategyParamsDto;

    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    const orderBookA =
      await this.strategyMarketDataProviderService.getOrderBook(
        strategyParamsDto.exchangeAName,
        pair,
      );
    const orderBookB =
      await this.strategyMarketDataProviderService.getOrderBook(
        strategyParamsDto.exchangeBName,
        pair,
      );

    const vwapA = this.calculateVWAPForAmount(orderBookA, amountToTrade, 'buy');
    const vwapB = this.calculateVWAPForAmount(
      orderBookB,
      amountToTrade,
      'sell',
    );

    if (vwapA.isLessThanOrEqualTo(0) || vwapB.isLessThanOrEqualTo(0)) {
      return [];
    }

    const threshold = new BigNumber(minProfitability);
    const actions: ExecutorAction[] = [];
    const executionCategory =
      String(
        (strategyParamsDto as { executionCategory?: unknown })
          .executionCategory || '',
      ).toLowerCase() === 'clob_dex'
        ? 'clob_dex'
        : 'clob_cex';

    if (vwapB.minus(vwapA).dividedBy(vwapA).isGreaterThanOrEqualTo(threshold)) {
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeAName,
          pair,
          'buy',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-buy',
          executionCategory,
        ),
      );
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeBName,
          pair,
          'sell',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-sell',
          executionCategory,
        ),
      );
    }

    if (vwapA.minus(vwapB).dividedBy(vwapB).isGreaterThanOrEqualTo(threshold)) {
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeBName,
          pair,
          'buy',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-buy',
          executionCategory,
        ),
      );
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeAName,
          pair,
          'sell',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-sell',
          executionCategory,
        ),
      );
    }

    return actions;
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.startArbitrageStrategyForUser(
      strategyInstance.parameters as ArbitrageStrategyDto,
      strategyInstance.parameters.checkIntervalSeconds,
      strategyInstance.parameters.maxOpenOrders,
    );
  }

  private createIntent(
    runtimeInstanceKey: string,
    strategyKey: string,
    userId: string,
    clientId: string,
    exchange: string,
    pair: string,
    side: 'buy' | 'sell',
    price: BigNumber,
    qty: BigNumber,
    ts: string,
    suffix: string,
    executionCategory?: StrategyExecutionCategory,
  ): StrategyOrderIntent {
    if (!this.strategyIntentStoreService) {
      throw new Error('strategy intent store is not available');
    }

    return this.strategyIntentStoreService.createLimitOrderIntent(
      runtimeInstanceKey,
      strategyKey,
      userId,
      clientId,
      exchange,
      pair,
      side,
      price,
      qty,
      ts,
      suffix,
      executionCategory,
    );
  }

  private calculateVWAPForAmount(
    orderBook: {
      bids?: Array<[number, number]>;
      asks?: Array<[number, number]>;
    },
    amountToTrade: number,
    direction: 'buy' | 'sell',
  ): BigNumber {
    let volumeAccumulated = new BigNumber(0);
    let volumePriceProductSum = new BigNumber(0);
    const amountToTradeBn = new BigNumber(amountToTrade);
    const orders =
      direction === 'buy'
        ? Array.isArray(orderBook?.asks)
          ? orderBook.asks
          : []
        : Array.isArray(orderBook?.bids)
        ? orderBook.bids
        : [];

    for (const [price, volume] of orders) {
      const volumeToUse = BigNumber.min(
        new BigNumber(volume),
        amountToTradeBn.minus(volumeAccumulated),
      );

      volumePriceProductSum = volumePriceProductSum.plus(
        new BigNumber(price).multipliedBy(volumeToUse),
      );
      volumeAccumulated = volumeAccumulated.plus(volumeToUse);

      if (volumeAccumulated.isGreaterThanOrEqualTo(amountToTradeBn)) {
        break;
      }
    }

    if (volumeAccumulated.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    return volumePriceProductSum.dividedBy(volumeAccumulated);
  }
}
