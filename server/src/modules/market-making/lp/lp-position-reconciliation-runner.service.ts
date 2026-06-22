import { Injectable } from '@nestjs/common';

import { OrderLpPositionService } from './order-lp-position.service';
import type { OnchainLpPositionState } from './lp.types';

export type LpPositionReconciliationResult = {
  positionId: string;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
  matches: boolean;
  mismatches: string[];
};

@Injectable()
export class LpPositionReconciliationRunner {
  constructor(private readonly lpPositionService: OrderLpPositionService) {}

  async reconcilePosition(
    positionId: string,
    onchain: OnchainLpPositionState,
  ): Promise<LpPositionReconciliationResult> {
    const position = await this.lpPositionService.requireById(positionId);
    const mismatches: string[] = [];

    if (position.liquidity !== onchain.liquidity) {
      mismatches.push('liquidity');
    }
    if (position.tickLower !== onchain.tickLower) {
      mismatches.push('tickLower');
    }
    if (position.tickUpper !== onchain.tickUpper) {
      mismatches.push('tickUpper');
    }

    if (mismatches.length > 0) {
      await this.lpPositionService.updateStatus(position.id, {
        status: 'manual_review',
      });
    }

    return {
      positionId,
      userOrderId: position.userOrderId,
      ledgerOrderId: position.ledgerOrderId,
      accountLabel: position.accountLabel,
      matches: mismatches.length === 0,
      mismatches,
    };
  }
}
