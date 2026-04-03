import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class DirectStartMarketMakingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  exchangeName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pair: string;

  @ApiProperty()
  @IsUUID()
  strategyDefinitionId: string;

  @ApiProperty()
  @IsUUID()
  apiKeyId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountLabel: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;
}

export class DirectStopMarketMakingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class DirectResumeMarketMakingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class CampaignJoinRequestDto {
  @ApiProperty()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  evmAddress: string;

  @ApiProperty()
  @IsUUID()
  apiKeyId: string;

  @ApiProperty()
  chainId: number;

  @ApiProperty()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  campaignAddress: string;
}

export class DirectWalletStatusDto {
  @ApiProperty()
  configured: boolean;

  @ApiProperty({ nullable: true })
  address: string | null;
}
