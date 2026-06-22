import { Injectable } from '@nestjs/common';

import type { PoolState } from './lp.types';

@Injectable()
export class PoolStateTrackerService {
  private readonly poolStates = new Map<string, PoolState>();

  upsertPoolState(state: PoolState): PoolState {
    this.poolStates.set(this.key(state.connectorId, state.chainId, state.poolAddress), {
      ...state,
      poolAddress: state.poolAddress.toLowerCase(),
    });

    return state;
  }

  getPoolState(
    connectorId: string,
    chainId: number,
    poolAddress: string,
  ): PoolState | undefined {
    return this.poolStates.get(this.key(connectorId, chainId, poolAddress));
  }

  private key(connectorId: string, chainId: number, poolAddress: string): string {
    return `${connectorId}:${chainId}:${poolAddress.toLowerCase()}`;
  }
}
