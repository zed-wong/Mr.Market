import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { Repository } from 'typeorm';

import { AdminFeeService } from './admin-fee.service';

describe('AdminFeeService', () => {
  let service: AdminFeeService;
  let customConfigRepository: jest.Mocked<
    Partial<Repository<CustomConfigEntity>>
  >;
  let spotPairRepository: jest.Mocked<Partial<Repository<SpotdataTradingPair>>>;
  let mmPairRepository: jest.Mocked<
    Partial<Repository<GrowdataMarketMakingPair>>
  >;

  beforeEach(() => {
    customConfigRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    spotPairRepository = {
      find: jest.fn(),
    };
    mmPairRepository = {
      find: jest.fn(),
    };

    service = new AdminFeeService(
      customConfigRepository as Repository<CustomConfigEntity>,
      spotPairRepository as Repository<SpotdataTradingPair>,
      mmPairRepository as Repository<GrowdataMarketMakingPair>,
    );
  });

  it('reads the earliest config instead of assuming config_id 1', async () => {
    customConfigRepository.find!.mockResolvedValue([
      {
        config_id: 0,
        spot_fee: '0.002',
        market_making_fee: '0.001',
        enable_spot_fee: true,
        enable_market_making_fee: true,
      } as CustomConfigEntity,
    ]);

    await expect(service.getGlobalFees()).resolves.toEqual({
      spot_fee: '0.002',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    });
    expect(customConfigRepository.find).toHaveBeenCalledWith({
      order: { config_id: 'ASC' },
      take: 1,
    });
  });

  it('updates the existing earliest config', async () => {
    const config = {
      config_id: 0,
      spot_fee: '0.002',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    } as CustomConfigEntity;

    customConfigRepository.find!.mockResolvedValue([config]);
    customConfigRepository.save!.mockResolvedValue({
      ...config,
      spot_fee: '0.003',
    } as CustomConfigEntity);

    await service.updateGlobalFees({
      spot_fee: '0.003',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    });

    expect(customConfigRepository.save).toHaveBeenCalledWith({
      ...config,
      spot_fee: '0.003',
    });
  });

  it('creates a config without forcing config_id 1 when none exists', async () => {
    const created = {
      config_id: 0,
      spot_fee: '0.002',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    } as CustomConfigEntity;

    customConfigRepository.find!.mockResolvedValue([]);
    customConfigRepository.create!.mockReturnValue(created);
    customConfigRepository.save!.mockResolvedValue(created);

    await service.updateGlobalFees({
      spot_fee: '0.002',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    });

    expect(customConfigRepository.create).toHaveBeenCalledWith({
      spot_fee: '0.002',
      market_making_fee: '0.001',
      enable_spot_fee: true,
      enable_market_making_fee: true,
    });
  });
});
