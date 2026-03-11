/* eslint-disable no-console */
import 'reflect-metadata';

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { StrategyDefinition } from '../../common/entities/market-making/strategy-definition.entity';
import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
} from '../../common/entities/orders/user-orders.entity';
import { StrategyConfigResolverService } from '../../modules/market-making/strategy/dex/strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from '../../modules/market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { buildLegacyMarketMakingOrderRuntimeConfig } from '../../modules/market-making/user-orders/market-making-order-snapshot.utils';

type BackfillResult = {
  total: number;
  success: number;
  failed: number;
  failedOrderIds: string[];
};

async function connectToDatabase(): Promise<DataSource> {
  dotenv.config();
  const dbPath = process.env.DATABASE_PATH || 'data/mr_market.db';
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dataSource = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [StrategyDefinition, MarketMakingOrder],
    synchronize: false,
  });

  await dataSource.initialize();

  return dataSource;
}

function buildStrategySnapshot(params: {
  definition: StrategyDefinition;
  mergedConfig: Record<string, unknown>;
  strategyConfigResolver: StrategyConfigResolverService;
}): MarketMakingOrderStrategySnapshot {
  return {
    definitionVersion: params.definition.currentVersion || '1.0.0',
    controllerType: params.strategyConfigResolver.getDefinitionControllerType(
      params.definition,
    ),
    resolvedConfig: params.mergedConfig,
  };
}

export async function runMarketMakingOrderSnapshotBackfill(): Promise<BackfillResult> {
  const dataSource = await connectToDatabase();

  try {
    const marketMakingOrderRepository =
      dataSource.getRepository(MarketMakingOrder);
    const strategyDefinitionRepository =
      dataSource.getRepository(StrategyDefinition);
    const strategyRuntimeDispatcher = new StrategyRuntimeDispatcherService(
      {} as any,
    );
    const strategyConfigResolver = new StrategyConfigResolverService(
      strategyDefinitionRepository,
      strategyRuntimeDispatcher,
    );

    const allOrders = await marketMakingOrderRepository.find();
    const targetOrders = allOrders.filter((order) => !order.strategySnapshot);
    const result: BackfillResult = {
      total: targetOrders.length,
      success: 0,
      failed: 0,
      failedOrderIds: [],
    };

    for (const order of targetOrders) {
      try {
        if (!order.strategyDefinitionId) {
          throw new Error('missing strategyDefinitionId');
        }

        const definition = await strategyDefinitionRepository.findOneBy({
          id: order.strategyDefinitionId,
        });

        if (!definition) {
          throw new Error(
            `strategy definition ${order.strategyDefinitionId} not found`,
          );
        }

        const orderConfig = buildLegacyMarketMakingOrderRuntimeConfig(
          order,
          (definition.defaultConfig as Record<string, unknown>) || {},
        );
        const { mergedConfig } =
          strategyConfigResolver.resolveDefinitionStartConfig(
            definition,
            {
              userId: order.userId,
              clientId: order.orderId,
              marketMakingOrderId: order.orderId,
              config: orderConfig,
            },
            { skipEnabledCheck: true },
          );

        await marketMakingOrderRepository.update(
          { orderId: order.orderId },
          {
            strategySnapshot: buildStrategySnapshot({
              definition,
              mergedConfig,
              strategyConfigResolver,
            }),
          },
        );
        result.success += 1;
      } catch (error) {
        result.failed += 1;
        result.failedOrderIds.push(order.orderId);
        console.error(
          `Failed to backfill order ${order.orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return result;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runMarketMakingOrderSnapshotBackfill()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(
        `Snapshot backfill failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exit(1);
    });
}
