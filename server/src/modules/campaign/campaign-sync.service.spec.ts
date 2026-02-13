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
});
