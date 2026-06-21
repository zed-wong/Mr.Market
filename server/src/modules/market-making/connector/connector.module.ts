import { Module } from '@nestjs/common';

import { EvmExecutionModule } from '../evm-execution/evm-execution.module';
import { ExecutionModule } from '../execution/execution.module';
import { TokenRegistryModule } from '../token-registry/token-registry.module';
import { TradingAccountModule } from '../trading-account/trading-account.module';
import { EvmDexAdapterRegistry } from './adapters/evm-dex-adapter-registry';
import { PancakeV3Adapter } from './adapters/pancake-v3.adapter';
import { UniswapV3Adapter } from './adapters/uniswap-v3.adapter';
import { ClobConnector } from './clob-connector';
import { ConnectorRegistry } from './connector-registry';
import { EvmDexConnector } from './evm-dex-connector';

@Module({
  imports: [
    ExecutionModule,
    TradingAccountModule,
    TokenRegistryModule,
    EvmExecutionModule,
  ],
  providers: [
    ClobConnector,
    EvmDexConnector,
    ConnectorRegistry,
    EvmDexAdapterRegistry,
    UniswapV3Adapter,
    PancakeV3Adapter,
  ],
  exports: [
    ClobConnector,
    EvmDexConnector,
    ConnectorRegistry,
    EvmDexAdapterRegistry,
    UniswapV3Adapter,
    PancakeV3Adapter,
    TradingAccountModule,
    TokenRegistryModule,
    EvmExecutionModule,
  ],
})
export class ConnectorModule {}
