import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { createStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import {
  ArbitrageStrategyDto,
  PureMarketMakingStrategyDto,
} from './strategy.dto';
import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

type StrategyType = 'arbitrage' | 'pureMarketMaking' | 'volume';

type StrategyRuntimeSession = {
  strategyKey: string;
  strategyType: StrategyType;
  userId: string;
  clientId: string;
  cadenceMs: number;
  nextRunAtMs: number;
  params:
    | ArbitrageStrategyDto
    | PureMarketMakingStrategyDto
    | Record<string, any>;
};

@Injectable()
export class StrategyService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(StrategyService.name);
  private readonly sessions = new Map<string, StrategyRuntimeSession>();
  private readonly latestIntentsByStrategy = new Map<
    string,
    StrategyOrderIntent[]
  >();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly strategyIntentExecutionService?: StrategyIntentExecutionService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly quoteExecutorManagerService?: QuoteExecutorManagerService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('strategy-service', this, 20);
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('strategy-service');
  }

  async start(): Promise<void> {
    const runningStrategies = await this.getRunningStrategies();
    const nowMs = Date.now();

    for (const strategy of runningStrategies) {
      this.sessions.set(strategy.strategyKey, {
        strategyKey: strategy.strategyKey,
        strategyType: strategy.strategyType as StrategyType,
        userId: strategy.userId,
        clientId: strategy.clientId,
        cadenceMs: this.getCadenceMs(
          strategy.parameters,
          strategy.strategyType,
        ),
        nextRunAtMs: nowMs,
        params: strategy.parameters,
      });
    }
  }

  async stop(): Promise<void> {
    this.sessions.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }

  async onTick(ts: string): Promise<void> {
    const nowMs = Date.now();
    const sessions = [...this.sessions.values()].sort((a, b) =>
      a.strategyKey.localeCompare(b.strategyKey),
    );

    for (const session of sessions) {
      if (session.nextRunAtMs > nowMs) {
        continue;
      }

      await this.runSession(session, ts);
      session.nextRunAtMs += session.cadenceMs;
      this.sessions.set(session.strategyKey, session);
    }
  }

  async getRunningStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyInstanceRepository.find({
      where: { status: 'running' },
    });
  }

  async getAllStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyInstanceRepository.find();
  }

  async getStrategyInstanceKey(strategyKey: string): Promise<StrategyInstance> {
    return await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });
  }

  async rerunStrategy(strategyKey: string): Promise<void> {
    const strategyInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (!strategyInstance) {
      throw new Error(`Strategy with key ${strategyKey} not found.`);
    }

    if (strategyInstance.strategyType === 'arbitrage') {
      await this.startArbitrageStrategyForUser(
        strategyInstance.parameters as ArbitrageStrategyDto,
        strategyInstance.parameters.checkIntervalSeconds,
        strategyInstance.parameters.maxOpenOrders,
      );

      return;
    }

    if (strategyInstance.strategyType === 'pureMarketMaking') {
      await this.executePureMarketMakingStrategy(
        strategyInstance.parameters as PureMarketMakingStrategyDto,
      );

      return;
    }

    if (strategyInstance.strategyType === 'volume') {
      await this.executeVolumeStrategy(
        strategyInstance.parameters.exchangeName,
        strategyInstance.parameters.symbol,
        strategyInstance.parameters.baseIncrementPercentage,
        strategyInstance.parameters.baseIntervalTime,
        strategyInstance.parameters.baseTradeAmount,
        strategyInstance.parameters.numTrades,
        strategyInstance.parameters.userId,
        strategyInstance.parameters.clientId,
        strategyInstance.parameters.pricePushRate,
      );

      return;
    }

    throw new Error(`Unknown strategy type: ${strategyInstance.strategyType}`);
  }

  async startArbitrageStrategyForUser(
    strategyParamsDto: ArbitrageStrategyDto,
    checkIntervalSeconds: number,
    maxOpenOrders: number,
  ) {
    const { userId, clientId } = strategyParamsDto;
    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: userId,
      client_id: clientId,
    });

    const cadenceMs = Math.max(1000, Number(checkIntervalSeconds || 10) * 1000);

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'arbitrage',
      { ...strategyParamsDto, checkIntervalSeconds, maxOpenOrders },
    );
    this.upsertSession(
      strategyKey,
      'arbitrage',
      userId,
      clientId,
      cadenceMs,
      strategyParamsDto,
    );
  }

  async executePureMarketMakingStrategy(
    strategyParamsDto: PureMarketMakingStrategyDto,
  ) {
    const { userId, clientId } = strategyParamsDto;
    const strategyKey = createStrategyKey({
      type: 'pureMarketMaking',
      user_id: userId,
      client_id: clientId,
    });

    const cadenceMs = Math.max(
      1000,
      Number(strategyParamsDto.orderRefreshTime),
    );

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'pureMarketMaking',
      strategyParamsDto,
    );
    this.upsertSession(
      strategyKey,
      'pureMarketMaking',
      userId,
      clientId,
      cadenceMs,
      strategyParamsDto,
    );
  }

  async executeMMCycle(strategyParamsDto: PureMarketMakingStrategyDto) {
    const strategyKey = createStrategyKey({
      type: 'pureMarketMaking',
      user_id: strategyParamsDto.userId,
      client_id: strategyParamsDto.clientId,
    });

    const intents = await this.buildPureMarketMakingIntents(
      strategyKey,
      strategyParamsDto,
      getRFC3339Timestamp(),
    );

    await this.publishIntents(strategyKey, intents);
  }

  async executeVolumeStrategy(
    exchangeName: string,
    symbol: string,
    baseIncrementPercentage: number,
    baseIntervalTime: number,
    baseTradeAmount: number,
    numTrades: number,
    userId: string,
    clientId: string,
    pricePushRate: number,
  ) {
    const strategyKey = createStrategyKey({
      type: 'volume',
      user_id: userId,
      client_id: clientId,
    });

    const params = {
      exchangeName,
      symbol,
      baseIncrementPercentage,
      baseIntervalTime,
      baseTradeAmount,
      numTrades,
      userId,
      clientId,
      pricePushRate,
    };

    const cadenceMs = Math.max(1000, Number(baseIntervalTime || 10) * 1000);

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'volume',
      params,
    );
    this.upsertSession(
      strategyKey,
      'volume',
      userId,
      clientId,
      cadenceMs,
      params,
    );
  }

  async stopStrategyForUser(
    userId: string,
    clientId: string,
    strategyType?: string,
  ) {
    if (!strategyType) {
      return;
    }

    const strategyKey = createStrategyKey({
      type: strategyType as StrategyType,
      user_id: userId,
      client_id: clientId,
    });

    await this.strategyInstanceRepository.update(
      { strategyKey },
      { status: 'stopped', updatedAt: new Date() },
    );

    this.sessions.delete(strategyKey);

    const stopIntent: StrategyOrderIntent = {
      type: 'STOP_EXECUTOR',
      intentId: `${strategyKey}:${Date.now()}:stop`,
      strategyInstanceId: strategyKey,
      strategyKey,
      userId,
      clientId,
      exchange: '',
      pair: '',
      side: 'buy',
      price: '0',
      qty: '0',
      createdAt: getRFC3339Timestamp(),
      status: 'NEW',
    };

    await this.publishIntents(strategyKey, [stopIntent]);
  }

  stopVolumeStrategy(userId: string, clientId: string) {
    return this.stopStrategyForUser(userId, clientId, 'volume');
  }

  async evaluateArbitrageOpportunityVWAP(
    exchangeA: ccxt.Exchange,
    exchangeB: ccxt.Exchange,
    strategyParamsDto: ArbitrageStrategyDto,
  ) {
    const { userId, clientId, pair, amountToTrade, minProfitability } =
      strategyParamsDto;

    const orderBookA = await exchangeA.fetchOrderBook(pair);
    const orderBookB = await exchangeB.fetchOrderBook(pair);

    const vwapA = this.calculateVWAPForAmount(orderBookA, amountToTrade, 'buy');
    const vwapB = this.calculateVWAPForAmount(
      orderBookB,
      amountToTrade,
      'sell',
    );

    if (vwapA.isLessThanOrEqualTo(0) || vwapB.isLessThanOrEqualTo(0)) {
      return;
    }

    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: userId,
      client_id: clientId,
    });

    const threshold = new BigNumber(minProfitability);
    const intents: StrategyOrderIntent[] = [];
    const ts = getRFC3339Timestamp();

    if (vwapB.minus(vwapA).dividedBy(vwapA).isGreaterThanOrEqualTo(threshold)) {
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeA.id,
          pair,
          'buy',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-buy',
        ),
      );
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeB.id,
          pair,
          'sell',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-sell',
        ),
      );
    }

    if (vwapA.minus(vwapB).dividedBy(vwapB).isGreaterThanOrEqualTo(threshold)) {
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeB.id,
          pair,
          'buy',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-buy',
        ),
      );
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeA.id,
          pair,
          'sell',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-sell',
        ),
      );
    }

    if (intents.length > 0) {
      await this.publishIntents(strategyKey, intents);
    }
  }

  public async checkAndCleanFilledOrders(): Promise<boolean> {
    return true;
  }

  getLatestIntentsForStrategy(strategyKey: string): StrategyOrderIntent[] {
    return this.latestIntentsByStrategy.get(strategyKey) || [];
  }

  private upsertSession(
    strategyKey: string,
    strategyType: StrategyType,
    userId: string,
    clientId: string,
    cadenceMs: number,
    params: StrategyRuntimeSession['params'],
  ): void {
    this.sessions.set(strategyKey, {
      strategyKey,
      strategyType,
      userId,
      clientId,
      cadenceMs,
      params,
      nextRunAtMs: Date.now(),
    });
  }

  private async upsertStrategyInstance(
    strategyKey: string,
    userId: string,
    clientId: string,
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<void> {
    const existing = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (existing) {
      await this.strategyInstanceRepository.update(
        { strategyKey },
        {
          status: 'running',
          strategyType,
          parameters,
          updatedAt: new Date(),
        },
      );

      return;
    }

    const instance = this.strategyInstanceRepository.create({
      strategyKey,
      userId,
      clientId,
      strategyType,
      parameters,
      status: 'running',
      startPrice: await this.fetchStartPrice(strategyType, parameters),
    });

    await this.strategyInstanceRepository.save(instance);
  }

  private async fetchStartPrice(
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<number> {
    if (strategyType === 'volume') {
      return 0;
    }

    const pair = parameters.pair;
    const exchangeName =
      strategyType === 'pureMarketMaking' && parameters.oracleExchangeName
        ? parameters.oracleExchangeName
        : parameters.exchangeName || parameters.exchangeAName;
    const exchange = this.exchangeInitService.getExchange(exchangeName);
    const ticker = await exchange.fetchTicker(pair);

    return Number(ticker.last || 0);
  }

  private getCadenceMs(
    parameters: Record<string, any>,
    strategyType: string,
  ): number {
    if (strategyType === 'arbitrage') {
      return Math.max(
        1000,
        Number(parameters?.checkIntervalSeconds || 10) * 1000,
      );
    }

    if (strategyType === 'pureMarketMaking') {
      return Math.max(1000, Number(parameters?.orderRefreshTime || 10000));
    }

    return Math.max(1000, Number(parameters?.baseIntervalTime || 10) * 1000);
  }

  private async runSession(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<void> {
    if (session.strategyType === 'pureMarketMaking') {
      const intents = await this.buildPureMarketMakingIntents(
        session.strategyKey,
        session.params as PureMarketMakingStrategyDto,
        ts,
      );

      await this.publishIntents(session.strategyKey, intents);

      return;
    }

    if (session.strategyType === 'arbitrage') {
      const params = session.params as ArbitrageStrategyDto;
      const exchangeA = this.exchangeInitService.getExchange(
        params.exchangeAName,
      );
      const exchangeB = this.exchangeInitService.getExchange(
        params.exchangeBName,
      );

      await this.evaluateArbitrageOpportunityVWAP(exchangeA, exchangeB, params);
    }
  }

  private async buildPureMarketMakingIntents(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<StrategyOrderIntent[]> {
    const intents: StrategyOrderIntent[] = [];
    const exchange = this.exchangeInitService.getExchange(params.exchangeName);
    const priceExchange = params.oracleExchangeName
      ? this.exchangeInitService.getExchange(params.oracleExchangeName)
      : exchange;
    const priceSource = new BigNumber(
      await this.getPriceSource(
        priceExchange,
        params.pair,
        params.priceSourceType,
      ),
    );

    const openOrders =
      this.exchangeOrderTrackerService?.getOpenOrders(strategyKey) || [];
    const existingOpenOrdersBySide = {
      buy: openOrders.filter((order) => order.side === 'buy').length,
      sell: openOrders.filter((order) => order.side === 'sell').length,
    };

    const quotes = this.quoteExecutorManagerService
      ? this.quoteExecutorManagerService.buildQuotes({
          midPrice: priceSource.toFixed(),
          numberOfLayers: params.numberOfLayers,
          bidSpread: params.bidSpread,
          askSpread: params.askSpread,
          orderAmount: new BigNumber(params.orderAmount).toFixed(),
          amountChangePerLayer: params.amountChangePerLayer,
          amountChangeType: params.amountChangeType,
          inventorySkewFactor: Number(params.inventorySkewFactor || 0),
          inventoryTargetBaseRatio: Number(
            params.inventoryTargetBaseRatio || 0.5,
          ),
          currentBaseRatio: Number(params.currentBaseRatio || 0.5),
          makerHeavyMode: Boolean(params.makerHeavyMode),
          makerHeavyBiasBps: Number(params.makerHeavyBiasBps || 0),
          hangingOrdersEnabled: Boolean(params.hangingOrdersEnabled),
          existingOpenOrdersBySide,
        })
      : this.buildLegacyQuotes(params, priceSource);

    for (const quote of quotes) {
      if (!quote.shouldCreate) {
        continue;
      }
      const quotePrice = new BigNumber(quote.price);

      if (
        quote.side === 'buy' &&
        params.ceilingPrice !== undefined &&
        priceSource.isGreaterThan(params.ceilingPrice)
      ) {
        continue;
      }
      if (
        quote.side === 'sell' &&
        params.floorPrice !== undefined &&
        priceSource.isLessThan(params.floorPrice)
      ) {
        continue;
      }

      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          params.userId,
          params.clientId,
          exchange.id,
          params.pair,
          quote.side,
          quotePrice,
          new BigNumber(quote.qty),
          ts,
          `mm-layer-${quote.layer}-${quote.side}`,
        ),
      );
    }

    return intents;
  }

  private buildLegacyQuotes(
    params: PureMarketMakingStrategyDto,
    priceSource: BigNumber,
  ): Array<{
    layer: number;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    shouldCreate: boolean;
  }> {
    const quotes: Array<{
      layer: number;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      shouldCreate: boolean;
    }> = [];

    let currentOrderAmount = new BigNumber(params.orderAmount);

    for (let layer = 1; layer <= params.numberOfLayers; layer++) {
      if (layer > 1) {
        if (params.amountChangeType === 'fixed') {
          currentOrderAmount = currentOrderAmount.plus(
            params.amountChangePerLayer,
          );
        } else {
          currentOrderAmount = currentOrderAmount.plus(
            currentOrderAmount.multipliedBy(
              new BigNumber(params.amountChangePerLayer).dividedBy(100),
            ),
          );
        }
      }

      const layerBidSpread = new BigNumber(params.bidSpread).multipliedBy(
        layer,
      );
      const layerAskSpread = new BigNumber(params.askSpread).multipliedBy(
        layer,
      );
      const buyPrice = priceSource.multipliedBy(
        new BigNumber(1).minus(layerBidSpread),
      );
      const sellPrice = priceSource.multipliedBy(
        new BigNumber(1).plus(layerAskSpread),
      );

      quotes.push({
        layer,
        side: 'buy',
        price: buyPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
        shouldCreate: true,
      });
      quotes.push({
        layer,
        side: 'sell',
        price: sellPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
        shouldCreate: true,
      });
    }

    return quotes;
  }

  private createIntent(
    strategyInstanceId: string,
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
  ): StrategyOrderIntent {
    return {
      type: 'CREATE_LIMIT_ORDER',
      intentId: `${strategyKey}:${ts}:${suffix}`,
      strategyInstanceId,
      strategyKey,
      userId,
      clientId,
      exchange,
      pair,
      side,
      price: price.toFixed(),
      qty: qty.toFixed(),
      createdAt: ts,
      status: 'NEW',
    };
  }

  private async publishIntents(
    strategyKey: string,
    intents: StrategyOrderIntent[],
  ): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    this.latestIntentsByStrategy.set(strategyKey, intents);
    for (const intent of intents) {
      await this.strategyIntentStoreService?.upsertIntent(intent);
    }

    const intentExecutionDriver = String(
      this.configService?.get('strategy.intent_execution_driver', 'worker') ||
        'worker',
    ).toLowerCase();

    if (intentExecutionDriver === 'sync') {
      await this.strategyIntentExecutionService?.consumeIntents(intents);
    }

    this.logger.log(
      `Published ${intents.length} intents for ${strategyKey} (driver=${intentExecutionDriver})`,
    );
  }

  private async getPriceSource(
    exchange: ccxt.Exchange,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    const orderBook = await exchange.fetchOrderBook(pair);

    if (priceSourceType === PriceSourceType.MID_PRICE) {
      return new BigNumber(orderBook.bids[0][0])
        .plus(orderBook.asks[0][0])
        .dividedBy(2)
        .toNumber();
    }

    if (priceSourceType === PriceSourceType.BEST_BID) {
      return Number(orderBook.bids[0][0]);
    }

    if (priceSourceType === PriceSourceType.BEST_ASK) {
      return Number(orderBook.asks[0][0]);
    }

    const ticker = await exchange.fetchTicker(pair);

    return Number(ticker.last);
  }

  private calculateVWAPForAmount(
    orderBook: ccxt.OrderBook,
    amountToTrade: number,
    direction: 'buy' | 'sell',
  ): BigNumber {
    let volumeAccumulated = new BigNumber(0);
    let volumePriceProductSum = new BigNumber(0);
    const amountToTradeBn = new BigNumber(amountToTrade);
    const orders = direction === 'buy' ? orderBook.asks : orderBook.bids;

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
