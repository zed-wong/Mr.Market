import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { In, Repository } from 'typeorm';

import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { EvmExecutionReconciliationRunner } from '../evm-execution/evm-execution-reconciliation-runner.service';
import { WalletBalanceReconciliationRunner } from '../evm-execution/wallet-balance-reconciliation-runner.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import {
  LpPositionReconciliationRunner,
  LpPositionReconciliationResult,
} from '../lp/lp-position-reconciliation-runner.service';
import type { OnchainLpPositionState } from '../lp/lp.types';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../trackers/exchange-order-tracker.service';
import { ExchangeOrderReconciliationRunner } from './exchange-order-reconciliation-runner';

type ReconciliationReport = {
  checked: number;
  violations: number;
  corrected?: number;
};

export type OperationalReconciliationTarget = {
  clob?: { ts?: string };
  evmExecutionIds?: string[];
  wallets?: Array<{
    tradingAccountId: string;
    chainId: number;
    assetIds: string[];
  }>;
  lpPositions?: Array<{
    positionId: string;
    onchain: OnchainLpPositionState;
  }>;
};

export type OperationalReconciliationFamilyReport = {
  family: 'clob' | 'evm_execution' | 'wallet_balance' | 'lp_position';
  checked: number;
  violations: number;
  manualReview: number;
  paused: number;
};

export type OperationalReconciliationReport = {
  checked: number;
  violations: number;
  manualReview: number;
  paused: number;
  families: OperationalReconciliationFamilyReport[];
};

const ESTIMATED_FEE_MAX_AGE_MS = 15 * 60 * 1000;
const BASE_FILL_AMOUNT_TOLERANCE = new BigNumber('0.000000000001');
const QUOTE_FILL_AMOUNT_RELATIVE_TOLERANCE = new BigNumber('0.001');
const QUOTE_FILL_AMOUNT_ABSOLUTE_TOLERANCE = new BigNumber('0.01');

@Injectable()
export class ReconciliationService {
  private readonly logger = new CustomLogger(ReconciliationService.name);

  constructor(
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    @InjectRepository(RewardAllocation)
    private readonly rewardAllocationRepository: Repository<RewardAllocation>,
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
    @Optional()
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository?: Repository<LedgerEntry>,
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly marketMakingEventBus?: MarketMakingEventBus,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository?: Repository<MarketMakingOrder>,
    @Optional()
    private readonly exchangeOrderReconciliationRunner?: ExchangeOrderReconciliationRunner,
    @Optional()
    private readonly evmExecutionReconciliationRunner?: EvmExecutionReconciliationRunner,
    @Optional()
    private readonly walletBalanceReconciliationRunner?: WalletBalanceReconciliationRunner,
    @Optional()
    private readonly lpPositionReconciliationRunner?: LpPositionReconciliationRunner,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPeriodicReconciliation(): Promise<void> {
    const ledger = await this.reconcileLedgerInvariants();
    const rewards = await this.reconcileRewardConsistency();
    const intents = await this.reconcileIntentLifecycleConsistency();
    const estimatedFeeCorrections =
      await this.reconcileEstimatedFeeCorrections();
    const estimatedFees = await this.reconcileEstimatedFeeAging();
    const fillAttribution = await this.reconcileFillAttributionConsistency();
    const fillTrades = await this.reconcileFillsAgainstExchangeTrades();

    this.logger.log(
      `Ledger reconciliation checked=${ledger.checked} violations=${
        ledger.violations
      }; reward checked=${rewards.checked} violations=${
        rewards.violations
      }; intent checked=${intents.checked} violations=${
        intents.violations
      }; estimatedFee checked=${estimatedFees.checked} violations=${
        estimatedFees.violations
      } corrected=${
        estimatedFeeCorrections.corrected || 0
      }; fillAttribution checked=${fillAttribution.checked} violations=${
        fillAttribution.violations
      }; fillTrades checked=${fillTrades.checked} violations=${
        fillTrades.violations
      }`,
    );
  }

  async reconcileLedgerInvariants(): Promise<ReconciliationReport> {
    const rows = await this.orderBalanceRepository.find();
    let violations = 0;

    for (const row of rows) {
      const available = new BigNumber(row.available);
      const locked = new BigNumber(row.locked);
      const total = new BigNumber(row.total);

      if (!available.plus(locked).isEqualTo(total)) {
        violations += 1;
      }

      if (available.isLessThan(0) || locked.isLessThan(0)) {
        violations += 1;
      }
    }

    if (this.marketMakingOrderRepository) {
      const lockedUserOrderIds = rows
        .filter((row) => new BigNumber(row.locked).isGreaterThan(0))
        .map((row) => row.userOrderId || row.orderId);
      const uniqueLockedOrderIds = [...new Set(lockedUserOrderIds)];

      if (uniqueLockedOrderIds.length > 0) {
        const orders = await this.marketMakingOrderRepository.find({
          where: { orderId: In(uniqueLockedOrderIds) },
          select: ['orderId', 'state'],
        });
        const stateByOrderId = new Map(
          orders.map((order) => [order.orderId, order.state]),
        );

        for (const row of rows) {
          if (new BigNumber(row.locked).isLessThanOrEqualTo(0)) {
            continue;
          }

          const state = stateByOrderId.get(row.userOrderId || row.orderId);

          if (state && state !== 'running') {
            violations += 1;
          }
        }
      }
    }

    return {
      checked: rows.length,
      violations,
    };
  }

  getOpenOrdersForStrategy(strategyKey: string) {
    return this.exchangeOrderTrackerService.getLiveOrders(strategyKey);
  }

  async runOperationalSafetyReconciliation(
    target: OperationalReconciliationTarget = {},
  ): Promise<OperationalReconciliationReport> {
    const families: OperationalReconciliationFamilyReport[] = [];

    if (target.clob && this.exchangeOrderReconciliationRunner) {
      const checked = await this.exchangeOrderReconciliationRunner.runNow(
        target.clob.ts,
      );

      families.push({
        family: 'clob',
        checked,
        violations: 0,
        manualReview: 0,
        paused: 0,
      });
    }

    if (
      target.evmExecutionIds?.length &&
      this.evmExecutionReconciliationRunner
    ) {
      const family = this.emptyOperationalFamily('evm_execution');

      for (const executionId of target.evmExecutionIds) {
        const result =
          await this.evmExecutionReconciliationRunner.reconcileExecution(
            executionId,
          );

        family.checked += 1;

        if (!result.matches) {
          family.violations += 1;
          family.manualReview += 1;
          family.paused += await this.pauseOrderBalances(
            result.ledgerOrderId,
            {
              source: 'reconciliation',
              reason: `evm_execution_reconciliation_missing:${result.missingTypes.join(
                ',',
              )}`,
              refType: 'evm_execution',
              refId: result.executionId,
            },
          );
          this.marketMakingEventBus?.emitReconciliationAudit({
            correctionType: 'manual_review',
            orderId: result.ledgerOrderId,
            userOrderId: result.userOrderId,
            accountLabel: result.accountLabel,
            refType: 'evm_execution',
            refId: result.executionId,
            reason: `evm_execution_reconciliation_missing:${result.missingTypes.join(
              ',',
            )}`,
            observedAt: getRFC3339Timestamp(),
          });
        }
      }

      families.push(family);
    }

    if (target.wallets?.length && this.walletBalanceReconciliationRunner) {
      const family = this.emptyOperationalFamily('wallet_balance');

      for (const wallet of target.wallets) {
        const result =
          await this.walletBalanceReconciliationRunner.reconcileWallet(wallet);

        family.checked += wallet.assetIds.length;

        for (const mismatch of result.mismatches) {
          family.violations += 1;
          family.manualReview += 1;
          family.paused += await this.pauseWalletBalances({
            tradingAccountId: result.tradingAccountId,
            chainId: result.chainId,
            assetId: mismatch.assetId,
            reason: 'wallet_balance_mismatch',
          });
          this.marketMakingEventBus?.emitReconciliationAudit({
            correctionType: 'manual_review',
            assetId: mismatch.assetId,
            amount: mismatch.ledgerAmount,
            refType: 'wallet_balance',
            refId: `${result.tradingAccountId}:${result.chainId}:${mismatch.assetId}`,
            reason: 'wallet_balance_mismatch',
            observedAt: getRFC3339Timestamp(),
          });
        }
      }

      families.push(family);
    }

    if (target.lpPositions?.length && this.lpPositionReconciliationRunner) {
      const family = this.emptyOperationalFamily('lp_position');

      for (const lpPosition of target.lpPositions) {
        const result =
          await this.lpPositionReconciliationRunner.reconcilePosition(
            lpPosition.positionId,
            lpPosition.onchain,
          );

        family.checked += 1;

        if (!result.matches) {
          family.violations += 1;
          family.manualReview += 1;
          family.paused += await this.pauseLpPositionBalances(result);
          this.marketMakingEventBus?.emitReconciliationAudit({
            correctionType: 'manual_review',
            orderId: result.ledgerOrderId,
            userOrderId: result.userOrderId,
            accountLabel: result.accountLabel,
            refType: 'lp_position',
            refId: result.positionId,
            reason: `lp_position_mismatch:${result.mismatches.join(',')}`,
            observedAt: getRFC3339Timestamp(),
          });
        }
      }

      families.push(family);
    }

    return families.reduce(
      (summary, family) => ({
        checked: summary.checked + family.checked,
        violations: summary.violations + family.violations,
        manualReview: summary.manualReview + family.manualReview,
        paused: summary.paused + family.paused,
        families: summary.families,
      }),
      {
        checked: 0,
        violations: 0,
        manualReview: 0,
        paused: 0,
        families,
      },
    );
  }

  async reconcileRewardConsistency(): Promise<ReconciliationReport> {
    const rewards = await this.rewardLedgerRepository.find();
    const allocations = await this.rewardAllocationRepository.find();

    let violations = 0;

    for (const reward of rewards) {
      const rewardAmount = new BigNumber(reward.amount);
      const platformFee = new BigNumber(reward.platformFee || 0);
      const undistributedRemainder = new BigNumber(
        reward.undistributedRemainder || 0,
      );
      const allocated = allocations
        .filter((allocation) => allocation.rewardTxHash === reward.txHash)
        .reduce(
          (acc, allocation) => acc.plus(allocation.amount),
          new BigNumber(0),
        );
      const accounted = allocated
        .plus(platformFee)
        .plus(undistributedRemainder);

      if (!accounted.isEqualTo(rewardAmount)) {
        violations += 1;
      }
    }

    return {
      checked: rewards.length,
      violations,
    };
  }

  async reconcileIntentLifecycleConsistency(): Promise<ReconciliationReport> {
    const intents = await this.strategyOrderIntentRepository.find();
    let violations = 0;
    const now = Date.now();

    for (const intent of intents) {
      if (intent.status === 'SENT') {
        const ageMs = now - Date.parse(intent.updatedAt || intent.createdAt);

        if (Number.isFinite(ageMs) && ageMs > 5 * 60 * 1000) {
          violations += 1;
        }
      }
    }

    return {
      checked: intents.length,
      violations,
    };
  }

  async reconcileEstimatedFeeAging(
    maxAgeMs = ESTIMATED_FEE_MAX_AGE_MS,
  ): Promise<ReconciliationReport> {
    if (!this.ledgerEntryRepository) {
      return {
        checked: 0,
        violations: 0,
      };
    }

    const estimatedFeeEntries = await this.ledgerEntryRepository.find({
      where: {
        type: 'fee_debit',
        refType: 'market_making_estimated_fee',
      },
    });
    const reversedEstimatedFeeIds = await this.getReversedEstimatedFeeIds();
    const now = Date.now();
    let violations = 0;

    for (const entry of estimatedFeeEntries) {
      if (reversedEstimatedFeeIds.has(entry.entryId)) {
        continue;
      }

      const ageMs = now - Date.parse(entry.createdAt);

      if (Number.isFinite(ageMs) && ageMs > maxAgeMs) {
        violations += 1;
      }
    }

    return {
      checked: estimatedFeeEntries.length,
      violations,
    };
  }

  async reconcileFillAttributionConsistency(): Promise<ReconciliationReport> {
    if (!this.ledgerEntryRepository) {
      return {
        checked: 0,
        violations: 0,
      };
    }

    const fillEntries = await this.ledgerEntryRepository.find({
      where: {
        type: 'fill_settle',
        refType: 'market_making_fill',
      },
    });
    let violations = 0;

    for (const entry of fillEntries) {
      if (!entry.orderId || !entry.userId || !entry.refId) {
        violations += 1;
      }
    }

    return {
      checked: fillEntries.length,
      violations,
    };
  }

  async reconcileFillsAgainstExchangeTrades(): Promise<ReconciliationReport> {
    if (
      !this.ledgerEntryRepository ||
      !this.exchangeConnectorAdapterService ||
      typeof this.exchangeOrderTrackerService.getAllTrackedOrders !== 'function'
    ) {
      return {
        checked: 0,
        violations: 0,
      };
    }

    const fillEntries = await this.ledgerEntryRepository.find({
      where: {
        type: 'fill_settle',
        refType: 'market_making_fill',
      },
    });
    const trackedOrders =
      this.exchangeOrderTrackerService.getAllTrackedOrders();
    const trackedByExchangeOrderId = new Map<string, TrackedOrder>();
    const trackedByOrderId = new Map<string, TrackedOrder>();

    for (const order of trackedOrders) {
      trackedByExchangeOrderId.set(order.exchangeOrderId, order);
      trackedByOrderId.set(order.orderId, order);
    }

    const tradeEvidenceRefs = await this.fetchTradeEvidenceRefs(
      trackedOrders,
      this.getOldestFillCreatedAt(fillEntries),
    );
    const fillEntriesByRef = new Map<string, LedgerEntry[]>();
    let checked = 0;
    let violations = 0;

    for (const entry of fillEntries) {
      if (!entry.refId) {
        violations += 1;
        this.auditFillMismatch(entry, 'missing_fill_ref');
        continue;
      }

      checked += 1;

      const groupKey = this.buildFillEvidenceGroupKey(
        entry.orderId,
        entry.assetId,
        entry.refId,
      );

      if (!groupKey) {
        if (!tradeEvidenceRefs.has(entry.refId)) {
          violations += 1;
          this.auditFillMismatch(entry, 'missing_exchange_trade');
        }

        continue;
      }

      const group = fillEntriesByRef.get(groupKey) || [];
      group.push(entry);
      fillEntriesByRef.set(groupKey, group);
    }

    for (const entries of fillEntriesByRef.values()) {
      const entry = entries[0];

      if (!tradeEvidenceRefs.has(entry.refId)) {
        violations += 1;
        this.auditFillMismatch(entry, 'missing_exchange_trade');
        continue;
      }

      const trackedOrder =
        trackedByExchangeOrderId.get(entry.refId) ||
        trackedByOrderId.get(entry.orderId);

      if (
        trackedOrder &&
        !this.fillEntriesAmountMatchesTradeEvidence(
          entries,
          trackedOrder,
          tradeEvidenceRefs.get(entry.refId) || [],
        )
      ) {
        violations += 1;
        this.pauseAndAuditFillMismatch(entry, 'fill_amount_mismatch');
      }
    }

    return {
      checked,
      violations,
    };
  }

  async reconcileEstimatedFeeCorrections(): Promise<ReconciliationReport> {
    if (!this.ledgerEntryRepository || !this.balanceLedgerService) {
      return {
        checked: 0,
        violations: 0,
        corrected: 0,
      };
    }

    const [estimatedFeeEntries, actualFeeEntries, reversedEstimatedFeeIds] =
      await Promise.all([
        this.ledgerEntryRepository.find({
          where: {
            type: 'fee_debit',
            refType: 'market_making_estimated_fee',
          },
        }),
        this.ledgerEntryRepository.find({
          where: {
            type: 'fee_debit',
            refType: 'market_making_fee',
          },
        }),
        this.getReversedEstimatedFeeIds(),
      ]);
    const actualFeeRefs = new Set(
      actualFeeEntries
        .map((entry) =>
          this.buildFeeCorrectionKey(entry.orderId, entry.assetId, entry.refId),
        )
        .filter(Boolean),
    );
    let corrected = 0;

    for (const entry of estimatedFeeEntries) {
      if (reversedEstimatedFeeIds.has(entry.entryId)) {
        continue;
      }

      const correctionKey = this.buildFeeCorrectionKey(
        entry.orderId,
        entry.assetId,
        entry.refId,
      );

      if (!actualFeeRefs.has(correctionKey)) {
        continue;
      }

      const reversalAmount = new BigNumber(entry.amount).abs();

      if (!reversalAmount.isFinite() || reversalAmount.isZero()) {
        continue;
      }

      await this.balanceLedgerService.reverse({
        orderId: entry.orderId,
        ...(entry.userOrderId ? { userOrderId: entry.userOrderId } : {}),
        ...(entry.accountLabel ? { accountLabel: entry.accountLabel } : {}),
        userId: entry.userId,
        assetId: entry.assetId,
        amount: reversalAmount.toFixed(),
        idempotencyKey: `estimated-fee-reversal:${entry.entryId}`,
        refType: 'market_making_estimated_fee_reversal',
        refId: entry.refId,
        reversalOf: entry.entryId,
      });
      this.marketMakingEventBus?.emitReconciliationAudit({
        correctionType: 'estimated_fee_reversal',
        orderId: entry.orderId,
        ...(entry.userOrderId ? { userOrderId: entry.userOrderId } : {}),
        ...(entry.accountLabel ? { accountLabel: entry.accountLabel } : {}),
        userId: entry.userId,
        assetId: entry.assetId,
        amount: reversalAmount.toFixed(),
        refType: 'market_making_estimated_fee_reversal',
        refId: entry.refId || '',
        reversalOf: entry.entryId,
        observedAt: getRFC3339Timestamp(),
      });
      corrected += 1;
    }

    return {
      checked: estimatedFeeEntries.length,
      violations: 0,
      corrected,
    };
  }

  private async getReversedEstimatedFeeIds(): Promise<Set<string>> {
    if (!this.ledgerEntryRepository) {
      return new Set();
    }

    const reversalEntries = await this.ledgerEntryRepository.find({
      where: {
        type: 'reversal',
        refType: 'market_making_estimated_fee_reversal',
      },
    });

    return new Set(
      reversalEntries
        .map((entry) => entry.reversalOf)
        .filter((entryId): entryId is string => Boolean(entryId)),
    );
  }

  private buildFeeCorrectionKey(
    orderId?: string,
    assetId?: string,
    refId?: string | null,
  ): string {
    if (!orderId || !assetId || !refId) {
      return '';
    }

    return `${orderId}:${assetId}:${refId}`;
  }

  private emptyOperationalFamily(
    family: OperationalReconciliationFamilyReport['family'],
  ): OperationalReconciliationFamilyReport {
    return {
      family,
      checked: 0,
      violations: 0,
      manualReview: 0,
      paused: 0,
    };
  }

  private async pauseOrderBalances(
    orderId: string,
    metadata: {
      source: string;
      reason: string;
      refType: string;
      refId: string;
    },
  ): Promise<number> {
    if (!this.balanceLedgerService || !orderId) {
      return 0;
    }

    const balances = await this.orderBalanceRepository.find({
      where: { orderId },
    });

    for (const balance of balances) {
      this.balanceLedgerService.pauseReservations(
        balance.orderId,
        balance.assetId,
        metadata,
      );
    }

    return balances.length;
  }

  private async pauseWalletBalances(params: {
    tradingAccountId: string;
    chainId: number;
    assetId: string;
    reason: string;
  }): Promise<number> {
    if (!this.balanceLedgerService) {
      return 0;
    }

    const balances =
      await this.balanceLedgerService.findBalancesByTradingAccount(
        params.tradingAccountId,
        params.chainId,
      );
    const affected = balances.filter(
      (balance) => balance.assetId === params.assetId,
    );

    for (const balance of affected) {
      this.balanceLedgerService.pauseReservations(
        balance.orderId,
        balance.assetId,
        {
          source: 'reconciliation',
          reason: params.reason,
          refType: 'wallet_balance',
          refId: `${params.tradingAccountId}:${params.chainId}:${params.assetId}`,
        },
      );
    }

    return affected.length;
  }

  private async pauseLpPositionBalances(
    result: LpPositionReconciliationResult,
  ): Promise<number> {
    return await this.pauseOrderBalances(result.ledgerOrderId, {
      source: 'reconciliation',
      reason: `lp_position_mismatch:${result.mismatches.join(',')}`,
      refType: 'lp_position',
      refId: result.positionId,
    });
  }

  private buildFillEvidenceGroupKey(
    orderId?: string,
    assetId?: string,
    refId?: string | null,
  ): string {
    if (!orderId || !assetId || !refId) {
      return '';
    }

    return `${orderId}:${assetId}:${refId}`;
  }

  private async fetchTradeEvidenceRefs(
    trackedOrders: TrackedOrder[],
    since?: number,
  ): Promise<Map<string, Record<string, unknown>[]>> {
    const refs = new Map<string, Record<string, unknown>[]>();
    const seenGroups = new Set<string>();

    for (const order of trackedOrders) {
      const groupKey = `${order.exchange}:${order.accountLabel || 'default'}:${
        order.pair
      }`;

      if (seenGroups.has(groupKey)) {
        continue;
      }

      seenGroups.add(groupKey);

      const trades = await this.exchangeConnectorAdapterService?.fetchMyTrades(
        order.exchange,
        order.pair,
        since,
        1000,
        order.accountLabel,
      );

      for (const trade of Array.isArray(trades) ? trades : []) {
        const tradeId = this.extractTradeRef(trade, ['id', 'tradeId']);
        const orderId = this.extractTradeRef(trade, ['order', 'orderId']);

        if (tradeId) {
          this.addTradeEvidenceRef(refs, tradeId, trade);
        }

        if (orderId) {
          this.addTradeEvidenceRef(refs, orderId, trade);
        }
      }
    }

    return refs;
  }

  private getOldestFillCreatedAt(entries: LedgerEntry[]): number | undefined {
    const oldest = entries
      .map((entry) => Date.parse(entry.createdAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];

    return typeof oldest === 'number' ? oldest - 60 * 60 * 1000 : undefined;
  }

  private addTradeEvidenceRef(
    refs: Map<string, Record<string, unknown>[]>,
    ref: string,
    trade: Record<string, unknown>,
  ): void {
    const trades = refs.get(ref) || [];

    trades.push(trade);
    refs.set(ref, trades);
  }

  private fillEntriesAmountMatchesTradeEvidence(
    entries: LedgerEntry[],
    trackedOrder: TrackedOrder,
    trades: Record<string, unknown>[],
  ): boolean {
    const entry = entries[0];
    const expectedAmount = this.getExpectedFillAmountForAsset(
      entry.assetId,
      trackedOrder.pair,
      trades,
    );

    if (!expectedAmount) {
      return true;
    }

    return this.fillAmountsMatch(
      entry.assetId,
      trackedOrder.pair,
      entries.reduce(
        (total, fillEntry) => total.plus(fillEntry.amount),
        new BigNumber(0),
      ),
      expectedAmount,
    );
  }

  private fillAmountsMatch(
    assetId: string,
    pair: string,
    ledgerAmount: BigNumber,
    expectedAmount: BigNumber,
  ): boolean {
    const absoluteDifference = ledgerAmount
      .abs()
      .minus(expectedAmount.abs())
      .abs();
    const tolerance = this.getFillAmountTolerance(
      assetId,
      pair,
      expectedAmount,
    );

    return absoluteDifference.isLessThanOrEqualTo(tolerance);
  }

  private getFillAmountTolerance(
    assetId: string,
    pair: string,
    expectedAmount: BigNumber,
  ): BigNumber {
    const [, quoteAsset] = pair.split('/');

    if (assetId.toUpperCase() !== quoteAsset?.toUpperCase()) {
      return BASE_FILL_AMOUNT_TOLERANCE;
    }

    return BigNumber.maximum(
      QUOTE_FILL_AMOUNT_ABSOLUTE_TOLERANCE,
      expectedAmount.abs().multipliedBy(QUOTE_FILL_AMOUNT_RELATIVE_TOLERANCE),
    );
  }

  private getExpectedFillAmountForAsset(
    assetId: string,
    pair: string,
    trades: Record<string, unknown>[],
  ): BigNumber | null {
    if (!assetId) {
      return null;
    }

    const [baseAsset, quoteAsset] = pair.split('/');
    const normalizedAsset = assetId.toUpperCase();

    if (normalizedAsset === baseAsset?.toUpperCase()) {
      return this.sumTradeNumericField(trades, ['amount', 'qty', 'quantity']);
    }

    if (normalizedAsset === quoteAsset?.toUpperCase()) {
      const cost = this.sumTradeNumericField(trades, ['cost']);

      if (cost) {
        return cost;
      }

      return trades.reduce((total, trade) => {
        const amount = this.extractTradeNumber(trade, [
          'amount',
          'qty',
          'quantity',
        ]);
        const price = this.extractTradeNumber(trade, ['price']);

        if (!amount || !price) {
          return total;
        }

        return total.plus(amount.multipliedBy(price));
      }, new BigNumber(0));
    }

    return null;
  }

  private sumTradeNumericField(
    trades: Record<string, unknown>[],
    keys: string[],
  ): BigNumber | null {
    let found = false;
    const total = trades.reduce((sum, trade) => {
      const value = this.extractTradeNumber(trade, keys);

      if (!value) {
        return sum;
      }

      found = true;

      return sum.plus(value);
    }, new BigNumber(0));

    return found ? total : null;
  }

  private extractTradeNumber(
    trade: Record<string, unknown>,
    keys: string[],
  ): BigNumber | null {
    for (const key of keys) {
      const value = trade[key];
      const amount =
        typeof value === 'number' || typeof value === 'string'
          ? new BigNumber(value)
          : null;

      if (amount?.isFinite()) {
        return amount;
      }
    }

    return null;
  }

  private pauseAndAuditFillMismatch(entry: LedgerEntry, reason: string): void {
    if (entry.orderId && entry.assetId) {
      this.balanceLedgerService?.pauseReservations(
        entry.orderId,
        entry.assetId,
        {
          source: 'reconciliation',
          reason,
          refType: entry.refType || 'market_making_fill',
          refId: entry.refId || entry.entryId,
        },
      );
    }

    this.auditFillMismatch(entry, reason);
  }

  private auditFillMismatch(entry: LedgerEntry, reason: string): void {
    this.marketMakingEventBus?.emitReconciliationAudit({
      correctionType: 'manual_review',
      orderId: entry.orderId,
      ...(entry.userOrderId ? { userOrderId: entry.userOrderId } : {}),
      ...(entry.accountLabel ? { accountLabel: entry.accountLabel } : {}),
      userId: entry.userId,
      assetId: entry.assetId,
      amount: entry.amount,
      refType: entry.refType || 'market_making_fill',
      refId: entry.refId || entry.entryId,
      reason,
      observedAt: getRFC3339Timestamp(),
    });
  }

  private extractTradeRef(
    trade: Record<string, unknown>,
    keys: string[],
  ): string {
    for (const key of keys) {
      const value = trade[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }
}
