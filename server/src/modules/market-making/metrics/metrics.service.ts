import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';

@Injectable()
export class MetricsService {
  private readonly logger = new CustomLogger(MetricsService.name);

  constructor(
    @InjectRepository(StrategyExecutionHistory)
    private readonly orderRepository: Repository<StrategyExecutionHistory>,
    private readonly runtimeTimingService: MarketMakingRuntimeTimingService,
  ) {}

  public async getStrategyMetrics() {
    const closedOrderAndVolume = await this.orderRepository.query(
      `SELECT
        "exchange",
        "userId",
        "clientId",
        DATE("executedAt") AS date,
        COUNT(*) AS orders,
        SUM("amount" * "price") AS volume
      FROM strategy_execution_history
      WHERE "status" = 'closed' AND "strategyType" = 'market-making'
      GROUP BY "exchange", "userId", "clientId", date
      ORDER BY "exchange", "userId", "clientId", date
      `,
    );

    const orderBookVolume = await this.orderRepository.query(`SELECT
        "exchange",
        "userId",
        "clientId",
        DATE("executedAt") AS date,
        SUM("amount" * "price") AS volume
      FROM strategy_execution_history
      WHERE "strategyType" = 'market-making'
      GROUP BY "exchange", "userId", "clientId", date
      ORDER BY "exchange", "userId", "clientId", date
      `);

    const metrics = {};

    closedOrderAndVolume.forEach((item) => {
      const strategyKey = `${item.exchange}-${item.userId}-${item.clientId}`;

      if (!metrics[strategyKey]) {
        metrics[strategyKey] = [];
      }

      metrics[strategyKey].push({
        date: item.date,
        ordersPlaced: item.orders,
        tradeVolume: item.volume,
      });
    });

    orderBookVolume.forEach((item) => {
      const strategyKey = `${item.exchange}-${item.userId}-${item.clientId}`;

      if (!metrics[strategyKey]) {
        metrics[strategyKey] = [];
      }

      if (!metrics[strategyKey].some((m) => m.date === item.date)) {
        metrics[strategyKey].push({
          date: item.date,
          orderBookVolume: item.volume,
        });
      } else {
        for (let i = 0; i < metrics[strategyKey].length; i++) {
          if (metrics[strategyKey][i].date === item.date) {
            metrics[strategyKey][i].orderBookVolume = item.volume;
          }
        }
      }
    });

    return metrics;
  }

  getRuntimeMetrics() {
    return this.runtimeTimingService.getSnapshot();
  }
}
