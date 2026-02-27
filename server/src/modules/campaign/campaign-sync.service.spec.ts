/* eslint-disable @typescript-eslint/no-explicit-any */
import { CampaignSyncService } from './campaign-sync.service';

describe('CampaignSyncService', () => {
  it('upserts remote campaigns into canonical table', async () => {
    const rows: any[] = [];
    const campaignRepository = {
      findOneBy: jest.fn(async ({ address, chainId }) => {
        return (
          rows.find((r) => r.address === address && r.chainId === chainId) ||
          null
        );
      }),
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        const index = rows.findIndex(
          (r) => r.address === payload.address && r.chainId === payload.chainId,
        );

        if (index >= 0) {
          rows[index] = { ...rows[index], ...payload };

          return rows[index];
        }
        rows.push(payload);

        return payload;
      }),
    };
    const campaignService = {
      getCampaigns: jest.fn().mockResolvedValue([
        {
          address: '0xabc',
          chainId: 1,
          symbol: 'BTC/USDT',
          exchangeName: 'binance',
          token: 'HFT',
          totalFundedAmount: '10',
          type: 'liquidity',
          status: 'Running',
          startBlock: 1,
          endBlock: 2,
        },
      ]),
    };

    const service = new CampaignSyncService(
      campaignService as any,
      campaignRepository as any,
    );

    const synced = await service.syncCampaigns();

    expect(synced).toBe(1);
    expect(rows[0].status).toBe('active');
  });

  it('skips invalid campaigns and normalizes invalid numeric fields', async () => {
    const rows: any[] = [];
    const campaignRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('db error')),
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        rows.push(payload);

        return payload;
      }),
    };
    const campaignService = {
      getCampaigns: jest.fn().mockResolvedValue([
        {
          address: '0xgood',
          chainId: 1,
          symbol: 'BTC/USDT',
          exchangeName: 'binance',
          token: 'HFT',
          totalFundedAmount: 'not-a-number',
          type: 'liquidity',
          status: 'running',
          startBlock: 'nan',
          endBlock: undefined,
        },
        {
          address: '0xbad',
          chainId: 1,
          symbol: 'ETH/USDT',
          exchangeName: 'mexc',
          token: 'HFT',
          totalFundedAmount: '10',
          type: 'liquidity',
          status: 'running',
          startBlock: 1,
          endBlock: 2,
        },
      ]),
    };

    const service = new CampaignSyncService(
      campaignService as any,
      campaignRepository as any,
    );

    const synced = await service.syncCampaigns();

    expect(synced).toBe(1);
    expect(Number.isNaN(rows[0].startTime.getTime())).toBe(false);
    expect(Number.isNaN(rows[0].endTime.getTime())).toBe(false);
    expect(rows[0].totalReward).toBe(0);
  });
});
