/* eslint-disable @typescript-eslint/no-explicit-any */
import { getRepositoryToken } from '@nestjs/typeorm';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { createStrategyKey } from 'src/common/helpers/strategyKey';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { PrivateStreamTrackerService } from 'src/modules/market-making/trackers/private-stream-tracker.service';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';

import { AdminDirectMarketMakingService } from '../../../../src/modules/admin/market-making/admin-direct-mm.service';
import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import {
  getSystemSandboxSkipReason,
  hasSecondarySystemSandboxAccount,
  pollUntil,
  readSystemSandboxConfig,
  waitForInitializedExchange,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const dualSkipReason =
  envSkipReason ||
  (config && !hasSecondarySystemSandboxAccount(config)
    ? 'missing secondary sandbox account credentials'
    : null);
const log = createSystemTestLogger('admin-direct-dual-account-volume');

if (dualSkipReason) {
  logSystemSkip('admin direct dual-account volume suite', dualSkipReason);
}

const describeSandbox = dualSkipReason ? describe.skip : describe;

describeSandbox('Admin direct dual-account volume runtime (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing single tick helper');
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('helper ready', {
      exchangeId: config?.exchangeId,
      makerAccountLabel: config?.accountLabel,
      takerAccountLabel: config?.account2Label,
    });
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('starts a dual-account direct order, executes one maker+taker cycle, reports live counters, and stops cleanly', async () => {
    const moduleRef = helper.getModuleRef();
    const strategyDefinitionRepository = moduleRef.get(
      getRepositoryToken(StrategyDefinition),
    );
    const strategyExecutionHistoryRepository = moduleRef.get(
      getRepositoryToken(StrategyExecutionHistory),
    );
    const strategyInstanceRepository = moduleRef.get(
      getRepositoryToken(StrategyInstance),
    );
    const userOrdersService = moduleRef.get(UserOrdersService);
    const marketMakingRuntimeService = moduleRef.get(
      MarketMakingRuntimeService,
    );
    const exchangeInitService = moduleRef.get(ExchangeInitService);
    const executorRegistry = moduleRef.get(ExecutorRegistry);
    const strategyService = moduleRef.get(StrategyService);
    const strategyIntentStoreService = moduleRef.get(
      StrategyIntentStoreService,
    );
    const exchangeOrderTrackerService = moduleRef.get(
      ExchangeOrderTrackerService,
    );
    const privateStreamTrackerService = moduleRef.get(
      PrivateStreamTrackerService,
    );
    const orderBookTrackerService = moduleRef.get(OrderBookTrackerService);
    const campaignService = moduleRef.get(CampaignService, { strict: false });

    await waitForInitializedExchange(
      exchangeInitService,
      config!.exchangeId,
      config!.account2Label!,
    );

    const strategyDefinition = await strategyDefinitionRepository.save(
      strategyDefinitionRepository.create({
        key: `admin-direct-dual-${Date.now().toString(36)}`,
        name: 'Admin Direct Dual Account Volume',
        controllerType: 'dualAccountVolume',
        configSchema: {},
        defaultConfig: {},
        enabled: true,
        visibility: 'system',
      }),
    );

    const adminDirectService = new AdminDirectMarketMakingService(
      moduleRef.get(getRepositoryToken(MarketMakingOrder)) as any,
      {
        findOne: jest.fn().mockResolvedValue(null),
      } as any,
      strategyDefinitionRepository as any,
      userOrdersService as any,
      marketMakingRuntimeService as any,
      {
        getDefinitionControllerType: jest
          .fn()
          .mockReturnValue('dualAccountVolume'),
        resolveForOrderSnapshot: jest
          .fn()
          .mockImplementation(
            async (
              _strategyDefinitionId: string,
              overrides: Record<string, unknown>,
            ) => ({
              controllerType: 'dualAccountVolume',
              resolvedConfig: {
                ...overrides,
                baseTradeAmount: 0.001,
                baseIntervalTime: 10,
                numTrades: 2,
                baseIncrementPercentage: 0.1,
                pricePushRate: 0,
                makerDelayMs: 1000,
                dynamicRoleSwitching: false,
              },
            }),
          ),
      } as any,
      {
        readAPIKey: jest.fn().mockImplementation(async (apiKeyId: string) => {
          if (apiKeyId === 'sandbox-maker') {
            return {
              exchange: config!.exchangeId,
              key_id: config!.accountLabel,
              name: 'Sandbox Maker',
            };
          }

          if (apiKeyId === 'sandbox-taker') {
            return {
              exchange: config!.exchangeId,
              key_id: config!.account2Label,
              name: 'Sandbox Taker',
            };
          }

          return null;
        }),
      } as any,
      exchangeInitService as any,
      executorRegistry as any,
      strategyService as any,
      strategyIntentStoreService as any,
      exchangeOrderTrackerService as any,
      privateStreamTrackerService as any,
      orderBookTrackerService as any,
      (campaignService || {
        getCampaigns: jest.fn().mockResolvedValue([]),
        joinCampaignWithAuth: jest.fn().mockResolvedValue(undefined),
      }) as any,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as any,
    );

    log.step('starting dual-account direct order');
    const started = await adminDirectService.directStart(
      {
        exchangeName: config!.exchangeId,
        pair: config!.symbol,
        strategyDefinitionId: strategyDefinition.id,
        makerApiKeyId: 'sandbox-maker',
        takerApiKeyId: 'sandbox-taker',
        configOverrides: {},
      },
      'admin-user',
    );

    expect(started.state).toBe('running');

    const initialSession = helper.getExecutorSession(
      config!.exchangeId,
      config!.symbol,
      started.orderId,
    );
    const initialStrategy = await strategyInstanceRepository.findOne({
      where: {
        clientId: started.orderId,
        strategyType: 'dualAccountVolume',
      },
    });

    log.result('post-start runtime snapshot', {
      hasSession: Boolean(initialSession),
      sessionCadenceMs: initialSession?.cadenceMs,
      nextRunAtMs: initialSession?.nextRunAtMs,
      strategyKey: initialStrategy?.strategyKey,
      publishedCycles: initialStrategy?.parameters?.publishedCycles,
      completedCycles: initialStrategy?.parameters?.completedCycles,
    });

    log.step('executing one dual-account tick');
    await helper.forceSessionReadyForNextTick(started.orderId);
    await helper.runSingleTick(started.orderId);

    const afterTickStrategy = await strategyInstanceRepository.findOne({
      where: {
        clientId: started.orderId,
        strategyType: 'dualAccountVolume',
      },
    });
    const postTickExecutor = executorRegistry.findExecutorByOrderId(
      started.orderId,
    );
    const postTickErrors =
      postTickExecutor && typeof postTickExecutor.getRecentErrors === 'function'
        ? postTickExecutor.getRecentErrors(started.orderId)
        : [];

    log.result('post-tick strategy snapshot', {
      strategyKey: afterTickStrategy?.strategyKey,
      publishedCycles: afterTickStrategy?.parameters?.publishedCycles,
      completedCycles: afterTickStrategy?.parameters?.completedCycles,
      latestIntents: strategyService.getLatestIntentsForStrategy(
        afterTickStrategy?.strategyKey || '',
      ).length,
      recentErrors: postTickErrors,
    });

    log.step('waiting for live runtime params to reflect the cycle');
    const liveStrategy = await pollUntil(
      async () =>
        await strategyInstanceRepository.findOne({
          where: {
            clientId: started.orderId,
            strategyType: 'dualAccountVolume',
          },
        }),
      async (value) => Number(value?.parameters?.publishedCycles || 0) >= 1,
      {
        description: 'dual-account published cycle counter to update',
        intervalMs: 500,
        timeoutMs: 30000,
      },
    );
    const status = await adminDirectService.getDirectOrderStatus(
      started.orderId,
    );

    const strategyKey = createStrategyKey({
      type: 'dualAccountVolume',
      user_id: 'admin-user',
      client_id: started.orderId,
    });
    const trackedOrders =
      exchangeOrderTrackerService.getTrackedOrders(strategyKey);
    const executionHistory = await strategyExecutionHistoryRepository.find({
      where: { clientId: started.orderId },
      order: { executedAt: 'ASC' },
    });
    const finalLiveStrategy = await pollUntil(
      async () =>
        await strategyInstanceRepository.findOne({
          where: {
            clientId: started.orderId,
            strategyType: 'dualAccountVolume',
          },
        }),
      async (value) => Number(value?.parameters?.completedCycles || 0) >= 1,
      {
        description: 'dual-account completed cycle counter to update',
        intervalMs: 250,
        timeoutMs: 10000,
      },
    );
    const finalStatus = await adminDirectService.getDirectOrderStatus(
      started.orderId,
    );

    expect(status.controllerType).toBe('dualAccountVolume');
    expect(status.runtimeState).toBe('active');
    expect(status.makerAccountLabel).toBe(config!.accountLabel);
    expect(status.takerAccountLabel).toBe(config!.account2Label);
    expect(status.makerAccountName).toBe('Sandbox Maker');
    expect(status.takerAccountName).toBe('Sandbox Taker');
    expect(status.orderConfig.publishedCycles).toBeGreaterThanOrEqual(1);
    expect(
      Number(liveStrategy?.parameters?.publishedCycles || 0),
    ).toBeGreaterThanOrEqual(1);
    expect(status.inventoryBalances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountLabel: 'maker' }),
        expect.objectContaining({ accountLabel: 'taker' }),
      ]),
    );
    expect(trackedOrders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountLabel: config!.accountLabel,
          role: 'maker',
        }),
        expect.objectContaining({
          accountLabel: config!.account2Label,
          role: 'taker',
        }),
      ]),
    );
    expect(executionHistory).toHaveLength(2);
    expect(new Set(executionHistory.map((entry) => entry.side))).toEqual(
      new Set(['buy', 'sell']),
    );
    expect(
      Number(finalLiveStrategy?.parameters?.completedCycles || 0),
    ).toBeGreaterThanOrEqual(1);
    expect(finalStatus.orderConfig.completedCycles).toBeGreaterThanOrEqual(1);

    log.step('stopping dual-account direct order');
    await adminDirectService.directStop(started.orderId);

    const stoppedStatus = await adminDirectService.getDirectOrderStatus(
      started.orderId,
    );

    expect(stoppedStatus.state).toBe('stopped');
    expect(stoppedStatus.runtimeState).toBe('stopped');
  });
});
