import { Module } from '@nestjs/common';

import { MixinClientModule } from '../client/mixin-client.module';
import { TransactionService } from './transaction.service';

@Module({
  imports: [MixinClientModule],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
