import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { Repository } from 'typeorm';

import type {
  StrategyControllerFacade,
} from '../config/strategy-controller.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import { VolumeStrategyController } from './volume-strategy.controller';

@Injectable()
export class AmmVolumeStrategyController extends VolumeStrategyController {
  override readonly strategyType = 'ammVolume' as const;

  constructor(
    @Optional()
    @InjectRepository(StrategyInstance)
    strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    strategyIntentStoreService?: StrategyIntentStoreService,
  ) {
    super(
      strategyInstanceRepository,
      strategySessionRegistryService,
      strategyMarketDataProviderService,
      strategyIntentStoreService,
    );
  }

  override async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await super.start(
      {
        ...config,
        executionCategory: 'amm',
        executionVenue: 'dex',
      },
      service,
    );
  }
}
