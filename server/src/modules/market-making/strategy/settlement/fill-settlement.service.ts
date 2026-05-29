import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { BalanceLedgerService } from '../../ledger/balance-ledger.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../../trackers/exchange-order-tracker.service';
import { DualAccountVolumeStrategyParams } from '../config/strategy-params.types';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import { StrategyRuntimeSession } from '../config/strategy-controller.types';
import { DualAccountPlannerService } from '../dual-account/dual-account-planner.service';
import { RuntimeObservationService } from '../observation/runtime-observation.service';

export type SettlementFill = {
  orderId?: string;
  exchangeOrderId?: string | null;
  clientOrderId?: string | null;
  accountLabel?: string | null;
  fillId?: string | null;
  side?: 'buy' | 'sell';
  price?: string;
  qty?: string;
  cumulativeQty?: string;
  feeAmount?: string;
  feeAsset?: string;
  receivedAt?: string;
};

export type FillSettlementCommand = {
  strategyKey: string;
  orderId: string;
  userId: string;
  pair: string;
  fill: SettlementFill;
};

export type FillSettlementSessionContext = {
  strategyKey: string;
  userId: string;
  clientId: string;
  marketMakingOrderId?: string;
  params?: Record<string, unknown>;
};

@Injectable()
export class FillSettlementService {
  private readonly logger = new CustomLogger(FillSettlementService.name);

  constructor(
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly exchangeInitService?: ExchangeInitService,
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly runtimeObservationService?: RuntimeObservationService,
  ) {}

  async handleSessionFill(
    session: StrategyRuntimeSession,
    fill: SettlementFill,
  ): Promise<void> {
    if (
      session.strategyType !== 'pureMarketMaking' &&
      session.strategyType !== 'dualAccountVolume' &&
      session.strategyType !== 'dualAccountBestCapacityVolume'
    ) {
      return;
    }

    const trackedOrder = this.resolveTrackedOrderForFill(session, fill);
    const settlementFill = this.buildIncrementalSettlementFill(
      trackedOrder,
      fill,
    );

    if (!settlementFill) {
      return;
    }

    let settled = false;

    try {
      settled = await this.settleFillForSession(session, settlementFill);
    } catch (error) {
      this.pauseFillSettlementReservations(session, settlementFill);
      throw error;
    }

    if (!settled) {
      return;
    }

    this.markTrackedFillSettled(trackedOrder, settlementFill);
    this.runtimeObservationService?.recordSessionPnL(session, settlementFill, {
      includeTradedQuoteVolume:
        session.strategyType === 'pureMarketMaking' ||
        trackedOrder?.role === 'taker',
    });

    if (
      session.strategyType === 'dualAccountVolume' ||
      session.strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const persistedParams = (
        await this.strategyInstanceRepository?.findOne({
          where: { strategyKey: session.strategyKey },
        })
      )?.parameters as Partial<DualAccountVolumeStrategyParams> | undefined;
      let nextParams = this.getDualAccountPlanner().mergeFillRuntimeIntoPersisted(
        session.params as DualAccountVolumeStrategyParams,
        persistedParams,
      );

      if (trackedOrder) {
        nextParams = await this.getDualAccountPlanner().applyFillProgress(
          fill,
          trackedOrder,
          nextParams,
        );
      }

      session.params = nextParams;
      session.tradedQuoteVolume = Number(nextParams.tradedQuoteVolume || 0);
      await this.persistStrategyParams(session.strategyKey, nextParams);
      session.nextRunAtMs = Math.min(session.nextRunAtMs, Date.now());

      return;
    }

    session.lastFillTimestamp = Date.now();
    this.runtimeObservationService?.recordPureMarketMakingMarkout(
      session,
      fill,
      session.lastFillTimestamp,
    );
    const delayMs = Number(
      (session.params as unknown as PureMarketMakingStrategyDto)
        .filledOrderDelay || 0,
    );

    session.nextRunAtMs =
      Number.isFinite(delayMs) && delayMs > 0
        ? Math.max(session.nextRunAtMs, session.lastFillTimestamp + delayMs)
        : Math.min(session.nextRunAtMs, Date.now());
  }

  resolveTrackedOrderForFill(
    session: FillSettlementSessionContext,
    fill: Pick<
      SettlementFill,
      'orderId' | 'exchangeOrderId' | 'clientOrderId' | 'accountLabel'
    >,
  ): TrackedOrder | undefined {
    const exchangeOrderId = this.readString(fill.exchangeOrderId);
    const clientOrderId = this.readString(fill.clientOrderId);
    const accountLabel = this.readString(fill.accountLabel);
    const exchange = this.readString(session.params?.exchangeName);

    if (exchangeOrderId) {
      const trackedOrder = this.exchangeOrderTrackerService?.getByExchangeOrderId(
        exchange,
        exchangeOrderId,
        accountLabel || undefined,
      );

      if (trackedOrder?.strategyKey === session.strategyKey) {
        return trackedOrder;
      }
    }

    const trackedOrders =
      this.exchangeOrderTrackerService?.getTrackedOrders(session.strategyKey) ||
      [];

    return trackedOrders.find((order) => {
      if (fill.orderId && order.orderId !== fill.orderId) {
        return false;
      }

      const accountMatches = !accountLabel || order.accountLabel === accountLabel;

      return (
        accountMatches &&
        ((exchangeOrderId && order.exchangeOrderId === exchangeOrderId) ||
          (clientOrderId && order.clientOrderId === clientOrderId))
      );
    });
  }

  buildIncrementalSettlementFill(
    trackedOrder: TrackedOrder | undefined,
    fill: SettlementFill,
  ): SettlementFill | null {
    if (!trackedOrder) {
      return {
        ...fill,
        cumulativeQty: fill.cumulativeQty || fill.qty,
      };
    }

    const settledCumulative = new BigNumber(trackedOrder.settledFilledQty || 0);
    const fillCumulative = new BigNumber(this.readString(fill.cumulativeQty));
    const trackedCumulative = new BigNumber(
      trackedOrder.cumulativeFilledQty || 0,
    );
    const fillQty = new BigNumber(this.readString(fill.qty));
    let effectiveCumulative: BigNumber | null = null;

    if (fillCumulative.isFinite() && fillCumulative.isGreaterThan(0)) {
      effectiveCumulative = fillCumulative;
    }

    if (trackedCumulative.isFinite() && trackedCumulative.isGreaterThan(0)) {
      effectiveCumulative = effectiveCumulative
        ? BigNumber.minimum(effectiveCumulative, trackedCumulative)
        : trackedCumulative;
    }

    if (!effectiveCumulative && fillQty.isFinite() && fillQty.isGreaterThan(0)) {
      effectiveCumulative = settledCumulative.plus(fillQty);
    }

    if (
      !settledCumulative.isFinite() ||
      !effectiveCumulative ||
      !effectiveCumulative.isFinite() ||
      !effectiveCumulative.isGreaterThan(settledCumulative)
    ) {
      return null;
    }

    const deltaQty = effectiveCumulative.minus(settledCumulative);

    if (!deltaQty.isFinite() || deltaQty.isLessThanOrEqualTo(0)) {
      return null;
    }

    return {
      ...fill,
      qty: deltaQty.toFixed(),
      cumulativeQty: effectiveCumulative.toFixed(),
    };
  }

  markTrackedFillSettled(
    trackedOrder: TrackedOrder | undefined,
    fill: Pick<SettlementFill, 'cumulativeQty' | 'receivedAt'>,
  ): void {
    if (!trackedOrder || !fill.cumulativeQty) {
      return;
    }

    this.exchangeOrderTrackerService?.markFillSettled({
      exchange: trackedOrder.exchange,
      exchangeOrderId: trackedOrder.exchangeOrderId,
      accountLabel: trackedOrder.accountLabel,
      cumulativeQty: fill.cumulativeQty,
      updatedAt: fill.receivedAt,
    });
  }

  pauseFillSettlementReservations(
    session: FillSettlementSessionContext,
    fill: Pick<SettlementFill, 'side'>,
  ): void {
    if (!this.balanceLedgerService || !fill.side) {
      return;
    }

    const pair = this.resolveSessionPair(session);
    const assets = pair ? this.parseBaseQuote(pair) : null;

    if (!assets) {
      return;
    }

    const assetId = fill.side === 'buy' ? assets.quote : assets.base;

    this.balanceLedgerService.pauseReservations(
      session.marketMakingOrderId || session.clientId,
      assetId,
    );
  }

  async settleFillForSession(
    session: FillSettlementSessionContext,
    fill: SettlementFill,
  ): Promise<boolean> {
    const pair = this.resolveSessionPair(session);

    if (!pair) {
      return false;
    }

    return await this.settleFill({
      strategyKey: session.strategyKey,
      orderId: session.marketMakingOrderId || session.clientId,
      userId: session.userId,
      pair,
      fill,
    });
  }

  estimateMakerFeeSpread(exchangeName: string, pair: string): number {
    try {
      const exchange = this.exchangeInitService?.getExchange(exchangeName);
      const market = exchange?.markets?.[pair];
      const makerFee = Number(
        market?.maker ?? exchange?.fees?.trading?.maker ?? 0,
      );

      return Number.isFinite(makerFee) && makerFee > 0 ? makerFee * 2 : 0;
    } catch {
      return 0;
    }
  }

  async settleFill(command: FillSettlementCommand): Promise<boolean> {
    if (
      !this.balanceLedgerService ||
      !command.fill.side ||
      !command.fill.price ||
      !command.fill.qty
    ) {
      return false;
    }

    const assets = this.parseBaseQuote(command.pair);

    if (!assets) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${command.strategyKey}: pair is missing or unparseable`,
      );

      return false;
    }

    const price = new BigNumber(command.fill.price);
    const qty = new BigNumber(command.fill.qty);

    if (
      !price.isFinite() ||
      !qty.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      qty.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${
          command.strategyKey
        }: invalid fill price/qty price=${command.fill.price || ''} qty=${
          command.fill.qty || ''
        }`,
      );

      return false;
    }

    const quoteAmount = price.multipliedBy(qty);
    const eventKey = this.buildFillLedgerEventKey(command);

    if (!eventKey) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${command.strategyKey}: missing canonical fill identity (need exchangeOrderId/clientOrderId AND cumulativeQty). exchangeOrderId=${
          command.fill.exchangeOrderId || ''
        } clientOrderId=${command.fill.clientOrderId || ''} cumulativeQty=${
          command.fill.cumulativeQty || ''
        } fillId=${command.fill.fillId || ''}`,
      );

      return false;
    }

    const baseDelta =
      command.fill.side === 'buy' ? qty.toFixed() : qty.negated().toFixed();
    const quoteDelta =
      command.fill.side === 'buy'
        ? quoteAmount.negated().toFixed()
        : quoteAmount.toFixed();

    await this.balanceLedgerService.adjust({
      orderId: command.orderId,
      userId: command.userId,
      assetId: assets.base,
      amount: baseDelta,
      idempotencyKey: `${eventKey}:base`,
      refType: 'market_making_fill',
      refId: this.resolveRefId(command),
    });

    await this.balanceLedgerService.adjust({
      orderId: command.orderId,
      userId: command.userId,
      assetId: assets.quote,
      amount: quoteDelta,
      idempotencyKey: `${eventKey}:quote`,
      refType: 'market_making_fill',
      refId: this.resolveRefId(command),
    });

    await this.applyFillFee(command, eventKey);

    return true;
  }

  private getDualAccountPlanner(): DualAccountPlannerService {
    if (!this.dualAccountPlannerService) {
      throw new Error('dual account planner service is not available');
    }

    return this.dualAccountPlannerService;
  }

  private async persistStrategyParams(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
  ): Promise<void> {
    await this.strategyInstanceRepository?.update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: getRFC3339Timestamp(),
      },
    );
  }

  private async applyFillFee(
    command: FillSettlementCommand,
    eventKey: string,
  ): Promise<void> {
    if (
      !this.balanceLedgerService ||
      !command.fill.feeAmount ||
      !command.fill.feeAsset
    ) {
      return;
    }

    const feeAmount = new BigNumber(command.fill.feeAmount);
    const feeAsset = String(command.fill.feeAsset || '').trim();

    if (
      !feeAsset ||
      !feeAmount.isFinite() ||
      feeAmount.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping fill fee ledger update for strategyKey=${
          command.strategyKey
        }: invalid fee asset=${command.fill.feeAsset || ''} amount=${
          command.fill.feeAmount || ''
        }`,
      );

      return;
    }

    try {
      await this.balanceLedgerService.debitFee({
        orderId: command.orderId,
        userId: command.userId,
        assetId: feeAsset,
        amount: feeAmount.toFixed(),
        idempotencyKey: `${eventKey}:fee:${feeAsset}`,
        refType: 'market_making_fee',
        refId: this.resolveRefId(command),
      });
    } catch (error) {
      this.logger.warn(
        `Fill fee debit requires manual review for strategyKey=${
          command.strategyKey
        } asset=${feeAsset} amount=${feeAmount.toFixed()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildFillLedgerEventKey(
    command: FillSettlementCommand,
  ): string | null {
    const fill = command.fill;
    const cumulativeQty = this.normalizePositiveNumber(fill.cumulativeQty);
    const orderIdentity = fill.exchangeOrderId || fill.clientOrderId;

    if (!orderIdentity || !fill.side || !cumulativeQty) {
      return null;
    }

    return [
      'mm-fill',
      command.strategyKey,
      orderIdentity,
      fill.side,
      cumulativeQty,
    ].join(':');
  }

  private normalizePositiveNumber(value: unknown): string | null {
    const numericValue = new BigNumber(String(value ?? ''));

    if (!numericValue.isFinite() || numericValue.isLessThanOrEqualTo(0)) {
      return null;
    }

    return numericValue.toFixed();
  }

  private resolveRefId(command: FillSettlementCommand): string {
    return (
      command.fill.exchangeOrderId ||
      command.fill.clientOrderId ||
      command.strategyKey
    );
  }

  private resolveSessionPair(session: FillSettlementSessionContext): string {
    return this.readString(
      session.params?.pair,
      this.readString(session.params?.symbol, ''),
    );
  }

  private readString(value: unknown, fallback = ''): string {
    if (value === undefined || value === null) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  private parseBaseQuote(pair: string): { base: string; quote: string } | null {
    const [base, quote] = String(pair || '').split('/');

    if (!base || !quote) {
      return null;
    }

    return {
      base,
      quote,
    };
  }
}
