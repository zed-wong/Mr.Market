import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumerReceipt } from 'src/common/entities/consumer-receipt.entity';
import { OutboxEvent } from 'src/common/entities/outbox-event.entity';
import { DurabilityService } from './durability.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, ConsumerReceipt])],
  providers: [DurabilityService],
  exports: [DurabilityService],
})
export class DurabilityModule {}
