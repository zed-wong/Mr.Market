import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import type { ExecutorAction } from './executor-action.types';
import type {
  ArbitrageStrategyDto,
  ConnectorId,
  ExecuteEfficientDualAccountVolumeStrategyDto,
  PureMarketMakingStrategyDto,
  VolumeExecutionVenue,
} from './strategy.dto';
import type { TimeIndicatorStrategyDto } from './timeIndicator.dto';

export type StrategyType =
  | 'arbitrage'
  | 'pureMarketMaking'
  | 'efficientDualAccountVolume'
  | 'volume'
  | 'timeIndicator';

export type StrategyRuntimeSession = {
  runId: string;
  strategyKey: string;
  strategyType: StrategyType;
  userId: string;
  clientId: string;
  marketMakingOrderId?: string;
  cadenceMs: number;
  nextRunAtMs: number;
  lastFillTimestamp?: number;
  realizedPnlQuote?: number;
  tradedQuoteVolume?: number;
  inventoryBaseQty?: number;
  inventoryCostQuote?: number;
  consecutiveExchangeRejects?: number;
  params: Record<string, unknown>;
};

export type StrategyTickContext = {
  session: StrategyRuntimeSession;
  ts: string;
};

export type StrategyControllerFacade = {
  startArbitrageStrategyForUser(
    strategyParamsDto: ArbitrageStrategyDto,
    checkIntervalSeconds: number,
    maxOpenOrders: number,
  ): Promise<void>;
  executePureMarketMakingStrategy(
    strategyParamsDto: PureMarketMakingStrategyDto,
  ): Promise<void>;
  executeVolumeStrategy(
    exchangeName: string | undefined,
    symbol: string | undefined,
    baseIncrementPercentage: number,
    baseIntervalTime: number,
    baseTradeAmount: number,
    numTrades: number,
    userId: string,
    clientId: string,
    pricePushRate: number,
    postOnlySide?: 'buy' | 'sell',
    executionVenue?: VolumeExecutionVenue,
    dexId?: ConnectorId,
    chainId?: number,
    tokenIn?: string,
    tokenOut?: string,
    feeTier?: number,
    slippageBps?: number,
    recipient?: string,
    executionCategoryInput?: string,
  ): Promise<void>;
  executeEfficientDualAccountVolumeStrategy(
    strategyParamsDto: ExecuteEfficientDualAccountVolumeStrategyDto,
  ): Promise<void>;
  executeTimeIndicatorStrategy(params: TimeIndicatorStrategyDto): Promise<void>;
};

export interface StrategyController {
  readonly strategyType: StrategyType;
  getCadenceMs(parameters: Record<string, unknown>): number;
  rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void>;
  decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]>;
  onActionsPublished?(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void>;
  start?(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void>;
}
