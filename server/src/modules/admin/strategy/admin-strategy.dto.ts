import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsUUID } from 'class-validator';

import {
  ArbitrageStrategyDto,
  ExecuteVolumeStrategyDto,
  PureMarketMakingStrategyDto,
} from '../../market-making/strategy/strategy.dto';

// Unified DTO for starting strategies that handles all types
export class StartStrategyDto {
  @ApiProperty({
    description: 'Type of strategy to start',
    example: 'arbitrage',
  })
  strategyType: 'arbitrage' | 'marketMaking' | 'volume';

  @ApiPropertyOptional({
    description: 'Parameters for arbitrage strategy (required for arbitrage)',
    type: ArbitrageStrategyDto,
  })
  arbitrageParams?: ArbitrageStrategyDto;

  @ApiPropertyOptional({
    description:
      'Parameters for market making strategy (required for market making)',
    type: PureMarketMakingStrategyDto,
  })
  marketMakingParams?: PureMarketMakingStrategyDto;

  @ApiPropertyOptional({
    description: 'Parameters for volume strategy (required for volume)',
    type: ExecuteVolumeStrategyDto,
  })
  volumeParams?: ExecuteVolumeStrategyDto;

  @ApiPropertyOptional({
    description: 'Check interval in seconds (arbitrage-specific)',
    example: 10,
  })
  checkIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Max open orders (arbitrage-specific)',
    example: 5,
  })
  maxOpenOrders?: number;
}

// Stop Strategy DTO for stopping a strategy
export class StopStrategyDto {
  @ApiProperty({
    description: 'User ID associated with the strategy',
    example: '123',
  })
  userId: string;

  @ApiProperty({
    description: 'Client ID associated with the strategy',
    example: '456',
  })
  clientId: string;

  @ApiProperty({
    description: 'Type of strategy to stop',
    example: 'arbitrage',
  })
  strategyType: 'arbitrage' | 'marketMaking' | 'volume';
}

export class GetDepositAddressDto {
  @ApiProperty({
    description: 'exchangeName',
    example: 'binance',
  })
  exchangeName: string;
  @ApiProperty({
    description: 'The token to be deposited',
    example: 'USDT',
  })
  tokenSymbol: string;
  @ApiProperty({
    description: 'The network to deposit on',
    example: 'ERC20',
  })
  network: string;
  @ApiPropertyOptional({
    description: 'default or account2',
    example: 'default',
  })
  accountLabel?: string; // Optional label for the account
}

// DTO to define the expected body structure
export class GetTokenSymbolDto {
  @ApiProperty({
    description: 'The contract address of the token (ERC-20)',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  contractAddress: string;

  @ApiProperty({
    description:
      'The chain ID of the blockchain (e.g., 1 for Ethereum Mainnet, 56 for Binance Smart Chain)',
    example: 1,
  })
  chainId: number;
}

export class GetSupportedNetworksDto {
  @ApiProperty({
    description: 'The name of the exchange (e.g., binance, kraken, etc.)',
    example: 'binance',
  })
  exchangeName: string;

  @ApiProperty({
    description: 'The symbol of the token (e.g., BTC, ETH, USDT, etc.)',
    example: 'USDT',
  })
  tokenSymbol: string;

  @ApiPropertyOptional({
    description:
      'Optional account label, if there are multiple accounts on the exchange',
    example: 'default',
    required: false,
  })
  accountLabel?: string;
}

export class JoinStrategyDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  strategyId: string;

  @IsDecimal()
  amount: number;
}

export class StrategyDefinitionDto {
  @ApiProperty({
    description: 'Stable definition key',
    example: 'pure-market-making',
  })
  key: string;

  @ApiProperty({
    description: 'Display name',
    example: 'Pure Market Making',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable description',
    example: 'Layered bid/ask quoting around an oracle mid price.',
  })
  description?: string;

  @ApiProperty({
    description: 'Executor type that maps to local executor implementation',
    example: 'pureMarketMaking',
  })
  executorType: string;

  @ApiProperty({
    description: 'JSON schema for validating instance configs',
    example: {
      type: 'object',
      required: ['pair', 'exchangeName'],
      properties: {
        pair: { type: 'string' },
        exchangeName: { type: 'string' },
      },
    },
  })
  configSchema: Record<string, unknown>;

  @ApiProperty({
    description: 'Default config values used by admin UI and instance creation',
    example: {
      pair: 'BTC/USDT',
      exchangeName: 'binance',
    },
  })
  defaultConfig: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Definition visibility scope',
    example: 'system',
  })
  visibility?: string;

  @ApiPropertyOptional({
    description: 'Creator identity',
    example: 'seed',
  })
  createdBy?: string;
}

export class UpdateStrategyDefinitionDto {
  @ApiPropertyOptional({ description: 'Display name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Executor type' })
  executorType?: string;

  @ApiPropertyOptional({ description: 'JSON schema' })
  configSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Default config values' })
  defaultConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Definition visibility' })
  visibility?: string;
}

export class PublishStrategyDefinitionVersionDto {
  @ApiPropertyOptional({ description: 'Display name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Executor type' })
  executorType?: string;

  @ApiPropertyOptional({ description: 'JSON schema' })
  configSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Default config values' })
  defaultConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Definition visibility' })
  visibility?: string;

  @ApiPropertyOptional({
    description: 'Explicit semantic version. If absent, patch version is incremented.',
    example: '1.0.1',
  })
  version?: string;
}

export class StartStrategyInstanceDto {
  @ApiProperty({
    description: 'Strategy definition id',
    example: 'bfcdd76d-bbcb-4f85-b645-c5f6a5cc3981',
  })
  definitionId: string;

  @ApiProperty({ description: 'User ID associated with the strategy instance' })
  userId: string;

  @ApiProperty({
    description: 'Client ID associated with the strategy instance',
  })
  clientId: string;

  @ApiPropertyOptional({
    description: 'Config overrides merged on top of definition defaultConfig',
    example: {
      pair: 'ETH/USDT',
      exchangeName: 'mexc',
    },
  })
  config?: Record<string, unknown>;
}

export class StopStrategyInstanceDto {
  @ApiProperty({
    description: 'Strategy definition id',
    example: 'bfcdd76d-bbcb-4f85-b645-c5f6a5cc3981',
  })
  definitionId: string;

  @ApiProperty({ description: 'User ID associated with the strategy instance' })
  userId: string;

  @ApiProperty({
    description: 'Client ID associated with the strategy instance',
  })
  clientId: string;
}
