import { Module } from '@nestjs/common';

import { ExecutionModule } from '../execution/execution.module';
import { EvmDexAdapterRegistry } from './adapters/evm-dex-adapter-registry';
import { PancakeV3Adapter } from './adapters/pancake-v3.adapter';
import { UniswapV3Adapter } from './adapters/uniswap-v3.adapter';
import { ClobConnector } from './clob-connector';
import { ConnectorRegistry } from './connector-registry';

@Module({
  imports: [ExecutionModule],
  providers: [
    ClobConnector,
    ConnectorRegistry,
    EvmDexAdapterRegistry,
    UniswapV3Adapter,
    PancakeV3Adapter,
  ],
  exports: [
    ClobConnector,
    ConnectorRegistry,
    EvmDexAdapterRegistry,
    UniswapV3Adapter,
    PancakeV3Adapter,
  ],
})
export class ConnectorModule {}
