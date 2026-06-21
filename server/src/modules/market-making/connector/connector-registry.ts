import { Injectable } from '@nestjs/common';

import { Connector } from './connector.types';
import { ClobConnector } from './clob-connector';
import { EvmDexConnector } from './evm-dex-connector';

@Injectable()
export class ConnectorRegistry {
  constructor(
    private readonly clobConnector: ClobConnector,
    private readonly evmDexConnector: EvmDexConnector,
  ) {}

  resolve(connectorId: string): Connector {
    const normalizedConnectorId = String(connectorId || '')
      .trim()
      .toLowerCase();

    if (!normalizedConnectorId) {
      throw new Error('connectorId is required');
    }

    if (this.isClobConnector(normalizedConnectorId)) {
      return this.clobConnector;
    }

    if (this.isEvmDexConnector(normalizedConnectorId)) {
      return this.evmDexConnector;
    }

    throw new Error(`Unsupported connectorId ${connectorId}`);
  }

  private isClobConnector(connectorId: string): boolean {
    return ['clob', 'binance', 'mexc', 'hyperliquid'].includes(connectorId);
  }

  private isEvmDexConnector(connectorId: string): boolean {
    return ['uniswapv3', 'pancakev3'].includes(connectorId);
  }
}
