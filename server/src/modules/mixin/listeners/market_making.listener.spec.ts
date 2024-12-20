import { Test, TestingModule } from '@nestjs/testing';
import { MarketMakingListener } from './market_making.listener';
import { SnapshotsService } from 'src/modules/mixin/snapshots/snapshots.service';
import { StrategyUserService } from 'src/modules/strategy/strategy-user.service';
import { SafeSnapshot } from '@mixin.dev/mixin-node-sdk';
import { GrowdataService } from 'src/modules/growdata/growdata.service';
import { DataSource } from 'typeorm';

jest.mock('src/modules/mixin/snapshots/snapshots.service');
jest.mock('src/modules/strategy/strategy-user.service');
jest.mock('src/modules/growdata/growdata.service');

describe('MarketMakingListener', () => {
  let listener: MarketMakingListener;
  let snapshotsService: SnapshotsService;
  let strategyUserService: StrategyUserService;
  let growdataService: GrowdataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketMakingListener,
        SnapshotsService,
        StrategyUserService,
        GrowdataService,
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    listener = module.get<MarketMakingListener>(MarketMakingListener);
    snapshotsService = module.get<SnapshotsService>(SnapshotsService);
    strategyUserService = module.get<StrategyUserService>(StrategyUserService);
    growdataService = module.get<GrowdataService>(GrowdataService);
    jest.clearAllMocks();
  });

  it('should handle a snapshot matching the first asset correctly', async () => {
    const mockDetails = {
      version: 1,
      tradingType: 'Market Making',
      action: 'create',
      marketMakingPairId: 'b0177350-ae29-43ec-a26e-d46f821e416e',
      orderId: '1043e42c-dd12-4260-a443-d1896b64eae4',
      rewardAddress: '0x0000000000000000000000000000000000000000',
    };

    const mockSnapshot: SafeSnapshot = {
      asset_id: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa',
      amount: '100',
      snapshot_id: 'e82afdfb-6239-4530-8a45-d86294750da6',
      opponent_id: '9f771b3d-15c0-42e1-ae05-bcdc1c5c54f3',
      type: 'transaction',
      created_at: '2024-04-09T15:34:37Z',
      trace_id: '1043e42c-dd12-4260-a443-d1896b64eae4',
      user_id: '1a02b381-2323-4814-b572-1e24ebcbe922',
      memo: 'xxx',
      transaction_hash: 'tx',
      confirmations: null,
      opening_balance: null,
      closing_balance: null,
      deposit: null,
      withdrawal: null,
    };

    strategyUserService.findPaymentStateByIdRaw = jest
      .fn()
      .mockResolvedValue(null);
    growdataService.getMarketMakingPairById = jest.fn().mockResolvedValue({
      base_asset_id: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa',
      target_asset_id: 'another-asset-id',
      symbol: 'BTC/USDT',
      exchange_id: 'exchangeA',
    });
    strategyUserService.createPaymentState = jest.fn().mockResolvedValue({});

    await listener.handleMarketMakingCreate(mockDetails, mockSnapshot);

    expect(growdataService.getMarketMakingPairById).toHaveBeenCalledWith(
      mockDetails.marketMakingPairId,
    );
    expect(strategyUserService.findPaymentStateByIdRaw).toHaveBeenCalledWith(
      mockDetails.orderId,
    );
    expect(strategyUserService.createPaymentState).toHaveBeenCalledWith(
      expect.anything(),
    );
  });

  it('should refund if the snapshot asset does not match either base or target asset IDs', async () => {
    const mockDetails = {
      version: 1,
      tradingType: 'Market Making',
      action: 'create',
      marketMakingPairId: 'b0177350-ae29-43ec-a26e-d46f821e416e',
      orderId: '1043e42c-dd12-4260-a443-d1896b64eae4',
      rewardAddress: '0x0000000000000000000000000000000000000000',
    };

    const mockSnapshot: SafeSnapshot = {
      asset_id: 'b91e18ff-a9ae-3dc7-8679-e935d9a4b34b',
      amount: '100',
      snapshot_id: 'e82afdfb-6239-4530-8a45-d86294750dc3',
      opponent_id: '9f771b3d-15c0-42e1-ae05-bcdc1c5c54f3',
      type: 'transaction',
      created_at: '2024-04-09T15:34:37Z',
      trace_id: '1043e42c-dd12-4260-a443-d1896b64eae4',
      user_id: '1a02b381-2323-4814-b572-1e24ebcbe922',
      memo: 'xxx',
      transaction_hash: 'tx',
      confirmations: null,
      opening_balance: null,
      closing_balance: null,
      deposit: null,
      withdrawal: null,
    };

    growdataService.getMarketMakingPairById = jest.fn().mockResolvedValue({
      base_asset_id: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa',
      target_asset_id: 'another-asset-id',
    });
    snapshotsService.refund = jest.fn().mockResolvedValue({});

    await listener.handleMarketMakingCreate(mockDetails, mockSnapshot);

    expect(snapshotsService.refund).toHaveBeenCalledWith(mockSnapshot);
  });
});
