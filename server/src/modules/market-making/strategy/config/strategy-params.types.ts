import type BigNumber from 'bignumber.js';

import type { ExecutorAction } from './executor-action.types';
import type {
  DualAccountBehaviorProfilesDto,
  VolumeExecutionVenue,
} from './strategy.dto';
import type { StrategyExecutionCategory } from './strategy-execution-category';

export type BaseVolumeStrategyParams = {
  exchangeName: string;
  symbol: string;
  pair?: string;
  baseIncrementPercentage: number;
  baseIntervalTime: number;
  baseTradeAmount: number;
  numTrades: number;
  userId: string;
  clientId: string;
  pricePushRate: number;
  executionCategory: StrategyExecutionCategory;
  executionVenue?: VolumeExecutionVenue;
  postOnlySide?: 'buy' | 'sell' | 'inventory_balance';
  executedTrades?: number;
};

export type CexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionCategory: 'clob_cex' | 'clob_dex';
};

export type AmmDexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionCategory: 'amm_dex';
  executionVenue: 'dex';
  dexId: string;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeTier: number;
  slippageBps?: number;
  recipient?: string;
};

export type VolumeStrategyParams =
  | CexVolumeStrategyParams
  | AmmDexVolumeStrategyParams;

export type DualAccountVolumeStrategyParams = CexVolumeStrategyParams & {
  executionCategory: 'clob_cex';
  executionVenue: 'cex';
  maxOrderAmount?: number;
  interval?: number;
  dailyVolumeTarget?: number;
  makerAccountLabel: string;
  takerAccountLabel: string;
  tradeAmountVariance?: number;
  priceOffsetVariance?: number;
  cadenceVariance?: number;
  buyBias?: number;
  accountProfiles?: DualAccountBehaviorProfilesDto;
  dynamicRoleSwitching?: boolean;
  targetQuoteVolume?: number;
  tradedQuoteVolume?: number;
  realizedPnlQuote?: number;
  inventoryBaseQty?: number;
  inventoryCostQuote?: number;
  publishedCycles?: number;
  completedCycles?: number;
  totalMatchedBaseVolume?: number;
  totalMatchedQuoteVolume?: number;
  orderBookReady?: boolean;
  consecutiveFallbackCycles?: number;
  activeCycle?: DualAccountActiveCycleState;
  repairRequired?: boolean;
  repairReason?: string;
  cycleMode?: 'alternating' | 'static';
  makerProtectionMode?: 'alive_only' | 'strict_top';
  nextMakerAccountLabel?: string;
  nextTakerAccountLabel?: string;
};

export type DualAccountBestCapacityVolumeStrategyParams =
  DualAccountVolumeStrategyParams;

export type DualAccountBehaviorProfile = {
  tradeAmountMultiplier?: number;
  tradeAmountVariance?: number;
  priceOffsetMultiplier?: number;
  priceOffsetVariance?: number;
  cadenceMultiplier?: number;
  cadenceVariance?: number;
  buyBias?: number;
  activeHours?: number[];
};

export type DualAccountPairBalances = {
  base: BigNumber;
  quote: BigNumber;
  assets: { base: string; quote: string };
};

export type DualAccountResolvedAccounts = {
  makerAccountLabel: string;
  takerAccountLabel: string;
  makerBalances?: DualAccountPairBalances;
  takerBalances?: DualAccountPairBalances;
  capacity?: BigNumber;
};

export type DualAccountExecutionPlan = {
  side: 'buy' | 'sell';
  resolvedAccounts: DualAccountResolvedAccounts;
  profile: DualAccountBehaviorProfile;
  requestedQty: BigNumber;
  adjustedQuote: { price: BigNumber; qty: BigNumber };
  sideReason: 'preferred_side_tradable' | 'fallback_side_tradable';
  fallbackReason?: 'preferred_side_not_tradable';
};

export type DualAccountBestCapacityCandidate = {
  side: 'buy' | 'sell';
  makerAccountLabel: string;
  takerAccountLabel: string;
  makerBalances: DualAccountPairBalances;
  takerBalances: DualAccountPairBalances;
  capacity: BigNumber;
  futureOppositeCapacity: BigNumber;
  imbalanceRatio: BigNumber;
  candidateRank: number;
  roleAssignment: 'configured' | 'swapped';
};

export type DualAccountTradeabilityPlan = {
  side: 'buy' | 'sell';
  resolvedAccounts: DualAccountResolvedAccounts;
  profile: DualAccountBehaviorProfile;
  capacity: BigNumber;
};

export type DualAccountRebalanceCandidate = {
  action: ExecutorAction;
  futureExecution: DualAccountTradeabilityPlan;
  accountLabel: string;
  side: 'buy' | 'sell';
  restoredCapacityScore: BigNumber;
  rebalanceCostScore: BigNumber;
  mode: 'passive' | 'aggressive';
};

export type DualAccountBalanceSnapshot = {
  makerBalances: DualAccountPairBalances;
  takerBalances: DualAccountPairBalances;
};

export type DualAccountActiveCycleState = {
  cycleId: string;
  tickId: string;
  orderId: string;
  makerSide: 'buy' | 'sell';
  makerAccountLabel: string;
  takerAccountLabel: string;
  price: string;
  requestedQty: string;
  makerFilledQty: string;
  takerFilledQty: string;
  matchedFilledQty?: string;
  matchedQuoteVolume?: string;
};

export type DualAccountMatchedVolumeStats = {
  totalMatchedBaseVolume?: string;
  totalMatchedQuoteVolume?: string;
};

export type PooledExecutorTarget = {
  exchange: string;
  pair: string;
  orderId: string;
};

export type ConnectorHealthStatus = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
