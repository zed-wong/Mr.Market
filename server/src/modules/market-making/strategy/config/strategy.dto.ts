// strategy.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsEthereumAddress,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Side } from 'src/common/constants/side';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { STRATEGY_EXECUTION_CATEGORIES } from './strategy-execution-category';

export type VolumeExecutionVenue = 'cex' | 'dex';
export type ConnectorId = 'uniswapV3' | 'pancakeV3';

export class DualAccountBehaviorProfileDto {
  @ApiPropertyOptional({ example: 0.95 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tradeAmountMultiplier?: number;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tradeAmountVariance?: number;

  @ApiPropertyOptional({ example: 0.9 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  priceOffsetMultiplier?: number;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOffsetVariance?: number;

  @ApiPropertyOptional({ example: 1.1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  cadenceMultiplier?: number;

  @ApiPropertyOptional({ example: 0.25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cadenceVariance?: number;

  @ApiPropertyOptional({ example: 0.6 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  buyBias?: number;

  @ApiPropertyOptional({ example: [8, 9, 10, 11] })
  @IsOptional()
  @Type(() => Number)
  @ArrayMaxSize(24)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(23, { each: true })
  activeHours?: number[];
}

export class DualAccountBehaviorProfilesDto {
  @ApiPropertyOptional({ type: DualAccountBehaviorProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DualAccountBehaviorProfileDto)
  maker?: DualAccountBehaviorProfileDto;

  @ApiPropertyOptional({ type: DualAccountBehaviorProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DualAccountBehaviorProfileDto)
  taker?: DualAccountBehaviorProfileDto;
}

export class ArbitrageStrategyDto {
  @ApiProperty({
    example: '123',
    description: 'User ID for whom the strategy is being executed.',
  })
  userId: string;

  @ApiProperty({
    example: '456',
    description: 'Client ID associated with the user.',
  })
  clientId: string;

  @ApiProperty({
    example: 'ETH/USDT',
    description: 'The trading pair to monitor for arbitrage opportunities.',
  })
  pair: string;

  @ApiProperty({
    example: 1.0,
    description: 'The amount of the asset to trade.',
  })
  amountToTrade: number;

  @ApiProperty({
    example: 0.01,
    description:
      'Minimum profitability threshold as a decimal (e.g., 0.01 for 1%).',
  })
  minProfitability: number;

  @ApiProperty({
    example: 'binance',
    description: 'Name of the first exchange.',
  })
  exchangeAName: string;

  @ApiProperty({ example: 'mexc', description: 'Name of the second exchange.' })
  exchangeBName: string;
  @ApiProperty({ example: 10, description: 'interval to run arbitrage scan' })
  checkIntervalSeconds?: number;
  @ApiProperty({ example: 1, description: 'Max number of orders' })
  maxOpenOrders?: number;
}

export class PureMarketMakingStrategyDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiPropertyOptional({
    description:
      'Market-making order id that owns this runtime strategy instance',
    example: 'f8a5c2fd-c802-4f6f-b6cf-2ab7af4f3532',
  })
  marketMakingOrderId?: string;

  @ApiProperty({ description: 'Client ID' })
  clientId: string;

  @ApiProperty({ description: 'Trading pair', example: 'BTC/USDT' })
  pair: string;

  @ApiProperty({
    description: 'Exchange name used for execution',
    example: 'binance',
  })
  exchangeName: string;

  @ApiPropertyOptional({
    description: 'Exchange account label used for user-stream routing',
    example: 'default',
  })
  accountLabel?: string;

  @ApiPropertyOptional({
    description:
      'If provided, this exchange is used as an oracle for price data instead of `exchangeName`',
    example: 'mexc',
  })
  oracleExchangeName?: string; // <--- NEW optional param

  @ApiProperty({ description: 'Bid spread as a percentage', example: 0.1 })
  bidSpread: number;

  @ApiProperty({ description: 'Ask spread as a percentage', example: 0.1 })
  askSpread: number;

  @ApiProperty({ description: 'Order amount', example: 0.1 })
  orderAmount: number;

  @ApiProperty({
    description: 'Order refresh time in milliseconds (minimum 5000)',
    example: 15000,
  })
  orderRefreshTime: number;

  @ApiProperty({
    description: 'Number of orders you want to place on both sides',
    example: 1,
  })
  numberOfLayers: number;

  @ApiProperty({
    description:
      'Price source type (MID_PRICE, MICROPRICE, BEST_BID, BEST_ASK, LAST_PRICE)',
    example: 'MID_PRICE',
    enum: PriceSourceType,
  })
  priceSourceType: PriceSourceType;

  @ApiProperty({
    description:
      'Amount that increases on each layer, set to 0 for same amount',
    example: 1,
  })
  amountChangePerLayer: number; // This can be a fixed amount or a percentage

  @ApiProperty({
    description:
      'How the amountChangePerLayer should be interpreted (fixed, percentage)',
    example: 'percentage',
  })
  amountChangeType: 'fixed' | 'percentage';

  @ApiProperty({
    description: 'Ceiling Price, no buy orders above this price',
    example: '0',
    required: false,
  })
  ceilingPrice?: number;

  @ApiProperty({
    description: 'Floor price, no sell orders below this price.',
    example: '0',
    required: false,
  })
  floorPrice?: number;

  @ApiPropertyOptional({
    description: 'Enable hanging orders behavior',
    example: true,
  })
  hangingOrdersEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable maker-heavy quote widening mode',
    example: true,
  })
  makerHeavyMode?: boolean;

  @ApiPropertyOptional({
    description: 'Maker-heavy widening bias in basis points',
    example: 20,
  })
  makerHeavyBiasBps?: number;

  @ApiPropertyOptional({
    description: 'Target base inventory ratio (0-1)',
    example: 0.5,
  })
  inventoryTargetBaseRatio?: number;

  @ApiPropertyOptional({
    description: 'Inventory skew factor for spread adjustment',
    example: 0.25,
  })
  inventorySkewFactor?: number;

  @ApiPropertyOptional({
    description: 'Current base inventory ratio estimate (0-1)',
    example: 0.5,
  })
  currentBaseRatio?: number;

  @ApiPropertyOptional({
    description: 'Minimum effective spread required to place or keep a quote',
    example: 0.01,
  })
  minimumSpread?: number;

  @ApiPropertyOptional({
    description: 'Skip refresh when quote drift remains below this percentage',
    example: 0.002,
  })
  orderRefreshTolerancePct?: number;

  @ApiPropertyOptional({
    description:
      'Cooldown after a fill before placing new quotes, in milliseconds',
    example: 5000,
  })
  filledOrderDelay?: number;

  @ApiPropertyOptional({
    description: 'Maximum order age before forced refresh, in milliseconds',
    example: 60000,
  })
  maxOrderAge?: number;

  @ApiPropertyOptional({
    description:
      'Cancel hanging orders when their drift exceeds this percentage',
    example: 0.02,
  })
  hangingOrdersCancelPct?: number;

  @ApiPropertyOptional({
    description:
      'Stop the strategy when realized loss breaches this threshold. Use a positive absolute quote value or a percentage string like "5%".',
    example: '5%',
  })
  killSwitchThreshold?: number | string;

  @ApiPropertyOptional({
    description:
      'Stop the strategy when this many consecutive intent failures occur within the observation window. 0 or unset disables.',
    example: 100,
  })
  maxConsecutiveRejects?: number;

  @ApiPropertyOptional({
    description: 'Enable volatility-based adaptive spread widening',
    example: true,
  })
  volBasedSpread?: boolean;

  @ApiPropertyOptional({
    description: 'Rolling volatility window for adaptive PMM signals',
    example: 60000,
  })
  sigmaWindowMs?: number;

  @ApiPropertyOptional({
    description:
      'Multiplier applied to realized volatility before widening spread',
    example: 1,
  })
  spreadSigmaMultiplier?: number;

  @ApiPropertyOptional({
    description: 'Maximum effective adaptive spread after signal adjustments',
    example: 0.02,
  })
  maxAdaptiveSpread?: number;

  @ApiPropertyOptional({
    description: 'Minimum mid-price samples required before using volatility',
    example: 3,
  })
  volatilitySampleMinCount?: number;

  @ApiPropertyOptional({
    description: 'Multiplier applied to order-book imbalance spread skew',
    example: 0.002,
  })
  imbalanceSkewFactor?: number;

  @ApiPropertyOptional({
    description: 'Order-book depth levels used for imbalance',
    example: 3,
  })
  imbalanceDepthLevels?: number;

  @ApiPropertyOptional({
    description: 'Minimum total depth notional required before using imbalance',
    example: 1000,
  })
  imbalanceMinDepthNotional?: number;

  @ApiPropertyOptional({
    description: 'EWMA smoothing window for order-book imbalance',
    example: 1000,
  })
  imbalanceSmoothingMs?: number;

  @ApiPropertyOptional({
    description:
      'Inventory deviation where imbalance influence is fully suppressed',
    example: 0.3,
  })
  inventorySeverePivot?: number;

  @ApiPropertyOptional({
    description:
      'Inventory deviation where the side that worsens inventory is paused',
    example: 0.45,
  })
  inventoryPauseSidePivot?: number;

  @ApiPropertyOptional({
    description: 'Enable adaptive quote sizing and layer reduction',
    example: true,
  })
  adaptiveSizeEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Multiplier for volatility-based quote size reduction',
    example: 5,
  })
  sizeVolScalingFactor?: number;

  @ApiPropertyOptional({
    description: 'Minimum size ratio after adaptive reductions',
    example: 0.2,
  })
  sizeFloor?: number;

  @ApiPropertyOptional({
    description: 'Maximum layers allowed while volatility is active',
    example: 1,
  })
  maxLayersInVol?: number;

  @ApiPropertyOptional({
    description:
      'Single-side budget must be at least this multiple of min order notional to keep multiple layers',
    example: 10,
  })
  layeringMinBudgetMultiple?: number;

  @ApiPropertyOptional({
    description: 'Enable adaptive PMM refresh cadence',
    example: true,
  })
  adaptiveRefreshEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Fastest adaptive refresh cadence in milliseconds',
    example: 1000,
  })
  refreshMinMs?: number;

  @ApiPropertyOptional({
    description: 'Slowest adaptive refresh cadence in milliseconds',
    example: 10000,
  })
  refreshMaxMs?: number;

  @ApiPropertyOptional({
    description: 'Volatility level that maps refresh cadence to refreshMinMs',
    example: 0.01,
  })
  refreshVolPivot?: number;

  @ApiPropertyOptional({
    description: 'Maximum cancel intents emitted per strategy per second',
    example: 2,
  })
  cancelBudgetPerSec?: number;

  @ApiPropertyOptional({
    description:
      'Runtime observation window for reject and rate-limit pressure',
    example: 60000,
  })
  runtimeObservationWindowMs?: number;

  @ApiPropertyOptional({
    description: 'Post-only reject count that triggers temporary wider spreads',
    example: 2,
  })
  postOnlyRejectThreshold?: number;

  @ApiPropertyOptional({
    description: 'Extra spread in bps after post-only reject pressure',
    example: 10,
  })
  postOnlyRejectWidenBps?: number;

  @ApiPropertyOptional({
    description: 'Rate-limit count that slows PMM cadence to refreshMaxMs',
    example: 1,
  })
  rateLimitPressureThreshold?: number;

  @ApiPropertyOptional({
    description: 'Soft stale threshold for tracked order-book signals',
    example: 2000,
  })
  staleSoftMs?: number;

  @ApiPropertyOptional({
    description: 'Hard stale threshold for tracked order-book signals',
    example: 10000,
  })
  staleHardMs?: number;

  @ApiPropertyOptional({
    description: 'Window for market crash detection from mid-price history',
    example: 60000,
  })
  marketCrashWindowMs?: number;

  @ApiPropertyOptional({
    description: 'Mid-price move threshold that blocks PMM quoting',
    example: 500,
  })
  marketCrashBps?: number;

  @ApiPropertyOptional({
    description: 'Adverse markout threshold in basis points after a fill',
    example: 20,
  })
  adverseMarkoutGuardBps?: number;

  @ApiPropertyOptional({
    description: 'Delay before evaluating post-fill markout in milliseconds',
    example: 5000,
  })
  adverseMarkoutWindowMs?: number;

  @ApiPropertyOptional({
    description: 'Side cooldown duration after adverse markout in milliseconds',
    example: 30000,
  })
  adverseMarkoutCooldownMs?: number;

  @ApiPropertyOptional({
    description:
      'Gradual side recovery duration after adverse markout cooldown expires',
    example: 30000,
  })
  adverseMarkoutRecoveryMs?: number;

  @ApiPropertyOptional({
    description: 'Initial size ratio while a cooled-down side recovers',
    example: 0.5,
  })
  adverseMarkoutRecoverySizeRatio?: number;

  @ApiPropertyOptional({
    description: 'Minimum global warmup duration in milliseconds',
    example: 30000,
  })
  warmupMs?: number;

  @ApiPropertyOptional({
    description: 'Minimum global warmup tick count',
    example: 3,
  })
  warmupTicks?: number;

  @ApiPropertyOptional({
    description: 'Minimum half-spread used while PMM is warming up',
    example: 0.005,
  })
  warmupSpread?: number;

  @ApiPropertyOptional({
    description: 'Quote size ratio used while PMM is warming up',
    example: 0.2,
  })
  warmupSizeRatio?: number;
}
export class ExecuteVolumeStrategyDto {
  @ApiPropertyOptional({
    description:
      'Execution category for volume strategy. Preferred over executionVenue.',
    example: 'clob',
    enum: STRATEGY_EXECUTION_CATEGORIES,
  })
  @IsOptional()
  @IsIn(STRATEGY_EXECUTION_CATEGORIES)
  executionCategory?: 'clob' | 'clob_dex' | 'amm';

  @ApiPropertyOptional({
    description:
      'Execution venue for volume strategy. Defaults to cex when omitted.',
    example: 'cex',
    enum: ['cex', 'dex'],
  })
  @IsOptional()
  @IsIn(['cex', 'dex'])
  executionVenue?: VolumeExecutionVenue;

  @ApiPropertyOptional({
    description: 'Name of the CEX exchange (required for cex venue)',
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) => (o.executionVenue ?? 'cex') === 'cex',
  )
  @IsString()
  exchangeName?: string;

  @ApiPropertyOptional({
    description: 'CEX symbol to trade, e.g. BTC/USDT (required for cex venue)',
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) => (o.executionVenue ?? 'cex') === 'cex',
  )
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    description: 'DEX id (required for dex venue)',
    example: 'uniswapV3',
    enum: ['uniswapV3', 'pancakeV3'],
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm' || o.executionVenue === 'dex',
  )
  @IsIn(['uniswapV3', 'pancakeV3'])
  dexId?: ConnectorId;

  @ApiPropertyOptional({
    description: 'EVM chain id used for DEX execution (required for dex venue)',
    example: 1,
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm' || o.executionVenue === 'dex',
  )
  @IsInt()
  @IsPositive()
  chainId?: number;

  @ApiPropertyOptional({
    description:
      'Input token address for DEX execution (required for dex venue)',
    example: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm' || o.executionVenue === 'dex',
  )
  @IsEthereumAddress()
  tokenIn?: string;

  @ApiPropertyOptional({
    description:
      'Output token address for DEX execution (required for dex venue)',
    example: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm' || o.executionVenue === 'dex',
  )
  @IsEthereumAddress()
  tokenOut?: string;

  @ApiPropertyOptional({
    description: 'V3 fee tier in ppm (500, 3000, 10000) for dex venue',
    example: 3000,
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm' || o.executionVenue === 'dex',
  )
  @IsInt()
  @IsPositive()
  feeTier?: number;

  @ApiPropertyOptional({
    description:
      'Slippage tolerance in bps for dex venue (defaults from incrementPercentage)',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  slippageBps?: number;

  @ApiPropertyOptional({
    description:
      'DEX swap recipient address (defaults to operator wallet address)',
    example: '0x1111111111111111111111111111111111111111',
  })
  @IsOptional()
  @IsEthereumAddress()
  recipient?: string;

  @ApiProperty({
    description:
      'Percentage increment for offsetting from midPrice (initial offset)',
  })
  @IsNumber()
  incrementPercentage: number;

  @ApiProperty({
    description: 'Time interval (in seconds) between each trade execution',
  })
  @IsInt()
  @IsPositive()
  intervalTime: number;

  @ApiProperty({ description: 'Base amount to trade per order' })
  @IsNumber()
  @IsPositive()
  tradeAmount: number;

  @ApiProperty({ description: 'Number of total trades to execute' })
  @IsInt()
  @Min(0)
  numTrades: number;

  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Client ID' })
  @IsString()
  clientId: string;

  @ApiProperty({
    description:
      'Rate at which to push the price upward after each successful trade, in percent',
    example: 1,
  })
  @IsNumber()
  pricePushRate: number; // <--- NEW PARAM to push price after each trade
  @ApiPropertyOptional({
    description: 'The first trade is a buy or sell',
    example: 'buy',
  })
  @IsOptional()
  @IsEnum(Side)
  postOnlySide?: Side;
}

export class ExecuteEfficientDualAccountVolumeStrategyDto {
  @ApiProperty({ description: 'Name of the exchange used for both accounts' })
  @IsString()
  exchangeName: string;

  @ApiProperty({ description: 'Trading pair to execute', example: 'BTC/USDT' })
  @IsString()
  symbol: string;

  @ApiPropertyOptional({
    description:
      'Fallback trading pair alias used by persisted admin-direct rows',
    example: 'BTC/USDT',
  })
  @IsOptional()
  @IsString()
  pair?: string;

  @ApiProperty({
    description:
      'Maximum base amount to trade per cycle; live capacity may reduce the executed amount',
    example: 0.5,
  })
  @IsNumber()
  @IsPositive()
  maxOrderAmount: number;

  @ApiPropertyOptional({
    description: 'Unified planner mode',
    example: 'balanced',
    enum: ['cheapest_capital', 'balanced', 'fastest_volume'],
  })
  @IsOptional()
  @IsIn(['cheapest_capital', 'balanced', 'fastest_volume'])
  mode?: 'cheapest_capital' | 'balanced' | 'fastest_volume';

  @ApiPropertyOptional({
    description:
      'Optional target quote volume cap for the session; the strategy stops once reached',
    example: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyVolumeTarget?: number;

  @ApiPropertyOptional({
    description: 'Optional cadence between cycles in seconds',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  interval?: number;

  @ApiProperty({ description: 'Maker exchange account label' })
  @IsString()
  makerAccountLabel: string;

  @ApiProperty({ description: 'Taker exchange account label' })
  @IsString()
  takerAccountLabel: string;

  @ApiPropertyOptional({
    description:
      'Cycle role mode. Unified direct orders default to alternating.',
    example: 'alternating',
  })
  @IsOptional()
  @IsIn(['alternating', 'static'])
  cycleMode?: 'alternating' | 'static';

  @ApiPropertyOptional({
    description:
      'Allow maker/taker account roles to switch dynamically each cycle based on available balances. Unified direct orders default to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  dynamicRoleSwitching?: boolean;

  @ApiPropertyOptional({
    description: 'Maker protection mode',
    example: 'alive_only',
  })
  @IsOptional()
  @IsIn(['alive_only', 'strict_top'])
  makerProtectionMode?: 'alive_only' | 'strict_top';

  @ApiPropertyOptional({
    description:
      'Trade-size variance percentage applied around selected cycle size',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tradeAmountVariance?: number;

  @ApiPropertyOptional({
    description:
      'Price-offset variance percentage applied around selected maker price',
    example: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  priceOffsetVariance?: number;

  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Client ID' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({
    description:
      'Owning market-making order id for admin-direct runtime binding',
  })
  @IsOptional()
  @IsString()
  marketMakingOrderId?: string;

  safetyBuffer?: {
    kind?: 'default_formula';
    exchangeCostMinMultiplier?: number;
    feeCostMultiplier?: number;
  };

  targetQuoteVolume?: number;
  maxNotional?: number;
  cooldownSeconds?: number;
}

export class StopVolumeStrategyDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Client ID' })
  clientId: string;
}
