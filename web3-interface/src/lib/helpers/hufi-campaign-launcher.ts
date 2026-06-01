import BigNumber from 'bignumber.js';
import { env } from '$env/dynamic/public';

export const HUFI_POLYGON_CHAIN_ID = 137;
export const HUFI_CAMPAIGN_LIST_LIMIT = 25;

export interface HufiCampaignDetails {
  daily_volume_target?: number;
  minimum_balance_target?: number;
  daily_balance_target?: number;
}

export interface HufiCampaign {
  chain_id: number;
  address: string;
  type: string;
  exchange_name: string;
  symbol: string;
  details: HufiCampaignDetails;
  start_date: string;
  end_date: string;
  fund_amount: string;
  fund_token: string;
  fund_token_symbol: string;
  fund_token_decimals: number;
  status: string;
  escrow_status?: string;
  amount_paid?: string;
  daily_paid_amounts?: { date?: string; amount?: string | number }[];
  launcher?: string;
  exchange_oracle?: string;
  recording_oracle?: string;
  reputation_oracle?: string;
  balance?: string;
  reserved_funds?: string;
  exchange_oracle_fee_percent?: number;
  recording_oracle_fee_percent?: number;
  reputation_oracle_fee_percent?: number;
  intermediate_results_url?: string | null;
  final_results_url?: string | null;
  created_at?: number;
  cancellation_requested_at?: number | null;
  finalized_at?: number | null;
}

export interface HufiCampaignListResponse {
  has_more: boolean;
  results: HufiCampaign[];
}

export interface HufiCampaignStats {
  n_active_campaigns?: number;
  rewards_pool_usd?: number;
  n_finished_campaigns?: number;
  paid_rewards_usd?: number;
}

export interface HufiTotalVolumeStats {
  total_volume?: number;
}

export class HufiLauncherError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HufiLauncherError';
    this.status = status;
  }
}

export const hufiCampaignLauncherBaseUrl = (): string =>
  (env.PUBLIC_HUFI_CAMPAGIN_LAUNCHER_URL || 'https://cl.hu.finance').replace(/\/$/, '');

export const hufiReportingBaseUrl = (): string =>
  (env.PUBLIC_HUFI_REPORTING_URL || 'https://ro.hu.finance').replace(/\/$/, '');

const launcherFetch = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${hufiCampaignLauncherBaseUrl()}${path}`);
  if (!response.ok) {
    throw new HufiLauncherError(
      `HuFi Campaign Launcher request failed (${response.status} ${response.statusText})`,
      response.status
    );
  }
  return (await response.json()) as T;
};

const reportingFetch = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${hufiReportingBaseUrl()}${path}`);
  if (!response.ok) {
    throw new HufiLauncherError(
      `HuFi reporting request failed (${response.status} ${response.statusText})`,
      response.status
    );
  }
  return (await response.json()) as T;
};

export const fetchActiveHufiCampaigns = async ({
  limit = HUFI_CAMPAIGN_LIST_LIMIT,
  chainId = HUFI_POLYGON_CHAIN_ID,
}: {
  limit?: number;
  chainId?: number;
} = {}): Promise<HufiCampaignListResponse> =>
  launcherFetch<HufiCampaignListResponse>(`/campaigns?chain_id=${chainId}&status=active&limit=${limit}`);

export const fetchHufiCampaignDetail = async (
  chainId: number,
  address: string
): Promise<HufiCampaign> =>
  launcherFetch<HufiCampaign>(`/campaigns/${chainId}-${address}`);

export const fetchHufiCampaignStats = async (
  chainId = HUFI_POLYGON_CHAIN_ID
): Promise<HufiCampaignStats> =>
  launcherFetch<HufiCampaignStats>(`/stats/campaigns?chain_id=${chainId}`);

export const fetchHufiTotalVolumeStats = async (): Promise<HufiTotalVolumeStats> =>
  reportingFetch<HufiTotalVolumeStats>('/stats/total-volume');

export const hufiCampaignDetailPath = (campaign: Pick<HufiCampaign, 'chain_id' | 'address'>): string =>
  `/app/market/campaign/${campaign.chain_id}/${campaign.address}`;

export const shortenLauncherAddress = (address: string | null | undefined): string =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not provided';

export const formatLauncherType = (type: string | null | undefined): string =>
  type
    ? type
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    : 'Campaign';

export const formatLauncherStatus = (status: string | null | undefined): string =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unknown';

export const formatLauncherExchange = (exchange: string | null | undefined): string => {
  if (!exchange) return 'Unknown exchange';
  const exchangeNames: Record<string, string> = {
    bigone: 'BigONE',
    bitmart: 'BitMart',
    bybit: 'Bybit',
    gate: 'Gate.io',
    htx: 'HTX',
    hyperliquid: 'Hyperliquid',
    mexc: 'MEXC',
    pancakeswap: 'PancakeSwap',
    xt: 'XT',
  };
  return exchangeNames[exchange.toLowerCase()] || exchange.charAt(0).toUpperCase() + exchange.slice(1);
};

export const formatLauncherAmount = (
  amount: string | number | null | undefined,
  decimals: number | null | undefined,
  symbol: string | null | undefined
): string => {
  const raw = new BigNumber(amount ?? 0);
  const normalized = raw.dividedBy(new BigNumber(10).pow(decimals ?? 0));
  const formatted = normalized.isFinite()
    ? normalized.toFormat(Math.min(Math.max(normalized.decimalPlaces() ?? 0, 0), 6))
    : '0';
  return `${formatted} ${symbol || ''}`.trim();
};

export const formatUsd = (amount: number | null | undefined): string =>
  typeof amount === 'number' && Number.isFinite(amount)
    ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : 'Not reported';

export const formatLauncherDate = (value: string | null | undefined): string => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatLauncherDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatLauncherTarget = (campaign: Pick<HufiCampaign, 'type' | 'details' | 'fund_token_symbol' | 'symbol'>): string => {
  if (campaign.type === 'MARKET_MAKING' && campaign.details?.daily_volume_target) {
    return `${campaign.details.daily_volume_target.toLocaleString()} ${campaign.fund_token_symbol} daily volume`;
  }
  if (campaign.type === 'THRESHOLD' && campaign.details?.minimum_balance_target) {
    return `${campaign.details.minimum_balance_target.toLocaleString()} ${campaign.symbol} minimum balance`;
  }
  if (campaign.type === 'HOLDING' && campaign.details?.daily_balance_target) {
    return `${campaign.details.daily_balance_target.toLocaleString()} ${campaign.symbol} daily balance`;
  }
  return 'Target not reported';
};

export const launcherFundUsagePercent = (campaign: Pick<HufiCampaign, 'fund_amount' | 'balance'>): number => {
  const funded = new BigNumber(campaign.fund_amount || 0);
  const balance = new BigNumber(campaign.balance || 0);
  if (!funded.isFinite() || funded.lte(0)) return 0;
  return BigNumber.maximum(0, BigNumber.minimum(100, funded.minus(balance).dividedBy(funded).times(100))).toNumber();
};

export const launcherAmountPaid = (campaign: HufiCampaign): string =>
  formatLauncherAmount(
    campaign.amount_paid ?? new BigNumber(campaign.fund_amount || 0).minus(campaign.balance || 0).toFixed(0),
    campaign.fund_token_decimals,
    campaign.fund_token_symbol
  );

export const launcherTotalOracleFeePercent = (campaign: HufiCampaign): number =>
  (campaign.exchange_oracle_fee_percent ?? 0) +
  (campaign.recording_oracle_fee_percent ?? 0) +
  (campaign.reputation_oracle_fee_percent ?? 0);
