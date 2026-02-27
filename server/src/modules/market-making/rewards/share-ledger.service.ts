import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { randomUUID } from 'crypto';
import { ShareLedgerEntry } from 'src/common/entities/ledger/share-ledger-entry.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { isUniqueConstraintViolation } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

type WeightedShare = {
  userId: string;
  basisShares: string;
};

@Injectable()
export class ShareLedgerService {
  constructor(
    @InjectRepository(ShareLedgerEntry)
    private readonly shareLedgerRepository: Repository<ShareLedgerEntry>,
  ) {}

  async mintShares(
    userId: string,
    amount: string,
    refId: string,
    createdAt?: string,
  ): Promise<ShareLedgerEntry> {
    return await this.upsertEntry({
      entryId: randomUUID(),
      userId,
      type: 'MINT',
      amount,
      refId,
      createdAt: createdAt || getRFC3339Timestamp(),
    });
  }

  async burnShares(
    userId: string,
    amount: string,
    refId: string,
    createdAt?: string,
  ): Promise<ShareLedgerEntry> {
    return await this.upsertEntry({
      entryId: randomUUID(),
      userId,
      type: 'BURN',
      amount,
      refId,
      createdAt: createdAt || getRFC3339Timestamp(),
    });
  }

  private async upsertEntry(
    entry: ShareLedgerEntry,
  ): Promise<ShareLedgerEntry> {
    const candidate = this.shareLedgerRepository.create(entry);

    if (typeof this.shareLedgerRepository.upsert === 'function') {
      await this.shareLedgerRepository.upsert(candidate, {
        conflictPaths: ['userId', 'type', 'refId'],
        skipUpdateIfNoValuesChanged: true,
      });

      const existing = await this.shareLedgerRepository.findOneBy({
        userId: entry.userId,
        type: entry.type,
        refId: entry.refId,
      });

      if (!existing) {
        throw new Error('share ledger upsert did not persist entry');
      }

      return existing;
    }

    try {
      return await this.shareLedgerRepository.save(candidate);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.shareLedgerRepository.findOneBy({
          userId: entry.userId,
          type: entry.type,
          refId: entry.refId,
        });

        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async computeTimeWeightedShares(
    windowStart: string,
    windowEnd: string,
  ): Promise<WeightedShare[]> {
    const entries = await this.shareLedgerRepository.find({
      order: { createdAt: 'ASC' },
    });

    const startMs = Date.parse(windowStart);
    const endMs = Date.parse(windowEnd);
    const durationMs = Math.max(1, endMs - startMs);

    const users = new Map<string, ShareLedgerEntry[]>();

    for (const entry of entries) {
      const list = users.get(entry.userId) || [];

      list.push(entry);
      users.set(entry.userId, list);
    }

    const result: WeightedShare[] = [];

    for (const [userId, userEntries] of users.entries()) {
      let balance = new BigNumber(0);
      let weighted = new BigNumber(0);
      let cursor = startMs;

      for (const entry of userEntries) {
        const eventMs = Date.parse(entry.createdAt);

        if (eventMs <= startMs) {
          balance = this.applyEntry(balance, entry);
          continue;
        }

        if (eventMs >= endMs) {
          break;
        }

        const segmentMs = eventMs - cursor;

        if (segmentMs > 0) {
          weighted = weighted.plus(balance.multipliedBy(segmentMs));
          cursor = eventMs;
        }
        balance = this.applyEntry(balance, entry);
      }

      if (cursor < endMs) {
        weighted = weighted.plus(balance.multipliedBy(endMs - cursor));
      }

      const basis = weighted.dividedBy(durationMs);

      if (basis.isGreaterThan(0)) {
        result.push({ userId, basisShares: basis.toFixed() });
      }
    }

    return result;
  }

  private applyEntry(balance: BigNumber, entry: ShareLedgerEntry): BigNumber {
    if (entry.type === 'MINT') {
      return balance.plus(entry.amount);
    }

    return balance.minus(entry.amount);
  }
}
