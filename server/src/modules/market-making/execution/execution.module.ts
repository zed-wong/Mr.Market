import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';

import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';
import { FillRoutingService } from './fill-routing.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ExchangeOrderMapping])],
  providers: [
    ExchangeConnectorAdapterService,
    ExchangeOrderMappingService,
    FillRoutingService,
    ExecutorRegistry,
  ],
  exports: [
    ExchangeConnectorAdapterService,
    ExchangeOrderMappingService,
    FillRoutingService,
    ExecutorRegistry,
  ],
})
export class ExecutionModule {}
