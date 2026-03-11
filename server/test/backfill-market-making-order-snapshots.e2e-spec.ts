import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { StrategyDefinition } from '../src/common/entities/market-making/strategy-definition.entity';
import { MarketMakingOrder } from '../src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from '../src/common/enum/pricesourcetype';
import { runMarketMakingOrderSnapshotBackfill } from '../src/database/scripts/backfill-market-making-order-snapshots';

describe('Market-making order snapshot backfill script', () => {
  jest.setTimeout(120000);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-market-backfill-'));
  const dbPath = path.join(tempDir, 'backfill-test.db');
  const originalDatabasePath = process.env.DATABASE_PATH;

  afterAll(() => {
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it('backfills snapshots for legacy orders and keeps them stable after definition changes', async () => {
    process.env.DATABASE_PATH = dbPath;

    let dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [StrategyDefinition, MarketMakingOrder],
      synchronize: true,
    });

    await dataSource.initialize();

    const definitionRepository = dataSource.getRepository(StrategyDefinition);
    const orderRepository = dataSource.getRepository(MarketMakingOrder);
    const definition = await definitionRepository.save(
      definitionRepository.create({
        key: 'legacy-pmm',
        name: 'Legacy PMM',
        description: 'legacy',
        controllerType: 'pure_market_making',
        configSchema: {
          type: 'object',
          required: ['userId', 'clientId', 'pair', 'exchangeName'],
          properties: {
            userId: { type: 'string' },
            clientId: { type: 'string' },
            pair: { type: 'string' },
            exchangeName: { type: 'string' },
            bidSpread: { type: 'number' },
            askSpread: { type: 'number' },
            orderAmount: { type: 'number' },
            orderRefreshTime: { type: 'number' },
            numberOfLayers: { type: 'number' },
            priceSourceType: { type: 'string' },
            amountChangePerLayer: { type: 'number' },
            amountChangeType: {
              type: 'string',
              enum: ['fixed', 'percentage'],
            },
            ceilingPrice: { type: 'number' },
            floorPrice: { type: 'number' },
          },
        },
        defaultConfig: {},
        enabled: false,
        visibility: 'system',
        currentVersion: '1.0.0',
      }),
    );

    await orderRepository.save(
      orderRepository.create({
        orderId: 'order-backfill-1',
        userId: 'user-1',
        pair: 'BTC-USDT-ERC20',
        exchangeName: 'binance',
        strategyDefinitionId: definition.id,
        bidSpread: '0.1',
        askSpread: '0.2',
        orderAmount: '10',
        orderRefreshTime: '15000',
        numberOfLayers: '2',
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: '0',
        amountChangeType: 'fixed',
        ceilingPrice: '0',
        floorPrice: '0',
        state: 'payment_complete',
        createdAt: new Date().toISOString(),
        rewardAddress: null,
      }),
    );

    await dataSource.destroy();

    const firstRun = await runMarketMakingOrderSnapshotBackfill();

    expect(firstRun).toEqual({
      total: 1,
      success: 1,
      failed: 0,
      failedOrderIds: [],
    });

    dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [StrategyDefinition, MarketMakingOrder],
      synchronize: false,
    });
    await dataSource.initialize();

    const backfilledOrder = await dataSource
      .getRepository(MarketMakingOrder)
      .findOneBy({ orderId: 'order-backfill-1' });

    expect(backfilledOrder?.strategySnapshot).toEqual(
      expect.objectContaining({
        definitionVersion: '1.0.0',
        controllerType: 'pureMarketMaking',
        resolvedConfig: expect.objectContaining({
          userId: 'user-1',
          clientId: 'order-backfill-1',
          marketMakingOrderId: 'order-backfill-1',
          pair: 'BTC-USDT',
          exchangeName: 'binance',
          bidSpread: 0.1,
          askSpread: 0.2,
          orderAmount: 10,
          orderRefreshTime: 15000,
          numberOfLayers: 2,
        }),
      }),
    );

    await dataSource.getRepository(StrategyDefinition).update(
      { id: definition.id },
      {
        currentVersion: '9.9.9',
        defaultConfig: { bidSpread: 999 },
      },
    );
    await dataSource.destroy();

    const secondRun = await runMarketMakingOrderSnapshotBackfill();

    expect(secondRun).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      failedOrderIds: [],
    });

    dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [StrategyDefinition, MarketMakingOrder],
      synchronize: false,
    });
    await dataSource.initialize();

    const stableOrder = await dataSource
      .getRepository(MarketMakingOrder)
      .findOneBy({ orderId: 'order-backfill-1' });

    expect(stableOrder?.strategySnapshot).toEqual(
      backfilledOrder?.strategySnapshot,
    );

    await dataSource.destroy();
  });
});
