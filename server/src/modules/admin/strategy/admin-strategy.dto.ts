import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDecimal,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  STRATEGY_LAUNCH_SURFACES,
  StrategyDefinitionVisibility,
  type StrategyDefinitionCapabilities,
} from 'src/common/entities/market-making/strategy-definition.entity';

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

export class StrategyDefinitionCapabilitiesDto
  implements StrategyDefinitionCapabilities
{
  @ApiProperty({
    description: 'Surfaces where this definition can be launched',
    example: ['strategy_settings', 'admin_direct_mm'],
    enum: STRATEGY_LAUNCH_SURFACES,
    isArray: true,
  })
  @IsArray()
  @IsIn(STRATEGY_LAUNCH_SURFACES, { each: true })
  launchSurfaces: StrategyDefinitionCapabilities['launchSurfaces'];

  @ApiPropertyOptional({
    description: 'Execution-account model for direct launch surfaces',
    example: 'single_account',
    enum: ['single_account', 'dual_account'],
    nullable: true,
  })
  @IsOptional()
  @IsIn(['single_account', 'dual_account'])
  directExecutionMode?: StrategyDefinitionCapabilities['directExecutionMode'];
}

export class StrategyDefinitionDto {
  @ApiProperty({
    description: 'Stable definition key',
    example: 'pure-market-making',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Display name',
    example: 'Pure Market Making',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable description',
    example: 'Layered bid/ask quoting around an oracle mid price.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Controller type that maps to local strategy intent-generation implementation',
    example: 'pureMarketMaking',
  })
  @IsString()
  @IsNotEmpty()
  controllerType: string;

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
  @IsObject()
  configSchema: Record<string, unknown>;

  @ApiProperty({
    description: 'Default config values used by admin UI and instance creation',
    example: {
      pair: 'BTC/USDT',
      exchangeName: 'binance',
    },
  })
  @IsObject()
  defaultConfig: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Strategy launch capabilities and execution mode metadata',
    example: {
      launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
      directExecutionMode: 'single_account',
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyDefinitionCapabilitiesDto)
  capabilities?: StrategyDefinitionCapabilities;

  @ApiPropertyOptional({
    description: 'Definition visibility scope',
    example: 'public',
    enum: StrategyDefinitionVisibility,
  })
  @IsOptional()
  @IsEnum(StrategyDefinitionVisibility)
  visibility?: StrategyDefinitionVisibility;

  @ApiPropertyOptional({
    description: 'Creator identity',
    example: 'seed',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateStrategyDefinitionDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Controller type' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  controllerType?: string;

  @ApiPropertyOptional({ description: 'JSON schema' })
  @IsOptional()
  @IsObject()
  configSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Default config values' })
  @IsOptional()
  @IsObject()
  defaultConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Strategy launch capabilities' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyDefinitionCapabilitiesDto)
  capabilities?: StrategyDefinitionCapabilities;

  @ApiPropertyOptional({
    description: 'Definition visibility',
    enum: StrategyDefinitionVisibility,
  })
  @IsOptional()
  @IsEnum(StrategyDefinitionVisibility)
  visibility?: StrategyDefinitionVisibility;
}

export class RemoveStrategyDefinitionDto {
  @ApiProperty({
    description: 'Strategy definition id',
    example: 'bfcdd76d-bbcb-4f85-b645-c5f6a5cc3981',
  })
  strategyDefinitionId: string;
}

export class StartStrategyInstanceDto {
  @ApiProperty({
    description: 'Strategy definition id',
    example: 'bfcdd76d-bbcb-4f85-b645-c5f6a5cc3981',
  })
  strategyDefinitionId: string;

  @ApiProperty({ description: 'User ID associated with the strategy instance' })
  userId: string;

  @ApiProperty({
    description: 'Client ID associated with the strategy instance',
  })
  clientId: string;

  @ApiPropertyOptional({
    description:
      'Order id binding for pure market making runtime, when strategy should be tied to an MM order',
  })
  marketMakingOrderId?: string;

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
  strategyDefinitionId: string;

  @ApiProperty({ description: 'User ID associated with the strategy instance' })
  userId: string;

  @ApiProperty({
    description: 'Client ID associated with the strategy instance',
  })
  clientId: string;

  @ApiPropertyOptional({
    description:
      'Order id binding for pure market making runtime, when strategy is tied to an MM order',
  })
  marketMakingOrderId?: string;
}
