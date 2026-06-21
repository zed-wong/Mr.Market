import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import {
  CustomLogger,
  MarketMakingLogger,
} from 'src/modules/infrastructure/logger/logger.service';

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
import { StrategyExecutionCategory } from '../config/strategy-execution-category';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import type { ConnectorHealthStatus } from '../config/strategy-params.types';
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
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import { FillSettlementService } from '../settlement/fill-settlement.service';

export type PureMarketMakingCoordinator = {
  getSession(strategyKey: string): StrategyRuntimeSession | undefined;
  setSession(strategyKey: string, session: StrategyRuntimeSession): void;
  getConnectorHealthStatus(exchange: string): ConnectorHealthStatus;
  setConnectorHealthStatus(
    exchange: string,
    status: ConnectorHealthStatus,
  ): void;
  logger: Pick<CustomLogger, 'log' | 'warn' | 'marketMaking'>;
};

@Injectable()
export class PureMarketMakingStrategyController implements StrategyController {
  readonly strategyType = 'pureMarketMaking' as const;
  private readonly logger = new CustomLogger(
    PureMarketMakingStrategyController.name,
  );

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
      this.createCoordinator(),
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
    const mmLog = this.getCoordinatorMmLog(coordinator);
    const actions: ExecutorAction[] = [];
    const cancelledExchangeOrderIds = new Set<string>();
    const priceExchange = params.oracleExchangeName
      ? params.oracleExchangeName
      : params.exchangeName;

    const killSwitchStopAction = await this.maybeBuildKillSwitchStopAction(
      strategyKey,
      params,
      ts,
      coordinator,
    );

    if (killSwitchStopAction) {
      return [killSwitchStopAction];
    }

    if (
      coordinator.getConnectorHealthStatus(params.exchangeName) !== 'CONNECTED'
    ) {
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
        mmLog.error('strategy stopped', {
          reason: 'runtime_reject_threshold',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          count: pressure.rejectCount,
          threshold: maxConsecutiveRejects,
        });
        const session = coordinator.getSession(strategyKey);

        if (session) {
          return [
            this.buildStopControllerAction(
              session,
              ts,
              'runtime_reject_threshold',
            ),
          ];
        }

        return [];
      }
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

    const priceSource = this.resolveTrackedPmmPriceSource(
      priceExchange,
      params,
    );

    if (
      !priceSource ||
      !priceSource.isFinite() ||
      priceSource.isLessThanOrEqualTo(0)
    ) {
      this.appendAdaptivePmmSafetyCancels(
        actions,
        cancelledExchangeOrderIds,
        strategyKey,
        params,
        ts,
        liveOrders,
      );
      mmLog.warn(
        'strategy blocked',
        {
          reason: 'price_source_unavailable',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          actions: actions.length,
          referenceExchange: priceExchange,
        },
        {
          onceKey: `pmm-price-source-unavailable:${strategyKey}`,
          windowMs: 60_000,
        },
      );

      return actions;
    }

    if (
      this.hasUnsafeTrackedPmmBookFreshness(
        priceExchange,
        params.exchangeName,
        params,
      )
    ) {
      this.appendAdaptivePmmSafetyCancels(
        actions,
        cancelledExchangeOrderIds,
        strategyKey,
        params,
        ts,
        liveOrders,
      );
      mmLog.warn(
        'strategy blocked',
        {
          reason: 'order_book_stale',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          actions: actions.length,
          referenceExchange: priceExchange,
        },
        {
          onceKey: `pmm-order-book-stale:${strategyKey}`,
          windowMs: 60_000,
        },
      );

      return actions;
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

    this.updateAdaptivePmmCadence(
      strategyKey,
      params,
      realizedVolatility,
      coordinator,
    );
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
    const staleCancellationActions =
      this.getQuotePlanner().buildStaleOrderActions(
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

    mmLog.debug('strategy decision', {
      strategy: strategyKey,
      exchange: params.exchangeName,
      pair: params.pair,
      account: params.accountLabel || 'default',
      layers: effectiveNumberOfLayers,
      midPrice: priceSource.toFixed(),
      bidSpread: warmupState.bidSpread,
      askSpread: warmupState.askSpread,
      pressureWiden: runtimePressureWiden,
      liveBuys: liveOrdersBySide.buy,
      liveSells: liveOrdersBySide.sell,
    });
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
      mmLog.warn(
        'strategy skipped',
        {
          reason: 'no_quotes_after_filters',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          layers: effectiveNumberOfLayers,
          buyPaused: Boolean(toxicityState?.buyPausedUntilMs),
          sellPaused: Boolean(toxicityState?.sellPausedUntilMs),
        },
        {
          onceKey: `pmm-no-quotes:${strategyKey}`,
          windowMs: 60_000,
        },
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
        mmLog.debug('quote filtered', {
          reason: 'ceiling_price',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          side: quote.side,
          slot: slotKey,
          price: priceSource.toFixed(),
          ceilingPrice: params.ceilingPrice,
        });
        continue;
      }
      if (
        quote.side === 'sell' &&
        params.floorPrice !== undefined &&
        params.floorPrice > 0 &&
        priceSource.isLessThan(params.floorPrice)
      ) {
        mmLog.debug('quote filtered', {
          reason: 'floor_price',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          side: quote.side,
          slot: slotKey,
          price: priceSource.toFixed(),
          floorPrice: params.floorPrice,
        });
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
        mmLog.debug('quote filtered', {
          reason: 'minimum_spread',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          side: quote.side,
          slot: slotKey,
          required: effectiveMinimumSpread,
          available: effectiveSpread.toFixed(),
        });
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
          'clob',
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
        mmLog.debug('quote skipped', {
          reason: 'slot_occupied',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          slot: order.slotKey,
          order: order.exchangeOrderId,
        });
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
        if (
          this.getQuotePlanner().isSlotWithinCancelCooldown(
            strategyKey,
            slotKey,
          )
        ) {
          mmLog.debug('quote skipped', {
            reason: 'cancel_cooldown',
            strategy: strategyKey,
            exchange: params.exchangeName,
            pair: params.pair,
            account: params.accountLabel || 'default',
            slot: slotKey,
          });
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
        mmLog.debug('quote skipped', {
          reason: 'waiting_cancel',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          slot: slotKey,
          status: currentOrder.status,
        });
        continue;
      }

      if (
        this.getQuotePlanner().isQuoteWithinTolerance(
          currentOrder,
          targetAction,
          tolerance,
        )
      ) {
        mmLog.debug('quote skipped', {
          reason: 'within_tolerance',
          strategy: strategyKey,
          exchange: params.exchangeName,
          pair: params.pair,
          account: params.accountLabel || 'default',
          slot: slotKey,
          order: currentOrder.exchangeOrderId,
        });
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

  private async maybeBuildKillSwitchStopAction(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    coordinator: PureMarketMakingCoordinator,
  ): Promise<ExecutorAction | null> {
    const session = coordinator.getSession(strategyKey);
    const decision = this.killSwitchService?.evaluatePureMarketMaking(
      session,
      params,
    );

    if (!session || !decision?.triggered) {
      return null;
    }

    this.getCoordinatorMmLog(coordinator).error('strategy stopped', {
      reason: decision.reason,
      strategy: strategyKey,
      exchange: params.exchangeName,
      pair: params.pair,
      account: params.accountLabel || 'default',
    });

    return this.buildStopControllerAction(session, ts, decision.reason);
  }

  private getCoordinatorMmLog(
    coordinator: PureMarketMakingCoordinator,
  ): MarketMakingLogger {
    return coordinator.logger.marketMaking();
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
    snapshot: Parameters<
      AdaptivePmmStateService['logAdaptivePmmDecisionSnapshot']
    >[1],
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

  private resolveTrackedPmmPriceSource(
    exchangeName: string,
    params: PureMarketMakingStrategyDto,
  ): BigNumber | null {
    if (!this.strategyMarketDataProviderService) {
      return null;
    }

    const maxAgeMs = this.resolvePmmTrackedBookMaxAgeMs(params);
    const snapshot =
      this.strategyMarketDataProviderService.getTrackedReferencePriceSnapshot(
        exchangeName,
        params.pair,
        params.priceSourceType,
        maxAgeMs,
      );

    if (!snapshot) {
      return null;
    }

    return new BigNumber(snapshot.price);
  }

  private hasUnsafeTrackedPmmBookFreshness(
    referenceExchangeName: string,
    executionExchangeName: string,
    params: PureMarketMakingStrategyDto,
  ): boolean {
    if (!this.strategyMarketDataProviderService) {
      return true;
    }

    const maxAgeMs = this.resolvePmmTrackedBookMaxAgeMs(params);
    const exchanges = new Set(
      [referenceExchangeName, executionExchangeName].filter(Boolean),
    );

    for (const exchangeName of exchanges) {
      const freshness =
        this.strategyMarketDataProviderService.getTrackedOrderBookFreshness(
          exchangeName,
          params.pair,
          maxAgeMs,
        );

      if (!freshness.fresh) {
        return true;
      }
    }

    return false;
  }

  private resolvePmmTrackedBookMaxAgeMs(
    params: PureMarketMakingStrategyDto,
  ): number {
    const configured = Number(params.staleHardMs || 0);

    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }

    return 30000;
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

  private buildStopControllerAction(
    session: StrategyRuntimeSession,
    ts: string,
    reason: string,
  ): ExecutorAction {
    return {
      type: 'STOP_CONTROLLER',
      intentId: `${session.strategyKey}:${ts}:stop-${reason}`,
      runtimeInstanceKey: session.strategyKey,
      strategyKey: session.strategyKey,
      userId: session.userId,
      clientId: session.clientId,
      exchange: '',
      pair: '',
      side: 'buy',
      price: '0',
      qty: '0',
      metadata: { reason },
      createdAt: ts,
    };
  }

  private createCoordinator(): PureMarketMakingCoordinator {
    const registry = this.getStrategySessionRegistry();

    return {
      getSession: (key) => registry.sessions.get(key),
      setSession: (key, session) => registry.sessions.set(key, session),
      getConnectorHealthStatus: (exchange) =>
        registry.getConnectorHealthStatus(exchange),
      setConnectorHealthStatus: (exchange, status) =>
        registry.setConnectorHealthStatus(exchange, status),
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
