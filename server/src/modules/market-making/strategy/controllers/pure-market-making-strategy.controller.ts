import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { OrderScopedBalanceQueryService } from '../../balance-state/order-scoped-balance-query.service';
import { KillSwitchService } from '../../risk/kill-switch.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../../trackers/exchange-order-tracker.service';
import { ExecutorAction } from '../config/executor-action.types';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyRuntimeSession,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import type { ConnectorHealthStatus } from '../config/strategy-params.types';
import { StrategyExecutionCategory } from '../config/strategy-execution-category';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import {
  AdaptivePmmSignalSnapshot,
  StrategyMarketDataProviderService,
} from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { QuoteExecutorManagerService } from '../intent/quote-executor-manager.service';
import { PmmMarkoutEvaluatorService } from '../observation/pmm-markout-evaluator.service';
import {
  RuntimeObservationService,
  StrategyRuntimePressureSnapshot,
} from '../observation/runtime-observation.service';
import { AdaptivePmmStateService } from '../pmm/adaptive-pmm-state.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import { FillSettlementService } from '../settlement/fill-settlement.service';
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';

export type PureMarketMakingCoordinator = {
  getSession(strategyKey: string): StrategyRuntimeSession | undefined;
  setSession(strategyKey: string, session: StrategyRuntimeSession): void;
  getConnectorHealthStatus(exchange: string): ConnectorHealthStatus;
  setConnectorHealthStatus(exchange: string, status: ConnectorHealthStatus): void;
  stopStrategyForUser(
    userId: string,
    clientId: string,
    strategyType: StrategyRuntimeSession['strategyType'],
  ): Promise<void>;
  logger: Pick<CustomLogger, 'log' | 'warn'>;
};

@Injectable()
export class PureMarketMakingStrategyController implements StrategyController {
  readonly strategyType = 'pureMarketMaking' as const;
  private readonly logger = new CustomLogger(PureMarketMakingStrategyController.name);

  constructor(
    @Optional()
    private readonly quoteExecutorManagerService?: QuoteExecutorManagerService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly pmmMarkoutEvaluatorService?: PmmMarkoutEvaluatorService,
    @Optional()
    private readonly runtimeObservationService?: RuntimeObservationService,
    @Optional()
    private readonly adaptivePmmStateService?: AdaptivePmmStateService,
    @Optional()
    private readonly orderScopedBalanceQueryService?: OrderScopedBalanceQueryService,
    @Optional()
    private readonly quotePlannerService?: QuotePlannerService,
    @Optional()
    private readonly fillSettlementService?: FillSettlementService,
    @Optional()
    private readonly killSwitchService?: KillSwitchService,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    const rawMs = Number(parameters?.orderRefreshTime || 5000);
    return Math.max(5000, rawMs);
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executePureMarketMakingStrategy(
      config as unknown as PureMarketMakingStrategyDto,
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.buildPureMarketMakingActions(
      ctx.session.strategyKey,
      ctx.session.params as unknown as PureMarketMakingStrategyDto,
      ctx.ts,
      this.createCoordinator(ctx.stopStrategyForUser),
    );
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executePureMarketMakingStrategy(
      strategyInstance.parameters as PureMarketMakingStrategyDto,
    );
  }

  async buildPureMarketMakingActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    coordinator: PureMarketMakingCoordinator,
  ): Promise<ExecutorAction[]> {
    const actions: ExecutorAction[] = [];
    const cancelledExchangeOrderIds = new Set<string>();
    const priceExchange = params.oracleExchangeName
      ? params.oracleExchangeName
      : params.exchangeName;

    if (await this.shouldTriggerKillSwitch(strategyKey, params, coordinator)) {
      return [];
    }

    if (coordinator.getConnectorHealthStatus(params.exchangeName) !== 'CONNECTED') {
      return [];
    }

    if (this.runtimeObservationService) {
      const pressure = this.runtimeObservationService.getPressure(
        strategyKey,
        Number(params.runtimeObservationWindowMs || 60000),
      );
      const maxConsecutiveRejects = Number(params.maxConsecutiveRejects || 100);

      if (
        Number.isFinite(maxConsecutiveRejects) &&
        maxConsecutiveRejects > 0 &&
        pressure.rejectCount >= maxConsecutiveRejects
      ) {
        coordinator.logger.warn(
          `Kill switch triggered for ${strategyKey}: ${pressure.rejectCount} recent intent failures within observation window (threshold ${maxConsecutiveRejects})`,
        );
        const session = coordinator.getSession(strategyKey);
        if (session) {
          await coordinator.stopStrategyForUser(
            session.userId,
            session.clientId,
            session.strategyType,
          );
        }

        return [];
      }
    }
    let priceSource: BigNumber;

    try {
      priceSource = new BigNumber(
        await this.getPriceSource(
          priceExchange,
          params.pair,
          params.priceSourceType,
        ),
      );
      coordinator.setConnectorHealthStatus(params.exchangeName, 'CONNECTED');
    } catch (error) {
      coordinator.setConnectorHealthStatus(params.exchangeName, 'DISCONNECTED');
      coordinator.logger.warn(
        `Skipping cycle for ${strategyKey}: cannot resolve price source for ${params.exchangeName} ${params.pair} (${error.message})`,
      );

      return actions;
    }

    if (!priceSource.isFinite() || priceSource.isLessThanOrEqualTo(0)) {
      coordinator.logger.warn(
        `Skipping cycle for ${strategyKey}: invalid price source ${priceSource.toFixed()} for ${
          params.exchangeName
        } ${params.pair}`,
      );

      return actions;
    }

    const activeOrders =
      this.exchangeOrderTrackerService?.getActiveSlotOrders?.(strategyKey) ||
      this.exchangeOrderTrackerService?.getOpenOrders?.(strategyKey) ||
      [];
    const liveOrders =
      this.exchangeOrderTrackerService?.getLiveOrders?.(strategyKey) ||
      activeOrders.filter(
        (order) =>
          order.status === 'open' || order.status === 'partially_filled',
      );

    if (this.strategyMarketDataProviderService) {
      const maxAgeMs = 30000;
      const freshness =
        this.strategyMarketDataProviderService.getTrackedOrderBookFreshness(
          params.exchangeName,
          params.pair,
          maxAgeMs,
        );

      if (!freshness.fresh) {
        this.appendAdaptivePmmSafetyCancels(
          actions,
          cancelledExchangeOrderIds,
          strategyKey,
          params,
          ts,
          liveOrders,
        );
        coordinator.logger.warn(
          `Skipping creates for ${strategyKey}: stale market data for ${params.exchangeName} ${params.pair}; emitted ${actions.length} cancel action(s)`,
        );

        return actions;
      }
    }
    const session = coordinator.getSession(strategyKey);
    const filledOrderDelay = Number(params.filledOrderDelay || 0);

    if (
      session &&
      Number.isFinite(filledOrderDelay) &&
      filledOrderDelay > 0 &&
      typeof session.lastFillTimestamp === 'number' &&
      Date.now() - session.lastFillTimestamp < filledOrderDelay
    ) {
      return [];
    }

    let realizedVolatility: number | null = null;
    let orderBookImbalance: number | null = null;
    let signalSnapshot: AdaptivePmmSignalSnapshot | null = null;

    this.pmmMarkoutEvaluatorService?.evaluateDue();
    const toxicityState =
      this.pmmMarkoutEvaluatorService?.getToxicity(strategyKey) || null;
    const runtimePressure = this.resolveAdaptivePmmRuntimePressure(
      strategyKey,
      params,
    );
    const currentBaseRatio = await this.resolveOrderScopedInventoryRatio(
      params,
      priceSource,
    );

    const shouldReadAdaptiveSignals = this.shouldReadAdaptivePmmSignals(params);
    const minSamples = Math.max(
      2,
      Math.floor(Number(params.volatilitySampleMinCount || 3)),
    );

    if (
      shouldReadAdaptiveSignals &&
      this.strategyMarketDataProviderService?.getAdaptivePmmSignalSnapshot
    ) {
      const sigmaWindowMs = Number(params.sigmaWindowMs || 60_000);
      const imbalanceDepthLevels = Math.max(
        1,
        Math.floor(Number(params.imbalanceDepthLevels || 1)),
      );
      const nextSignalSnapshot =
        this.strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot(
          priceExchange,
          params.pair,
          {
            priceSourceType: params.priceSourceType,
            sigmaWindowMs,
            staleSoftMs: Number(params.staleSoftMs || 2000),
            staleHardMs: Number(params.staleHardMs || 10_000),
            imbalanceDepthLevels,
            imbalanceMinDepthNotional: Number(
              params.imbalanceMinDepthNotional || 0,
            ),
            imbalanceSmoothingMs: Number(params.imbalanceSmoothingMs || 0),
            marketCrashWindowMs: Number(
              params.marketCrashWindowMs || sigmaWindowMs,
            ),
            marketCrashBps:
              params.marketCrashBps === undefined
                ? undefined
                : Number(params.marketCrashBps),
          },
        );

      signalSnapshot = nextSignalSnapshot;

      if (
        nextSignalSnapshot.midPriceHistory.length >= minSamples &&
        typeof nextSignalSnapshot.realizedVolatility === 'number' &&
        Number.isFinite(nextSignalSnapshot.realizedVolatility)
      ) {
        realizedVolatility = nextSignalSnapshot.realizedVolatility;
      }

      if (
        typeof nextSignalSnapshot.imbalance === 'number' &&
        Number.isFinite(nextSignalSnapshot.imbalance)
      ) {
        orderBookImbalance = nextSignalSnapshot.imbalance;
      }
    }

    if (
      signalSnapshot &&
      this.shouldBlockAdaptivePmmForMarketSafety(signalSnapshot)
    ) {
      this.appendAdaptivePmmSafetyCancels(
        actions,
        cancelledExchangeOrderIds,
        strategyKey,
        params,
        ts,
        liveOrders,
      );
      this.logAdaptivePmmDecisionSnapshot(strategyKey, {
        params,
        reason: 'market_safety_block',
        signalSnapshot,
        toxicityState,
        actions: actions.length,
        layers: 0,
      });

      return actions;
    }

    if (this.isAdaptivePmmReservationPaused(params)) {
      this.appendAdaptivePmmSafetyCancels(
        actions,
        cancelledExchangeOrderIds,
        strategyKey,
        params,
        ts,
        liveOrders,
      );
      this.logAdaptivePmmDecisionSnapshot(strategyKey, {
        params,
        reason: 'reservation_paused',
        signalSnapshot,
        toxicityState,
        actions: actions.length,
        layers: 0,
      });

      return actions;
    }

    this.updateAdaptivePmmCadence(strategyKey, params, realizedVolatility, coordinator);
    this.applyAdaptivePmmRuntimePressureCadence(
      strategyKey,
      params,
      runtimePressure,
      coordinator,
    );
    const warmupState = this.resolveAdaptivePmmWarmupState(
      strategyKey,
      params,
      signalSnapshot,
      minSamples,
    );
    const runtimePressureWiden = this.resolveAdaptivePmmRuntimePressureWiden(
      params,
      runtimePressure,
    );
    const sideRecoveryState = this.resolveAdaptivePmmSideRecoveryState(
      params,
      toxicityState,
    );

    const liveOrdersBySide = {
      buy: liveOrders.filter((order) => order.side === 'buy').length,
      sell: liveOrders.filter((order) => order.side === 'sell').length,
    };
    const availableBalances = await this.getAvailableBalancesForPair(
      params.exchangeName,
      params.pair,
      params.accountLabel,
      params.marketMakingOrderId,
    );
    const marketDataSoftStale =
      signalSnapshot?.freshness.status === 'soft_stale';
    const softStaleSpreadWiden = marketDataSoftStale
      ? Math.max(Number(params.bidSpread || 0), Number(params.askSpread || 0))
      : 0;
    const effectiveNumberOfLayers =
      warmupState.active || marketDataSoftStale
        ? 1
        : await this.resolveAdaptivePmmLayerCountFromBudget(
            params,
            priceSource,
            availableBalances,
          );
    const staleCancellationActions = this.getQuotePlanner().buildStaleOrderActions(
      strategyKey,
      params,
      ts,
      priceSource,
      liveOrders,
    );

    const cancelBudgetPerSec = Number(params.cancelBudgetPerSec || 0);

    for (const action of staleCancellationActions) {
      this.getQuotePlanner().appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        action,
        strategyKey,
        ts,
        cancelBudgetPerSec,
      );
    }

    const quotes = this.quoteExecutorManagerService
      ? this.quoteExecutorManagerService.buildQuotes({
          midPrice: priceSource.toFixed(),
          numberOfLayers: effectiveNumberOfLayers,
          bidSpread:
            warmupState.bidSpread + runtimePressureWiden + softStaleSpreadWiden,
          askSpread:
            warmupState.askSpread + runtimePressureWiden + softStaleSpreadWiden,
          orderAmount: warmupState.orderAmount,
          amountChangePerLayer: params.amountChangePerLayer,
          amountChangeType: params.amountChangeType,
          inventorySkewFactor: Number(params.inventorySkewFactor || 0),
          inventoryTargetBaseRatio: Number(
            params.inventoryTargetBaseRatio || 0.5,
          ),
          currentBaseRatio,
          makerHeavyMode: Boolean(params.makerHeavyMode),
          makerHeavyBiasBps: Number(params.makerHeavyBiasBps || 0),
          volBasedSpread: warmupState.active
            ? false
            : Boolean(params.volBasedSpread),
          realizedVolatility: warmupState.active ? null : realizedVolatility,
          spreadSigmaMultiplier: Number(params.spreadSigmaMultiplier || 0),
          maxAdaptiveSpread: Number(params.maxAdaptiveSpread || 0),
          orderBookImbalance: warmupState.active ? null : orderBookImbalance,
          imbalanceSkewFactor: warmupState.active
            ? 0
            : Number(params.imbalanceSkewFactor || 0),
          inventorySeverePivot: Number(params.inventorySeverePivot || 0),
          inventoryPauseSidePivot: Number(params.inventoryPauseSidePivot || 0),
          adaptiveSizeEnabled: Boolean(params.adaptiveSizeEnabled),
          sizeVolScalingFactor: Number(params.sizeVolScalingFactor || 0),
          sizeFloor: Number(params.sizeFloor || 0),
          maxLayersInVol: Number(params.maxLayersInVol || 0),
          buyToxicityScore: toxicityState?.buyScore || 0,
          sellToxicityScore: toxicityState?.sellScore || 0,
          toxicityWidenBps: Number(params.adverseMarkoutGuardBps || 0),
          buyPaused: Boolean(toxicityState?.buyPausedUntilMs),
          sellPaused: Boolean(toxicityState?.sellPausedUntilMs),
          buyRecoveryWidenBps: sideRecoveryState.buyWidenBps,
          sellRecoveryWidenBps: sideRecoveryState.sellWidenBps,
          buyRecoverySizeRatio: sideRecoveryState.buySizeRatio,
          sellRecoverySizeRatio: sideRecoveryState.sellSizeRatio,
        })
      : this.getQuotePlanner().buildLegacyQuotes(params, priceSource);

    coordinator.logger.log(
      `[${strategyKey}] midPrice=${priceSource.toFixed()} bidSpread=${
        warmupState.bidSpread
      } pressureWiden=${runtimePressureWiden} askSpread=${
        warmupState.askSpread
      } layers=${effectiveNumberOfLayers} liveBuys=${
        liveOrdersBySide.buy
      } liveSells=${liveOrdersBySide.sell}`,
    );
    this.logAdaptivePmmDecisionSnapshot(strategyKey, {
      params,
      reason: 'quote_build',
      signalSnapshot,
      toxicityState,
      actions: quotes.length,
      layers: effectiveNumberOfLayers,
      realizedVolatility,
      orderBookImbalance,
      buyPaused: Boolean(toxicityState?.buyPausedUntilMs),
      sellPaused: Boolean(toxicityState?.sellPausedUntilMs),
      warmupActive: warmupState.active,
      warmupReason: warmupState.reason,
      softStale: marketDataSoftStale,
      buyRecoveryActive: sideRecoveryState.buyActive,
      sellRecoveryActive: sideRecoveryState.sellActive,
      runtimePressure,
      runtimePressureWiden,
    });

    if (quotes.length === 0) {
      coordinator.logger.warn(
        `[${strategyKey}] reason=no_quotes_after_filters layers=${effectiveNumberOfLayers} buyPaused=${Boolean(
          toxicityState?.buyPausedUntilMs,
        )} sellPaused=${Boolean(toxicityState?.sellPausedUntilMs)}`,
      );
      this.logAdaptivePmmDecisionSnapshot(strategyKey, {
        params,
        reason: 'no_quotes_after_filters',
        signalSnapshot,
        toxicityState,
        actions: 0,
        layers: effectiveNumberOfLayers,
        realizedVolatility,
        orderBookImbalance,
        buyPaused: Boolean(toxicityState?.buyPausedUntilMs),
        sellPaused: Boolean(toxicityState?.sellPausedUntilMs),
        warmupActive: warmupState.active,
        warmupReason: warmupState.reason,
        softStale: marketDataSoftStale,
        buyRecoveryActive: sideRecoveryState.buyActive,
        sellRecoveryActive: sideRecoveryState.sellActive,
        runtimePressure,
        runtimePressureWiden,
      });
    }

    const minimumSpread = Number(params.minimumSpread || 0);
    const targetActionBySlot = new Map<string, ExecutorAction>();

    for (const quote of quotes) {
      const slotKey = quote.slotKey || `layer-${quote.layer}-${quote.side}`;
      const quotePrice = new BigNumber(quote.price);

      if (
        quote.side === 'buy' &&
        params.ceilingPrice !== undefined &&
        params.ceilingPrice > 0 &&
        priceSource.isGreaterThan(params.ceilingPrice)
      ) {
        coordinator.logger.log(
          `[${strategyKey}] Skipped ${slotKey} buy: price ${priceSource.toFixed()} > ceilingPrice ${
            params.ceilingPrice
          }`,
        );
        continue;
      }
      if (
        quote.side === 'sell' &&
        params.floorPrice !== undefined &&
        params.floorPrice > 0 &&
        priceSource.isLessThan(params.floorPrice)
      ) {
        coordinator.logger.log(
          `[${strategyKey}] Skipped ${slotKey} sell: price ${priceSource.toFixed()} < floorPrice ${
            params.floorPrice
          }`,
        );
        continue;
      }

      const effectiveSpread = quotePrice
        .minus(priceSource)
        .abs()
        .dividedBy(priceSource);
      const effectiveMinimumSpread = Math.max(
        minimumSpread,
        this.fillSettlementService?.estimateMakerFeeSpread(
          params.exchangeName,
          params.pair,
        ) || 0,
      );

      if (
        Number.isFinite(effectiveMinimumSpread) &&
        effectiveMinimumSpread > 0 &&
        effectiveSpread.isLessThan(effectiveMinimumSpread)
      ) {
        coordinator.logger.log(
          `[${strategyKey}] Skipped ${slotKey} ${quote.qty}@${
            quote.price
          }: effective spread ${effectiveSpread.toFixed()} < effectiveMinimumSpread ${effectiveMinimumSpread}`,
        );
        continue;
      }

      const quantized = await this.getQuotePlanner().quantizeAndValidateQuote(
        strategyKey,
        params.exchangeName,
        params.pair,
        params.accountLabel,
        quote.side,
        quote.layer,
        slotKey,
        new BigNumber(quote.qty),
        quotePrice,
        availableBalances,
      );

      if (!quantized) {
        continue;
      }

      targetActionBySlot.set(slotKey, {
        ...this.createIntent(
          strategyKey,
          strategyKey,
          params.userId,
          params.clientId,
          params.exchangeName,
          params.pair,
          quote.side,
          quantized.price,
          quantized.qty,
          ts,
          `mm-${slotKey}`,
          'clob_cex',
          undefined,
          true,
          params.accountLabel,
        ),
        slotKey,
      });
    }

    const unassignedActiveOrders = activeOrders.filter(
      (order) => !order.slotKey,
    );

    for (const order of unassignedActiveOrders) {
      this.getQuotePlanner().appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        this.getQuotePlanner().buildCancelOrderAction(
          strategyKey,
          params,
          order,
          ts,
          'unassigned',
        ),
        strategyKey,
        ts,
        cancelBudgetPerSec,
      );
    }

    if (unassignedActiveOrders.length > 0) {
      return actions;
    }

    const activeOrderBySlot = new Map<string, TrackedOrder>();

    for (const order of activeOrders) {
      if (!order.slotKey) {
        continue;
      }
      if (activeOrderBySlot.has(order.slotKey)) {
        coordinator.logger.log(
          `[${strategyKey}] reason=slot_occupied slotKey=${order.slotKey} exchangeOrderId=${order.exchangeOrderId}`,
        );
        continue;
      }
      activeOrderBySlot.set(order.slotKey, order);
    }

    const tolerance = new BigNumber(params.orderRefreshTolerancePct || 0);
    const slotKeys = new Set<string>([
      ...targetActionBySlot.keys(),
      ...activeOrderBySlot.keys(),
    ]);

    for (const slotKey of slotKeys) {
      const targetAction = targetActionBySlot.get(slotKey);
      const currentOrder = activeOrderBySlot.get(slotKey);

      if (!currentOrder && targetAction) {
        if (this.getQuotePlanner().isSlotWithinCancelCooldown(strategyKey, slotKey)) {
          coordinator.logger.log(
            `[${strategyKey}] reason=cancel_cooldown slotKey=${slotKey}`,
          );
          continue;
        }

        actions.push(targetAction);
        continue;
      }

      if (currentOrder && !targetAction) {
        this.getQuotePlanner().appendCancelAction(
          actions,
          cancelledExchangeOrderIds,
          this.getQuotePlanner().buildCancelOrderAction(
            strategyKey,
            params,
            currentOrder,
            ts,
            slotKey,
          ),
          strategyKey,
          ts,
          cancelBudgetPerSec,
        );
        continue;
      }

      if (!currentOrder || !targetAction) {
        continue;
      }

      if (
        currentOrder.status === 'pending_create' ||
        currentOrder.status === 'pending_cancel'
      ) {
        coordinator.logger.log(
          `[${strategyKey}] reason=waiting_cancel slotKey=${slotKey} status=${currentOrder.status}`,
        );
        continue;
      }

      if (this.getQuotePlanner().isQuoteWithinTolerance(currentOrder, targetAction, tolerance)) {
        coordinator.logger.log(
          `[${strategyKey}] reason=within_tolerance slotKey=${slotKey} exchangeOrderId=${currentOrder.exchangeOrderId}`,
        );
        continue;
      }

      this.getQuotePlanner().appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        this.getQuotePlanner().buildCancelOrderAction(
          strategyKey,
          params,
          currentOrder,
          ts,
          slotKey,
        ),
        strategyKey,
        ts,
        cancelBudgetPerSec,
      );
    }

    return actions;
  }



  private getQuotePlanner(): QuotePlannerService {
    if (!this.quotePlannerService) {
      throw new Error('QuotePlannerService is not available');
    }

    return this.quotePlannerService;
  }

  private getAdaptivePmmState(): AdaptivePmmStateService {
    if (!this.adaptivePmmStateService) {
      throw new Error('AdaptivePmmStateService is not available');
    }

    return this.adaptivePmmStateService;
  }

  private async shouldTriggerKillSwitch(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    coordinator: PureMarketMakingCoordinator,
  ): Promise<boolean> {
    const session = coordinator.getSession(strategyKey);
    const decision = this.killSwitchService?.evaluatePureMarketMaking(
      session,
      params,
    );

    if (!session || !decision?.triggered) {
      return false;
    }

    coordinator.logger.warn(
      `Kill switch triggered for ${strategyKey}: ${decision.reason}`,
    );
    await coordinator.stopStrategyForUser(
      session.userId,
      session.clientId,
      session.strategyType,
    );

    return true;
  }

  private async resolveOrderScopedInventoryRatio(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
  ): Promise<number> {
    return (
      (await this.orderScopedBalanceQueryService?.resolveInventoryRatio(
        params,
        referencePrice,
      )) ?? Number(params.currentBaseRatio || 0.5)
    );
  }

  private async resolveAdaptivePmmLayerCountFromBudget(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
    availableBalances: {
      base: BigNumber;
      quote: BigNumber;
      assets: { base: string; quote: string };
    } | null,
  ): Promise<number> {
    return this.getAdaptivePmmState().resolveAdaptivePmmLayerCountFromBudget(
      params,
      referencePrice,
      availableBalances,
    );
  }

  private shouldReadAdaptivePmmSignals(
    params: PureMarketMakingStrategyDto,
  ): boolean {
    return this.getAdaptivePmmState().shouldReadAdaptivePmmSignals(params);
  }

  private resolveAdaptivePmmWarmupState(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    signalSnapshot: AdaptivePmmSignalSnapshot | null,
    minSamples: number,
  ) {
    return this.getAdaptivePmmState().resolveAdaptivePmmWarmupState(
      strategyKey,
      params,
      signalSnapshot,
      minSamples,
    );
  }

  private resolveAdaptivePmmRuntimePressure(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
  ): StrategyRuntimePressureSnapshot | null {
    return this.getAdaptivePmmState().resolveAdaptivePmmRuntimePressure(
      strategyKey,
      params,
      this.runtimeObservationService,
    );
  }

  private resolveAdaptivePmmRuntimePressureWiden(
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
  ): number {
    return this.getAdaptivePmmState().resolveAdaptivePmmRuntimePressureWiden(
      params,
      pressure,
    );
  }

  private applyAdaptivePmmRuntimePressureCadence(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
    coordinator: PureMarketMakingCoordinator,
  ): void {
    const session = coordinator.getSession(strategyKey);

    if (
      this.getAdaptivePmmState().applyAdaptivePmmRuntimePressureCadence(
        params,
        pressure,
        session,
      ) &&
      session
    ) {
      coordinator.setSession(strategyKey, session);
    }
  }

  private resolveAdaptivePmmSideRecoveryState(
    params: PureMarketMakingStrategyDto,
    toxicityState: {
      buyLastPausedUntilMs?: number | null;
      sellLastPausedUntilMs?: number | null;
    } | null,
  ) {
    return this.getAdaptivePmmState().resolveAdaptivePmmSideRecoveryState(
      params,
      toxicityState,
    );
  }

  private shouldBlockAdaptivePmmForMarketSafety(
    signalSnapshot: AdaptivePmmSignalSnapshot,
  ): boolean {
    return this.getAdaptivePmmState().shouldBlockAdaptivePmmForMarketSafety(
      signalSnapshot,
    );
  }

  private isAdaptivePmmReservationPaused(
    params: PureMarketMakingStrategyDto,
  ): boolean {
    return this.getAdaptivePmmState().isAdaptivePmmReservationPaused(params);
  }

  private appendAdaptivePmmSafetyCancels(
    actions: ExecutorAction[],
    cancelledExchangeOrderIds: Set<string>,
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    liveOrders: TrackedOrder[],
  ): void {
    this.getAdaptivePmmState().appendAdaptivePmmSafetyCancels(
      actions,
      cancelledExchangeOrderIds,
      strategyKey,
      params,
      ts,
      liveOrders,
    );
  }

  private logAdaptivePmmDecisionSnapshot(
    strategyKey: string,
    snapshot: Parameters<AdaptivePmmStateService['logAdaptivePmmDecisionSnapshot']>[1],
  ): void {
    this.getAdaptivePmmState().logAdaptivePmmDecisionSnapshot(
      strategyKey,
      snapshot,
    );
  }

  private updateAdaptivePmmCadence(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    realizedVolatility: number | null,
    coordinator: PureMarketMakingCoordinator,
  ): void {
    const session = coordinator.getSession(strategyKey);

    if (
      this.getAdaptivePmmState().updateAdaptivePmmCadence(
        params,
        realizedVolatility,
        session,
      ) &&
      session
    ) {
      coordinator.setSession(strategyKey, session);
    }
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
    metadata?: Record<string, unknown>,
    postOnly?: boolean,
    accountLabel?: string,
    timeInForce?: 'GTC' | 'IOC',
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
      metadata,
      postOnly,
      accountLabel,
      timeInForce,
    );
  }

  private async getPriceSource(
    exchangeName: string,
    pair: string,
    priceSourceType: PureMarketMakingStrategyDto['priceSourceType'],
  ): Promise<number> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    return await this.strategyMarketDataProviderService.getReferencePrice(
      exchangeName,
      pair,
      priceSourceType,
    );
  }

  private async getAvailableBalancesForPair(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
    marketMakingOrderId?: string,
  ): Promise<{
    base: BigNumber;
    quote: BigNumber;
    assets: { base: string; quote: string };
  } | null> {
    return (
      (await this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
        exchangeName,
        pair,
        accountLabel,
        marketMakingOrderId,
      )) || null
    );
  }

  private createCoordinator(
    stopStrategyForUser: StrategyTickContext['stopStrategyForUser'],
  ): PureMarketMakingCoordinator {
    const registry = this.getStrategySessionRegistry();

    return {
      getSession: (key) => registry.sessions.get(key),
      setSession: (key, session) => registry.sessions.set(key, session),
      getConnectorHealthStatus: (exchange) =>
        registry.getConnectorHealthStatus(exchange),
      setConnectorHealthStatus: (exchange, status) =>
        registry.setConnectorHealthStatus(exchange, status),
      stopStrategyForUser,
      logger: this.logger,
    };
  }

  private getStrategySessionRegistry(): StrategySessionRegistryService {
    if (!this.strategySessionRegistryService) {
      throw new Error('StrategySessionRegistryService is not available');
    }

    return this.strategySessionRegistryService;
  }
}
