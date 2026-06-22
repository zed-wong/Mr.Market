import type { OrderLpPositionStatus } from 'src/common/entities/market-making/order-lp-position.entity';

export type PoolState = {
  connectorId: string;
  chainId: number;
  poolAddress: string;
  currentTick: number;
  sqrtPriceX96: string;
  liquidity: string;
  observedAt: string;
};

export type OnchainLpPositionState = {
  owner: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  uncollectedFees0?: string;
  uncollectedFees1?: string;
};

export type LpPositionStatusInput = {
  status: OrderLpPositionStatus;
  lastConfirmedBlock?: number;
  liquidity?: string;
  uncollectedFees0?: string;
  uncollectedFees1?: string;
  closedByIntentId?: string;
};
