import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class TimeIndicatorStrategyDto {
  @ApiProperty({
    description: 'User ID executing the strategy',
    example: 'user123',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Client ID of the strategy owner',
    example: 'clientA',
  })
  @IsString()
  clientId: string;

  @ApiProperty({
    description: 'Exchange name (as recognized by CCXT)',
    example: 'binance',
  })
  @IsString()
  exchangeName: string;

  @ApiProperty({ description: 'Trading pair symbol', example: 'BTC/USDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Timeframe for candles', example: '5m' })
  @IsString()
  timeframe: string;

  @ApiProperty({
    description: 'Number of candles to fetch per tick',
    example: 300,
  })
  @IsInt()
  @IsPositive()
  lookback: number;

  @ApiProperty({ description: 'Fast EMA period', example: 20 })
  @IsInt()
  @IsPositive()
  emaFast: number;

  @ApiProperty({ description: 'Slow EMA period', example: 50 })
  @IsInt()
  @IsPositive()
  emaSlow: number;

  @ApiProperty({ description: 'RSI calculation period', example: 14 })
  @IsInt()
  @IsPositive()
  rsiPeriod: number;

  @ApiPropertyOptional({
    description: 'RSI threshold for buys (<= this value)',
    example: 35,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rsiBuyBelow?: number;

  @ApiPropertyOptional({
    description: 'RSI threshold for sells (>= this value)',
    example: 65,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rsiSellAbove?: number;

  @ApiProperty({
    description: 'Indicator mode to use',
    enum: ['ema', 'rsi', 'both'],
    example: 'both',
  })
  @IsIn(['ema', 'rsi', 'both'])
  indicatorMode: 'ema' | 'rsi' | 'both';

  @ApiPropertyOptional({
    description: 'Allowed weekdays (0=Sunday, 6=Saturday)',
    example: [1, 2, 3, 4, 5],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedWeekdays?: number[];

  @ApiPropertyOptional({
    description: 'Allowed hours (0–23)',
    example: [9, 10, 11, 15, 16],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(23, { each: true })
  allowedHours?: number[];

  @ApiProperty({
    description: 'Whether order size is expressed in base or quote currency',
    enum: ['base', 'quote'],
    example: 'quote',
  })
  @IsIn(['base', 'quote'])
  orderMode: 'base' | 'quote';

  @ApiProperty({
    description: 'Order size (amount in base or quote, depending on orderMode)',
    example: 100,
  })
  @IsNumber()
  @IsPositive()
  orderSize: number;

  @ApiPropertyOptional({
    description: 'Limit price slippage in basis points (default 10 = 0.10%)',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  slippageBps?: number;

  @ApiPropertyOptional({
    description: 'Max concurrent open orders allowed on the symbol (guard)',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxConcurrentPositions?: number;

  @ApiProperty({ description: 'Tick interval in milliseconds', example: 60000 })
  @IsInt()
  @IsPositive()
  tickIntervalMs: number;

  // --- NEW: Risk controls ---
  @ApiPropertyOptional({
    description: 'Stop-loss percent (3 = 3%).',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  stopLossPct?: number;

  @ApiPropertyOptional({
    description: 'Take-profit percent (3 = 3%).',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  takeProfitPct?: number;
}
