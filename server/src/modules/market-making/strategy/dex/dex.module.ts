import { forwardRef, Module } from '@nestjs/common';

import { ConnectorModule } from '../../connector/connector.module';
import { Web3Module } from '../../../web3/web3.module';
import { DexVolumeStrategyService } from './dex-volume.strategy.service';

@Module({
  imports: [forwardRef(() => Web3Module), ConnectorModule],
  providers: [DexVolumeStrategyService],
  exports: [DexVolumeStrategyService],
})
export class DexModule {}
