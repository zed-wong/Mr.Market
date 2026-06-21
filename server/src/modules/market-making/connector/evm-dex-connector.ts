import { Injectable } from '@nestjs/common';

import { TokenRegistryService } from '../token-registry/token-registry.service';
import { TradingAccountService } from '../trading-account/trading-account.service';
import type { StrategyOrderIntent } from '../strategy/config/strategy-intent.types';
import { EvmDexAdapterRegistry } from './adapters/evm-dex-adapter-registry';
import {
  Connector,
  ConnectorActionResult,
  ConnectorCapability,
  ConnectorState,
  ExchangeType,
} from './connector.types';

@Injectable()
export class EvmDexConnector implements Connector {
  readonly connectorId = 'evm-dex';
  readonly exchangeType: ExchangeType = 'amm';

  constructor(
    private readonly evmDexAdapterRegistry: EvmDexAdapterRegistry,
    private readonly tradingAccountService: TradingAccountService,
    private readonly tokenRegistryService: TokenRegistryService,
  ) {}

  get capabilities(): ConnectorCapability {
    return {
      connectorId: this.connectorId,
      exchangeType: this.exchangeType,
      settlementDomain: 'evm_chain',
      supportedIntentTypes: [
        'EXECUTE_AMM_SWAP',
        'ADD_LIQUIDITY',
        'REMOVE_LIQUIDITY',
        'COLLECT_FEES',
      ],
      supportsOpenOrders: false,
      supportsAtomicSwap: true,
      supportsLpPositions: true,
      requiresOnchainConfirmations: true,
      supportedChainIds: [1, 56, 137],
    };
  }

  async submitAction(
    intent: StrategyOrderIntent,
  ): Promise<ConnectorActionResult> {
    const metadata = this.readMetadata(intent);
    const connectorId = this.readConnectorId(intent);
    const chainId = this.readChainId(metadata);

    this.evmDexAdapterRegistry.get(connectorId);

    if (metadata.tradingAccountId) {
      await this.tradingAccountService.getSigner(
        String(metadata.tradingAccountId),
        chainId,
      );
    }

    if (metadata.tokenIn) {
      await this.tokenRegistryService.resolveAssetId(
        chainId,
        String(metadata.tokenIn),
      );
    }
    if (metadata.tokenOut) {
      await this.tokenRegistryService.resolveAssetId(
        chainId,
        String(metadata.tokenOut),
      );
    }

    return {
      status: 'not_supported',
      details: {
        reason: 'evm_execution_lifecycle_not_implemented_until_phase_4',
        connectorId,
        chainId,
        intentType: intent.type,
      },
    };
  }

  async cancelAction(
    intent: StrategyOrderIntent,
  ): Promise<ConnectorActionResult> {
    return {
      status: 'not_supported',
      details: {
        reason: 'on_chain_tx_cannot_be_cancelled',
        connectorId: this.readConnectorId(intent),
        intentType: intent.type,
      },
    };
  }

  async queryState(intent: StrategyOrderIntent): Promise<ConnectorState> {
    return {
      status: 'no_execution',
      details: {
        reason: 'evm_execution_lifecycle_not_implemented_until_phase_4',
        connectorId: this.readConnectorId(intent),
      },
    };
  }

  private readMetadata(intent: StrategyOrderIntent): Record<string, unknown> {
    return intent.metadata && typeof intent.metadata === 'object'
      ? intent.metadata
      : {};
  }

  private readConnectorId(intent: StrategyOrderIntent): 'uniswapV3' | 'pancakeV3' {
    const connectorId = intent.connectorId || intent.exchange;

    if (connectorId === 'uniswapV3' || connectorId === 'pancakeV3') {
      return connectorId;
    }

    throw new Error(`Unsupported EVM DEX connectorId ${connectorId}`);
  }

  private readChainId(metadata: Record<string, unknown>): number {
    const chainId = Number(metadata.chainId || 0);

    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('EVM DEX intent metadata missing positive chainId');
    }

    return chainId;
  }
}
