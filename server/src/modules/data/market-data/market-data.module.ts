import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

import { MarketDataController } from './market-data.controller';
import { MarketDataGateway } from './market-data.gateway';
import { MarketdataService } from './market-data.service';
@Module({
  imports: [CacheModule.register()],
  controllers: [MarketDataController],
  providers: [MarketDataGateway, MarketdataService],
  exports: [MarketDataGateway, MarketdataService, CacheModule],
})
export class MarketdataModule {}
