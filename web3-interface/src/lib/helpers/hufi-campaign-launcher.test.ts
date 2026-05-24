import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HUFI_POLYGON_CHAIN_ID,
  HufiLauncherError,
  fetchActiveHufiCampaigns,
  fetchHufiCampaignDetail,
  formatLauncherAmount,
  formatLauncherDate,
  formatLauncherTarget,
  hufiCampaignDetailPath,
  hufiCampaignLauncherBaseUrl,
} from './hufi-campaign-launcher';

const sampleCampaign = {
  chain_id: 137,
  address: '0xBeA2a48CEdE2B7A78657811F0577e588a81a74Dd',
  type: 'MARKET_MAKING',
  exchange_name: 'mexc',
  symbol: 'ETH/USDT',
  details: {
    daily_volume_target: 12500,
  },
  start_date: '2026-05-20T00:00:00.000Z',
  end_date: '2026-06-20T00:00:00.000Z',
  fund_amount: '250000000',
  fund_token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  fund_token_symbol: 'USDC',
  fund_token_decimals: 6,
  status: 'active',
  escrow_status: 'approved',
  amount_paid: '12000000',
  daily_paid_amounts: [],
  launcher: '0x1111111111111111111111111111111111111111',
  exchange_oracle: '0x2222222222222222222222222222222222222222',
  recording_oracle: '0x3333333333333333333333333333333333333333',
  reputation_oracle: '0x4444444444444444444444444444444444444444',
  balance: '238000000',
  reserved_funds: '3000000',
  exchange_oracle_fee_percent: 1,
  recording_oracle_fee_percent: 2,
  reputation_oracle_fee_percent: 3,
  intermediate_results_url: null,
  final_results_url: null,
};

describe('HuFi Campaign Launcher helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the public launcher fallback and Polygon campaign context', () => {
    expect(HUFI_POLYGON_CHAIN_ID).toBe(137);
    expect(hufiCampaignLauncherBaseUrl()).toBe('https://cl.hu.finance');
    expect(hufiCampaignDetailPath(sampleCampaign)).toBe(
      '/market/campaign/137/0xBeA2a48CEdE2B7A78657811F0577e588a81a74Dd'
    );
  });

  it('loads active Polygon campaigns from the launcher list endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ has_more: false, results: [sampleCampaign] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchActiveHufiCampaigns({ limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cl.hu.finance/campaigns?chain_id=137&status=active&limit=25'
    );
    expect(response.results).toEqual([sampleCampaign]);
  });

  it('loads detail by chain id and contract address', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCampaign,
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchHufiCampaignDetail(137, sampleCampaign.address);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cl.hu.finance/campaigns/137-0xBeA2a48CEdE2B7A78657811F0577e588a81a74Dd'
    );
    expect(response.symbol).toBe('ETH/USDT');
  });

  it('throws a typed launcher error instead of returning misleading mock content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchActiveHufiCampaigns()).rejects.toMatchObject({
      name: 'HufiLauncherError',
      status: 503,
    });
    await expect(fetchActiveHufiCampaigns()).rejects.toBeInstanceOf(HufiLauncherError);
  });

  it('formats launcher amounts, dates, and campaign targets for display', () => {
    expect(formatLauncherAmount('250000000', 6, 'USDC')).toBe('250 USDC');
    expect(formatLauncherAmount('1234567', 6, 'USDC')).toBe('1.234567 USDC');
    expect(formatLauncherDate('2026-05-20T00:00:00.000Z')).toBe('May 20, 2026');
    expect(formatLauncherTarget(sampleCampaign)).toBe('12,500 USDC daily volume');
  });
});
