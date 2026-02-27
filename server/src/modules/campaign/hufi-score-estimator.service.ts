import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { HufiScoreSnapshot } from 'src/common/entities/campaign/hufi-score-snapshot.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Between, Repository } from 'typeorm';

@Injectable()
export class HufiScoreEstimatorService {
  constructor(
    @InjectRepository(MarketMakingHistory)
    private readonly marketMakingHistoryRepository: Repository<MarketMakingHistory>,
    @InjectRepository(HufiScoreSnapshot)
    private readonly hufiScoreSnapshotRepository: Repository<HufiScoreSnapshot>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async estimateYesterdayScoreCron(): Promise<void> {
    const day = new Date();

    day.setUTCDate(day.getUTCDate() - 1);
    const yyyy = day.getUTCFullYear();
    const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(day.getUTCDate()).padStart(2, '0');

    await this.estimateDailyScore(`${yyyy}-${mm}-${dd}`);
  }

  async estimateDailyScore(day: string): Promise<void> {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start);

    end.setUTCDate(end.getUTCDate() + 1);

    const fills = await this.marketMakingHistoryRepository.find({
      where: {
        status: 'closed',
        executedAt: Between(start, end),
      },
    });

    const grouped = new Map<string, BigNumber>();

    for (const fill of fills) {
      const key = `${fill.exchange}:${fill.pair}`;

      grouped.set(
        key,
        (grouped.get(key) || new BigNumber(0)).plus(fill.amount || '0'),
      );
    }

    for (const [key, makerVolume] of grouped.entries()) {
      const [exchange, pair] = key.split(':');
      const snapshot = this.hufiScoreSnapshotRepository.create({
        day,
        pair,
        exchange,
        makerVolume: makerVolume.toFixed(),
        takerVolume: '0',
        score: makerVolume.toFixed(),
        createdAt: getRFC3339Timestamp(),
      });

      await this.hufiScoreSnapshotRepository.save(snapshot);
    }
  }
}
