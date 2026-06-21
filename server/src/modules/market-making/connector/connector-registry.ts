import { Injectable } from '@nestjs/common';

import { Connector } from './connector.types';
import { ClobConnector } from './clob-connector';

@Injectable()
export class ConnectorRegistry {
  constructor(private readonly clobConnector: ClobConnector) {}

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

    throw new Error(`Unsupported connectorId ${connectorId}`);
  }

  private isClobConnector(connectorId: string): boolean {
    return ['clob', 'binance', 'mexc', 'hyperliquid'].includes(connectorId);
  }
}
