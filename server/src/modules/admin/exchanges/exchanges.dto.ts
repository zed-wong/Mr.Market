import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddAPIKeyDto {
  @ApiProperty({ description: 'The name of exchange' })
  @IsString()
  @IsNotEmpty()
  exchange: string;

  @ApiProperty({ description: 'The name(alias) of API key' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'The API Key' })
  @IsString()
  @IsNotEmpty()
  api_key: string;

  @ApiProperty({ description: 'The secret' })
  @IsString()
  @IsNotEmpty()
  api_secret: string;

  @ApiProperty({
    description: 'Key permissions: read or read-trade',
    required: false,
    default: 'read',
  })
  @IsString()
  @IsOptional()
  permissions?: string;
}
