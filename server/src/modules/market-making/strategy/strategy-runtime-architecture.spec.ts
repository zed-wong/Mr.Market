/* eslint-disable @typescript-eslint/no-explicit-any */
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ConfigService } from '@nestjs/config';

import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { FillRoutingService } from '../execution/fill-routing.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { PrivateStreamTrackerService } from '../trackers/private-stream-tracker.service';
import { PureMarketMakingStrategyDto } from './config/strategy.dto';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentExecutionService } from './execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from './execution/strategy-intent-worker.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { StrategyService } from './strategy.service';

const wait = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 1500,
): Promise<void> => {
  const startedAt = new Date().getTime();

  while (!condition()) {
    if (new Date().getTime() - startedAt > timeoutMs) {
      throw new Error('Condition wait timed out');
    }
    await wait(5);
  }
};

const createConfigService = () =>
  ({
    get: jest.fn((key: string, defaultValue?: string | number | boolean) => {
      const values: Record<string, string | number | boolean> = {
        'strategy.intent_execution_driver': 'worker',
        'strategy.intent_worker_poll_interval_ms': 5,
        'strategy.intent_worker_max_in_flight': 4,
        'strategy.intent_worker_max_in_flight_per_exchange': 4,
        'strategy.execute_intents': true,
        'strategy.intent_max_retries': 0,
        'strategy.intent_retry_base_delay_ms': 1,
      };

      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService);

const createIntentRepository = (rows: any[] = []) => ({
  findOneBy: jest.fn(async ({ intentId }: { intentId: string }) => {
    return rows.find((row) => row.intentId === intentId) || null;
  }),
  save: jest.fn(async (payload: any) => {
    const index = rows.findIndex((row) => row.intentId === payload.intentId);

    if (index >= 0) {
      rows[index] = { ...payload };
    } else {
      rows.push({ ...payload });
    }

    return payload;
  }),
  find: jest.fn(async () => rows.map((row) => ({ ...row }))),
  createQueryBuilder: jest.fn(() => {
    const state = {
      status: 'NEW',
      limit: 0,
    };
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest
        .fn()
        .mockImplementation((_sql: string, params: { status: string }) => {
          state.status = params.status;

          return builder;
        }),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation((limit: number) => {
        state.limit = limit;

        return builder;
      }),
      getRawMany: jest.fn(async () => {
        const firstByStrategy = new Map<string, any>();

        for (const row of rows) {
          if (row.status !== state.status) {
            continue;
          }

          const current = firstByStrategy.get(row.strategyKey);

          if (
            !current ||
            current.createdAt > row.createdAt ||
            (current.createdAt === row.createdAt &&
              current.strategyKey > row.strategyKey)
          ) {
            firstByStrategy.set(row.strategyKey, row);
          }
        }

        return [...firstByStrategy.values()]
          .sort((a, b) => {
            if (a.createdAt !== b.createdAt) {
              return a.createdAt.localeCompare(b.createdAt);
            }

            return a.strategyKey.localeCompare(b.strategyKey);
          })
          .slice(0, state.limit || undefined)
          .map((row) => ({ strategyKey: row.strategyKey }));
      }),
    };

    return builder;
  }),
  findOne: jest.fn(
    async ({
      where,
    }: {
      where: {
        strategyKey: string;
        status: { _value?: string };
      };
    }) => {
      const excludedStatus = where.status?._value;

      return (
        rows
          .filter(
            (row) =>
              row.strategyKey === where.strategyKey &&
              row.status !== excludedStatus,
          )
          .sort((a, b) => {
            if (a.createdAt !== b.createdAt) {
              return a.createdAt.localeCompare(b.createdAt);
            }

            return a.intentId.localeCompare(b.intentId);
          })[0] || null
      );
    },
  ),
});

const createMappingRepository = (rows: any[] = []) => ({
  countBy: jest.fn(async ({ orderId }: { orderId: string }) => {
    return rows.filter((row) => row.orderId === orderId).length;
  }),
  findOneBy: jest.fn(
    async ({
      clientOrderId,
      exchangeOrderId,
    }: {
      clientOrderId?: string;
      exchangeOrderId?: string;
    }) => {
      if (clientOrderId) {
        return rows.find((row) => row.clientOrderId === clientOrderId) || null;
      }
      if (exchangeOrderId) {
        return (
          rows.find((row) => row.exchangeOrderId === exchangeOrderId) || null
        );
      }

      return null;
    },
  ),
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => {
    const row = {
      id: `mapping-${rows.length + 1}`,
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      ...value,
    };

    rows.push(row);

    return row;
  }),
});

const createHistoryRepository = (rows: any[] = []) => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => {
    const row = {
      id: `history-${rows.length + 1}`,
      executedAt:
        value.executedAt || new Date('2026-03-11T00:00:00.000Z'),
      ...value,
    };

    rows.push(row);

    return row;
  }),
});

const createStrategyInstanceRepository = (rows: any[] = []) => ({
  find: jest.fn(async () => rows.map((row) => ({ ...row }))),
  findOne: jest.fn(async ({ where }: { where: { strategyKey: string } }) => {
    return rows.find((row) => row.strategyKey === where.strategyKey) || null;
  }),
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => {
    const index = rows.findIndex((row) => row.strategyKey === value.strategyKey);

    if (index >= 0) {
      rows[index] = { ...value };
    } else {
      rows.push({ ...value });
    }

    return value;
  }),
  update: jest.fn(
    async (
      criteria: { strategyKey: string },
      partial: Record<string, unknown>,
    ) => {
      const existing = rows.find(
        (row) => row.strategyKey === criteria.strategyKey,
      );

      if (existing) {
        Object.assign(existing, partial);
      }
    },
  ),
});

const createPureParams = (
  clientId: string,
  userId = 'user-1',
): PureMarketMakingStrategyDto => ({
  userId,
  clientId,
  pair: 'BTC/USDT',
  exchangeName: 'binance',
  bidSpread: 0.01,
  askSpread: 0.01,
  orderAmount: 1,
  orderRefreshTime: 1000,
  numberOfLayers: 1,
  priceSourceType: PriceSourceType.MID_PRICE,
  amountChangePerLayer: 0,
  amountChangeType: 'fixed',
  ceilingPrice: undefined,
  floorPrice: undefined,
});

const createFixture = () => {
  const intentRows: any[] = [];
  const mappingRows: any[] = [];
  const historyRows: any[] = [];
  const strategyInstanceRows: any[] = [];
  const configService = createConfigService();
  const exchangeOrderTrackerService = new ExchangeOrderTrackerService();
  const exchangeConnectorAdapterService = {
    placeLimitOrder: jest
      .fn()
      .mockImplementation(
        async (
          _exchange: string,
          _pair: string,
          _side: string,
          _qty: string,
          _price: string,
          clientOrderId: string,
        ) => ({
          id: `ex-${clientOrderId.replace(/[^a-zA-Z0-9]/g, '-')}`,
          status: 'open',
        }),
      ),
    cancelOrder: jest.fn(),
    fetchOrder: jest.fn(),
  };
  const strategyIntentStoreService = new StrategyIntentStoreService(
    createIntentRepository(intentRows) as any,
  );
  const exchangeOrderMappingService = new ExchangeOrderMappingService(
    createMappingRepository(mappingRows) as any,
  );
  const strategyIntentExecutionService = new StrategyIntentExecutionService(
    configService,
    exchangeConnectorAdapterService as any,
    createHistoryRepository(historyRows) as any,
    undefined,
    strategyIntentStoreService,
    exchangeOrderTrackerService,
    exchangeOrderMappingService,
  );
  const executorOrchestratorService = new ExecutorOrchestratorService(
    configService,
    strategyIntentStoreService,
    strategyIntentExecutionService,
  );
  const executorRegistry = new ExecutorRegistry();
  const strategyService = new StrategyService(
    {
      getExchange: jest.fn((exchangeName: string) => ({
        id: exchangeName,
        fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
      })),
      getSupportedExchanges: jest.fn(() => ['binance']),
    } as any,
    createStrategyInstanceRepository(strategyInstanceRows) as any,
    undefined,
    undefined,
    exchangeOrderTrackerService,
    new StrategyControllerRegistry([new PureMarketMakingStrategyController()]),
    executorOrchestratorService,
    {
      getReferencePrice: jest.fn().mockResolvedValue(100),
    } as any,
    executorRegistry,
  );
  const privateStreamTrackerService = new PrivateStreamTrackerService(
    undefined,
    new FillRoutingService(exchangeOrderMappingService),
    exchangeOrderTrackerService,
    executorRegistry,
  );
  const strategyIntentWorkerService = new StrategyIntentWorkerService(
    configService,
    strategyIntentStoreService,
    strategyIntentExecutionService,
  );

  return {
    intentRows,
    mappingRows,
    historyRows,
    exchangeConnectorAdapterService,
    strategyIntentExecutionService,
    strategyService,
    strategyIntentWorkerService,
    exchangeOrderTrackerService,
    executorRegistry,
    privateStreamTrackerService,
  };
};

describe('Strategy runtime architecture', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the pooled pure market making flow through worker execution and fill routing', async () => {
    const fixture = createFixture();

    await fixture.strategyService.executePureMarketMakingStrategy(
      createPureParams('order-1'),
    );
    await fixture.strategyService.onTick('2026-03-11T00:00:00.000Z');

    expect(fixture.intentRows).toHaveLength(2);
    expect(fixture.intentRows.map((row) => row.status)).toEqual(['NEW', 'NEW']);

    await fixture.strategyIntentWorkerService.onModuleInit();
    await waitFor(
      () =>
        fixture.mappingRows.length === 2 && fixture.historyRows.length === 2,
    );
    await fixture.strategyIntentWorkerService.onModuleDestroy();

    expect(
      fixture.exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(2);
    expect(fixture.mappingRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: 'order-1',
          clientOrderId: 'order-1:0',
          exchangeOrderId: 'ex-order-1-0',
        }),
        expect.objectContaining({
          orderId: 'order-1',
          clientOrderId: 'order-1:1',
          exchangeOrderId: 'ex-order-1-1',
        }),
      ]),
    );
    expect(fixture.historyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyInstanceId: 'order-1-pureMarketMaking',
          status: 'open',
          metadata: expect.objectContaining({
            clientOrderId: 'order-1:0',
          }),
        }),
      ]),
    );
    expect(
      fixture.exchangeOrderTrackerService.getOpenOrders(
        'order-1-pureMarketMaking',
      ),
    ).toHaveLength(2);

    const executor = fixture.executorRegistry.getExecutor('binance', 'BTC/USDT');
    const onFill = jest.fn();

    executor?.configure({ onFill });
    fixture.privateStreamTrackerService.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'execution',
      payload: {
        exchangeOrderId: 'ex-order-1-0',
        status: 'closed',
      },
      receivedAt: '2026-03-11T00:00:01.000Z',
    });

    await fixture.privateStreamTrackerService.onTick(
      '2026-03-11T00:00:01.500Z',
    );

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        strategyKey: 'order-1-pureMarketMaking',
      }),
      expect.objectContaining({
        orderId: 'order-1',
        exchangeOrderId: 'ex-order-1-0',
      }),
    );
    expect(
      fixture.exchangeOrderTrackerService.getByExchangeOrderId(
        'binance',
        'ex-order-1-0',
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'filled',
      }),
    );
  });

  it('shares one executor for multiple orders on the same exchange pair and targets fills correctly', async () => {
    const fixture = createFixture();

    await fixture.strategyService.executePureMarketMakingStrategy(
      createPureParams('order-1', 'user-1'),
    );
    await fixture.strategyService.executePureMarketMakingStrategy(
      createPureParams('order-2', 'user-2'),
    );

    const executor = fixture.executorRegistry.getExecutor('binance', 'BTC/USDT');
    const onFill = jest.fn();

    expect(fixture.executorRegistry.getActiveExecutors()).toHaveLength(1);
    expect(executor?.getActiveSessions().map((session) => session.orderId)).toEqual(
      ['order-1', 'order-2'],
    );

    await fixture.strategyService.onTick('2026-03-11T00:00:00.000Z');

    expect(fixture.intentRows).toHaveLength(4);
    expect(
      [...new Set(fixture.intentRows.map((row) => row.strategyKey))].sort(),
    ).toEqual(['order-1-pureMarketMaking', 'order-2-pureMarketMaking']);

    executor?.configure({ onFill });
    fixture.privateStreamTrackerService.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'trade',
      payload: {
        clientOrderId: 'order-2:99',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:01.000Z',
    });

    await fixture.privateStreamTrackerService.onTick(
      '2026-03-11T00:00:01.500Z',
    );

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
        strategyKey: 'order-2-pureMarketMaking',
      }),
      expect.objectContaining({
        orderId: 'order-2',
        clientOrderId: 'order-2:99',
      }),
    );
  });
});
