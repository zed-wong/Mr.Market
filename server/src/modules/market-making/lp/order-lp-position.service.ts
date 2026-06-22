import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  OrderLpPosition,
  OrderLpPositionStatus,
} from 'src/common/entities/market-making/order-lp-position.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import type { LpPositionStatusInput } from './lp.types';

export type CreateOrderLpPositionCommand = {
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel?: string;
  connectorId: string;
  chainId: number;
  tradingAccountId: string;
  positionTokenId: string;
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  openedByIntentId: string;
  status?: OrderLpPositionStatus;
};

@Injectable()
export class OrderLpPositionService {
  constructor(
    @InjectRepository(OrderLpPosition)
    private readonly orderLpPositionRepository: Repository<OrderLpPosition>,
  ) {}

  async createOpening(
    command: CreateOrderLpPositionCommand,
  ): Promise<OrderLpPosition> {
    const now = getRFC3339Timestamp();
    const position = this.orderLpPositionRepository.create({
      id: randomUUID(),
      accountLabel: 'default',
      status: 'opening',
      ...command,
      createdAt: now,
      updatedAt: now,
    });

    return await this.orderLpPositionRepository.save(position);
  }

  async updateStatus(
    positionId: string,
    update: LpPositionStatusInput,
  ): Promise<OrderLpPosition> {
    const position = await this.requireById(positionId);

    position.status = update.status;
    position.lastConfirmedBlock =
      update.lastConfirmedBlock ?? position.lastConfirmedBlock;
    position.liquidity = update.liquidity ?? position.liquidity;
    position.uncollectedFees0 =
      update.uncollectedFees0 ?? position.uncollectedFees0;
    position.uncollectedFees1 =
      update.uncollectedFees1 ?? position.uncollectedFees1;
    position.closedByIntentId =
      update.closedByIntentId ?? position.closedByIntentId;
    position.updatedAt = getRFC3339Timestamp();

    return await this.orderLpPositionRepository.save(position);
  }

  async findById(positionId: string): Promise<OrderLpPosition | null> {
    return await this.orderLpPositionRepository.findOneBy({ id: positionId });
  }

  async requireById(positionId: string): Promise<OrderLpPosition> {
    const position = await this.findById(positionId);

    if (!position) {
      throw new Error(`OrderLpPosition ${positionId} not found`);
    }

    return position;
  }

  async findActiveByUserOrderId(
    userOrderId: string,
  ): Promise<OrderLpPosition[]> {
    return await this.orderLpPositionRepository.find({
      where: [
        { userOrderId, status: 'opening' },
        { userOrderId, status: 'active' },
        { userOrderId, status: 'out_of_range' },
        { userOrderId, status: 'closing' },
      ],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }
}
