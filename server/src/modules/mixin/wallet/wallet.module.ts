import { Module } from '@nestjs/common';

import { MixinClientModule } from '../client/mixin-client.module';
import { WalletService } from './wallet.service';

@Module({
  imports: [MixinClientModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
