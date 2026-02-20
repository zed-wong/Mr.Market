import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumerReceipt } from 'src/common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from 'src/common/entities/system/outbox-event.entity';

import { DurabilityService } from './durability.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, ConsumerReceipt])],
  providers: [DurabilityService],
  exports: [DurabilityService],
})
export class DurabilityModule {}
