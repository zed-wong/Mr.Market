import { ApiProperty } from '@nestjs/swagger';

export class CampaignDataDto {
  @ApiProperty()
  chain_id: number;

  @ApiProperty()
  address: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  exchange_name: string;

  @ApiProperty()
  symbol: string;

  @ApiProperty()
  details: Record<string, unknown>;

  @ApiProperty()
  start_date: string;

  @ApiProperty()
  end_date: string;

  @ApiProperty()
  fund_amount: string;

  @ApiProperty()
  fund_token: string;

  @ApiProperty()
  fund_token_symbol: string;

  @ApiProperty()
  fund_token_decimals: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  launcher: string;

  @ApiProperty()
  exchange_oracle?: string;

  @ApiProperty()
  recording_oracle?: string;

  @ApiProperty()
  reputation_oracle?: string;

  @ApiProperty()
  balance: string;

  @ApiProperty()
  amount_paid: string;

  @ApiProperty()
  intermediate_results_url?: string;

  @ApiProperty()
  final_results_url?: string;

  @ApiProperty()
  created_at: number;
}

export class CampaignListResponseDto {
  @ApiProperty()
  has_more: boolean;

  @ApiProperty({ type: [CampaignDataDto] })
  results: CampaignDataDto[];
}
