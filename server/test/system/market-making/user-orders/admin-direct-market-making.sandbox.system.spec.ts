/* eslint-disable @typescript-eslint/no-explicit-any */
import { getRepositoryToken } from '@nestjs/typeorm';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { PrivateStreamTrackerService } from 'src/modules/market-making/trackers/private-stream-tracker.service';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';

import { AdminDirectMarketMakingService } from '../../../../src/modules/admin/market-making/admin-direct-mm.service';
import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('admin-direct-market-making');

describe('Admin direct market making runtime (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing single tick helper');
    helper = new MarketMakingSingleTickHelper();
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('starts, ticks, reports active runtime health, and stops a direct admin order', async () => {
    const moduleRef = helper.getModuleRef();
    const config = helper.getConfig();
    const marketMakingRepository = moduleRef.get(
      getRepositoryToken(MarketMakingOrder),
    );
    const growdataMarketMakingPairRepository = moduleRef.get(
      getRepositoryToken(GrowdataMarketMakingPair),
    );
    const strategyDefinitionRepository = moduleRef.get(
      getRepositoryToken(StrategyDefinition),
    );
    const strategyDefinition = await strategyDefinitionRepository.save(
      strategyDefinitionRepository.create({
        key: `admin-direct-${Date.now().toString(36)}`,
        name: 'Admin Direct Strategy',
        controllerType: 'pureMarketMaking',
        configSchema: {},
        defaultConfig: {},
        enabled: true,
        visibility: 'system',
      }),
    );
    const userOrdersService = moduleRef.get(UserOrdersService);
    const marketMakingRuntimeService = moduleRef.get(
      MarketMakingRuntimeService,
    );
    const exchangeInitService = moduleRef.get(ExchangeInitService);
    const executorRegistry = moduleRef.get(ExecutorRegistry);
    const strategyService = moduleRef.get(StrategyService);
    const exchangeOrderTrackerService = moduleRef.get(
      ExchangeOrderTrackerService,
    );
    const privateStreamTrackerService = moduleRef.get(
      PrivateStreamTrackerService,
    );
    const orderBookTrackerService = moduleRef.get(OrderBookTrackerService);
    const campaignService = moduleRef.get(CampaignService, { strict: false });

    const adminDirectService = new AdminDirectMarketMakingService(
      marketMakingRepository as any,
      growdataMarketMakingPairRepository as any,
      strategyDefinitionRepository as any,
      {
        create: jest.fn((payload) => payload),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (payload) => ({ id: 'join-1', ...payload })),
        update: jest.fn().mockResolvedValue(undefined),
      } as any,
      userOrdersService as any,
      marketMakingRuntimeService as any,
      {
        getDefinitionControllerType: jest
          .fn()
          .mockReturnValue('pureMarketMaking'),
        resolveForOrderSnapshot: jest
          .fn()
          .mockImplementation(
            async (
              _strategyDefinitionId: string,
              overrides: Record<string, unknown>,
            ) => ({
              controllerType: 'pureMarketMaking',
              resolvedConfig: {
                ...overrides,
                bidSpread: 0.001,
                askSpread: 0.001,
                orderAmount: 0.0002,
                orderRefreshTime: 60000,
                numberOfLayers: 1,
                priceSourceType: 'MID_PRICE',
                amountChangePerLayer: 0,
                amountChangeType: 'fixed',
                ceilingPrice: 0,
                floorPrice: 0,
              },
            }),
          ),
      } as any,
      {
        readAPIKey: jest.fn().mockResolvedValue({
          exchange: config.exchangeId,
          exchange_index: config.accountLabel,
        }),
      } as any,
      exchangeInitService as any,
      executorRegistry as any,
      strategyService as any,
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

    log.step('starting direct admin order');
    const started = await adminDirectService.directStart(
      {
        exchangeName: config.exchangeId,
        pair: config.symbol,
        strategyDefinitionId: strategyDefinition.id,
        apiKeyId: 'sandbox-api-key',
        accountLabel: config.accountLabel,
        configOverrides: {},
      },
      'admin-user',
    );

    expect(started.state).toBe('running');

    log.step('forcing runtime ready and executing a coordinator tick');
    await helper.forceSessionReadyForNextTick(started.orderId);
    await helper.runCoordinatorTick();

    log.step('reading runtime status after start');
    const runningStatus = await adminDirectService.getDirectOrderStatus(
      started.orderId,
    );

    expect(runningStatus.executorHealth).toBe('active');
    expect(runningStatus.runtimeState).toBe('active');

    log.step('stopping direct admin order');
    await adminDirectService.directStop(started.orderId);

    const stoppedStatus = await adminDirectService.getDirectOrderStatus(
      started.orderId,
    );

    expect(stoppedStatus.state).toBe('stopped');
    expect(stoppedStatus.runtimeState).toBe('stopped');
  });
});
