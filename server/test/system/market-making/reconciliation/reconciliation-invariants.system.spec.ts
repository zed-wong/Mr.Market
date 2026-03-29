import 'reflect-metadata';

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ReconciliationService } from 'src/modules/market-making/reconciliation/reconciliation.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import type { Repository } from 'typeorm';

import { createSystemTestDatabaseConfig } from '../../helpers/sandbox-system.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('reconciliation-invariants');

describe('ReconciliationService persistence parity (system)', () => {
  jest.setTimeout(240000);

  const databaseConfig = createSystemTestDatabaseConfig(
    'reconciliation-invariants',
  );

  let moduleRef: TestingModule;
  let reconciliationService: ReconciliationService;
  let balanceRepository: Repository<BalanceReadModel>;
  let rewardLedgerRepository: Repository<RewardLedger>;
  let rewardAllocationRepository: Repository<RewardAllocation>;
  let strategyIntentRepository: Repository<StrategyOrderIntentEntity>;

  beforeAll(async () => {
    log.suite('initializing reconciliation system module', {
      databasePath: databaseConfig.databasePath,
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...databaseConfig.options,
          dropSchema: true,
          entities: [
            BalanceReadModel,
            RewardLedger,
            RewardAllocation,
            StrategyOrderIntentEntity,
          ],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          BalanceReadModel,
          RewardLedger,
          RewardAllocation,
          StrategyOrderIntentEntity,
        ]),
      ],
      providers: [
        ReconciliationService,
        {
          provide: ExchangeOrderTrackerService,
          useValue: {
            getOpenOrders: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    reconciliationService = moduleRef.get(ReconciliationService);
    balanceRepository = moduleRef.get(getRepositoryToken(BalanceReadModel));
    rewardLedgerRepository = moduleRef.get(getRepositoryToken(RewardLedger));
    rewardAllocationRepository = moduleRef.get(
      getRepositoryToken(RewardAllocation),
    );
    strategyIntentRepository = moduleRef.get(
      getRepositoryToken(StrategyOrderIntentEntity),
    );

    log.suite('reconciliation system module ready');
  });

  afterEach(async () => {
    await strategyIntentRepository.clear();
    await rewardAllocationRepository.clear();
    await rewardLedgerRepository.clear();
    await balanceRepository.clear();
  });

  afterAll(async () => {
    await moduleRef?.close();
    databaseConfig.cleanup();
    log.suite('reconciliation system module closed');
  });

  it('reports zero ledger violations for balanced rows and detects invalid totals', async () => {
    await balanceRepository.save(
      balanceRepository.create({
        userId: 'u1',
        assetId: 'usdt',
        available: '70',
        locked: '30',
        total: '100',
        updatedAt: getRFC3339Timestamp(),
      }),
    );

    const validReport = await reconciliationService.reconcileLedgerInvariants();

    expect(validReport).toEqual({ checked: 1, violations: 0 });

    await balanceRepository.clear();
    await balanceRepository.save(
      balanceRepository.create({
        userId: 'u1',
        assetId: 'usdt',
        available: '60',
        locked: '30',
        total: '100',
        updatedAt: getRFC3339Timestamp(),
      }),
    );

    const invalidReport =
      await reconciliationService.reconcileLedgerInvariants();

    log.result('ledger reconciliation reports collected', {
      validReport,
      invalidReport,
    });

    expect(invalidReport).toEqual({ checked: 1, violations: 1 });
  });

  it('reports zero reward violations when allocations fit and detects over-allocation', async () => {
    await rewardLedgerRepository.save(
      rewardLedgerRepository.create({
        txHash: 'tx-1',
        token: 'USDT',
        amount: '100',
        campaignId: 'campaign-1',
        dayIndex: 1,
        status: 'OBSERVED',
        observedAt: getRFC3339Timestamp(),
      }),
    );
    await rewardAllocationRepository.save(
      rewardAllocationRepository.create([
        {
          allocationId: 'allocation-1',
          rewardTxHash: 'tx-1',
          campaignId: 'campaign-1',
          dayIndex: 1,
          userId: 'user-1',
          token: 'USDT',
          amount: '40',
          basisShares: '40',
          createdAt: getRFC3339Timestamp(),
        },
        {
          allocationId: 'allocation-2',
          rewardTxHash: 'tx-1',
          campaignId: 'campaign-1',
          dayIndex: 1,
          userId: 'user-2',
          token: 'USDT',
          amount: '60',
          basisShares: '60',
          createdAt: getRFC3339Timestamp(),
        },
      ]),
    );

    const validReport =
      await reconciliationService.reconcileRewardConsistency();

    expect(validReport).toEqual({ checked: 1, violations: 0 });

    await rewardAllocationRepository.clear();
    await rewardAllocationRepository.save(
      rewardAllocationRepository.create([
        {
          allocationId: 'allocation-3',
          rewardTxHash: 'tx-1',
          campaignId: 'campaign-1',
          dayIndex: 1,
          userId: 'user-1',
          token: 'USDT',
          amount: '80',
          basisShares: '80',
          createdAt: getRFC3339Timestamp(),
        },
        {
          allocationId: 'allocation-4',
          rewardTxHash: 'tx-1',
          campaignId: 'campaign-1',
          dayIndex: 1,
          userId: 'user-2',
          token: 'USDT',
          amount: '30',
          basisShares: '30',
          createdAt: getRFC3339Timestamp(),
        },
      ]),
    );

    const invalidReport =
      await reconciliationService.reconcileRewardConsistency();

    log.result('reward reconciliation reports collected', {
      validReport,
      invalidReport,
    });

    expect(invalidReport).toEqual({ checked: 1, violations: 1 });
  });

  it('reports zero intent lifecycle violations for fresh valid intents and detects stale SENT intents', async () => {
    const freshTimestamp = new Date().toISOString();
    const staleTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();

    await strategyIntentRepository.save(
      strategyIntentRepository.create({
        intentId: 'intent-valid',
        strategyInstanceId: 'strategy-1',
        strategyKey: 'pure-mm:order-1',
        userId: 'user-1',
        clientId: 'order-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        type: 'CREATE_LIMIT_ORDER',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'DONE',
        mixinOrderId: 'exchange-order-1',
        createdAt: freshTimestamp,
        updatedAt: freshTimestamp,
      }),
    );

    const validReport =
      await reconciliationService.reconcileIntentLifecycleConsistency();

    expect(validReport).toEqual({ checked: 1, violations: 0 });

    await strategyIntentRepository.clear();
    await strategyIntentRepository.save(
      strategyIntentRepository.create({
        intentId: 'intent-stale',
        strategyInstanceId: 'strategy-1',
        strategyKey: 'pure-mm:order-1',
        userId: 'user-1',
        clientId: 'order-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        type: 'CREATE_LIMIT_ORDER',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'SENT',
        mixinOrderId: null,
        createdAt: staleTimestamp,
        updatedAt: staleTimestamp,
      }),
    );

    const invalidReport =
      await reconciliationService.reconcileIntentLifecycleConsistency();

    log.result('intent reconciliation reports collected', {
      validReport,
      invalidReport,
    });

    expect(invalidReport).toEqual({ checked: 1, violations: 1 });
  });
});
