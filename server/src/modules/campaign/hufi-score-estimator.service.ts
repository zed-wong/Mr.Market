import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { Between, Repository } from 'typeorm';

@Injectable()
export class HufiScoreEstimatorService {
  constructor(
    private readonly historyRepository: Repository<any>,
    private readonly scoreSnapshotRepository: Repository<any>,
  ) {}

  async estimateDailyScore(day: string): Promise<void> {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(`${day}T23:59:59.999Z`);
    const fills = await this.historyRepository.find({
      where: {
        status: 'closed',
        executedAt: Between(start, end),
      },
    });

    for (const fill of fills) {
      const snapshot = this.scoreSnapshotRepository.create({
        day,
        exchange: fill.exchange,
        pair: fill.pair,
        score: new BigNumber(fill.amount || 0).toFixed(),
      });

      await this.scoreSnapshotRepository.save(snapshot);
    }
  }
}
