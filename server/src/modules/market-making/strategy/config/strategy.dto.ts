// strategy.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsEthereumAddress,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Side } from 'src/common/constants/side';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { STRATEGY_EXECUTION_CATEGORIES } from './strategy-execution-category';

export type VolumeExecutionVenue = 'cex' | 'dex';
export type DexAdapterId = 'uniswapV3' | 'pancakeV3';

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
    description: 'Exchange account label used for private-stream routing',
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
    description: 'Order refresh time in milliseconds',
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
      'Price source type (MID_PRICE, BEST_BID, BEST_ASK, LAST_PRICE)',
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
}
export class ExecuteVolumeStrategyDto {
  @ApiPropertyOptional({
    description:
      'Execution category for volume strategy. Preferred over executionVenue.',
    example: 'clob_cex',
    enum: STRATEGY_EXECUTION_CATEGORIES,
  })
  @IsOptional()
  @IsIn(STRATEGY_EXECUTION_CATEGORIES)
  executionCategory?: 'clob_cex' | 'clob_dex' | 'amm_dex';

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
      (o.executionCategory || '') === 'amm_dex' || o.executionVenue === 'dex',
  )
  @IsIn(['uniswapV3', 'pancakeV3'])
  dexId?: DexAdapterId;

  @ApiPropertyOptional({
    description: 'EVM chain id used for DEX execution (required for dex venue)',
    example: 1,
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm_dex' || o.executionVenue === 'dex',
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
      (o.executionCategory || '') === 'amm_dex' || o.executionVenue === 'dex',
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
      (o.executionCategory || '') === 'amm_dex' || o.executionVenue === 'dex',
  )
  @IsEthereumAddress()
  tokenOut?: string;

  @ApiPropertyOptional({
    description: 'V3 fee tier in ppm (500, 3000, 10000) for dex venue',
    example: 3000,
  })
  @ValidateIf(
    (o: ExecuteVolumeStrategyDto) =>
      (o.executionCategory || '') === 'amm_dex' || o.executionVenue === 'dex',
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

export class ExecuteDualAccountVolumeStrategyDto {
  @ApiProperty({ description: 'Name of the exchange used for both accounts' })
  @IsString()
  exchangeName: string;

  @ApiProperty({ description: 'Trading pair to execute', example: 'BTC/USDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Base amount to trade per cycle' })
  @IsNumber()
  @IsPositive()
  baseTradeAmount: number;

  @ApiProperty({ description: 'Cadence between cycles in seconds' })
  @IsInt()
  @IsPositive()
  baseIntervalTime: number;

  @ApiProperty({ description: 'Total number of successful cycles to execute' })
  @IsInt()
  @Min(0)
  numTrades: number;

  @ApiProperty({
    description: 'Percentage increment for offsetting from midPrice',
  })
  @IsNumber()
  baseIncrementPercentage: number;

  @ApiProperty({
    description: 'Rate at which to push pricing after each published cycle',
  })
  @IsNumber()
  pricePushRate: number;

  @ApiPropertyOptional({
    description: 'The first maker order side',
    example: 'buy',
  })
  @IsOptional()
  @IsEnum(Side)
  postOnlySide?: Side;

  @ApiPropertyOptional({
    description:
      'Allow maker/taker account roles to switch dynamically each cycle based on available balances',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  dynamicRoleSwitching?: boolean;

  @ApiPropertyOptional({
    description:
      'Stop the strategy once cumulative executed quote volume reaches this cap',
    example: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetQuoteVolume?: number;

  @ApiProperty({ description: 'Maker exchange account label' })
  @IsString()
  makerAccountLabel: string;

  @ApiProperty({ description: 'Taker exchange account label' })
  @IsString()
  takerAccountLabel: string;

  @ApiPropertyOptional({
    description:
      'Delay in milliseconds between maker acceptance and taker IOC submission',
    example: 250,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  makerDelayMs?: number;

  @ApiPropertyOptional({
    description:
      'Trade-size variance percentage applied around baseTradeAmount',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tradeAmountVariance?: number;

  @ApiPropertyOptional({
    description:
      'Price-offset variance percentage applied around baseIncrementPercentage',
    example: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOffsetVariance?: number;

  @ApiPropertyOptional({
    description:
      'Cadence variance percentage applied around baseIntervalTime for each cycle',
    example: 0.25,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cadenceVariance?: number;

  @ApiPropertyOptional({
    description:
      'Maker delay variance percentage applied around makerDelayMs for each cycle',
    example: 0.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  makerDelayVariance?: number;

  @ApiPropertyOptional({
    description: 'Probability of placing a buy when postOnlySide is not fixed',
    example: 0.55,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  buyBias?: number;

  @ApiPropertyOptional({
    description:
      'Per-account behavior profiles keyed by exchange account label',
    example: {
      maker: {
        tradeAmountMultiplier: 0.95,
        buyBias: 0.6,
      },
      taker: {
        tradeAmountMultiplier: 1.05,
        cadenceMultiplier: 1.1,
      },
    },
  })
  @IsOptional()
  @IsObject()
  accountProfiles?: Record<string, unknown>;

  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Client ID' })
  @IsString()
  clientId: string;
}

export class StopVolumeStrategyDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Client ID' })
  clientId: string;
}
