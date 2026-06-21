import { Injectable } from '@nestjs/common';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import type { StrategyOrderIntent } from '../strategy/config/strategy-intent.types';
import {
  Connector,
  ConnectorActionResult,
  ConnectorCapability,
  ConnectorState,
  ExchangeType,
} from './connector.types';

@Injectable()
export class ClobConnector implements Connector {
  readonly exchangeType: ExchangeType = 'clob';

  constructor(
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
  ) {}

  get connectorId(): string {
    return 'clob';
  }

  get capabilities(): ConnectorCapability {
    return {
      connectorId: this.connectorId,
      exchangeType: this.exchangeType,
      settlementDomain: 'exchange_account',
      supportedIntentTypes: [
        'CREATE_LIMIT_ORDER',
        'CANCEL_ORDER',
        'REPLACE_ORDER',
      ],
      supportsOpenOrders: true,
      supportsAtomicSwap: false,
      supportsLpPositions: false,
      requiresOnchainConfirmations: false,
    };
  }

  async submitAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult> {
    if (intent.type !== 'CREATE_LIMIT_ORDER') {
      return {
        status: 'not_supported',
        details: {
          reason: 'unsupported_clob_submit_intent',
          intentType: intent.type,
        },
      };
    }

    const metadata = this.readMetadata(intent);
    const clientOrderId = this.readRequiredString(
      metadata,
      'submittedClientOrderId',
    );
    const raw = (await this.exchangeConnectorAdapterService.placeLimitOrder(
      intent.exchange,
      intent.pair,
      intent.side,
      intent.qty,
      intent.price,
      clientOrderId,
      {
        postOnly: Boolean(intent.postOnly),
        timeInForce: intent.timeInForce,
      },
      intent.accountLabel,
    )) as Record<string, unknown>;

    return {
      status: this.isTerminalFailure(raw.status) ? 'failed' : 'submitted',
      exchangeOrderId:
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined,
      details: raw,
    };
  }

  async cancelAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult> {
    if (intent.type !== 'CANCEL_ORDER') {
      return {
        status: 'not_supported',
        details: {
          reason: 'unsupported_clob_cancel_intent',
          intentType: intent.type,
        },
      };
    }

    if (!intent.mixinOrderId) {
      throw new Error('CANCEL_ORDER intent missing mixinOrderId');
    }

    const raw = (await this.exchangeConnectorAdapterService.cancelOrder(
      intent.exchange,
      intent.pair,
      intent.mixinOrderId,
      intent.accountLabel,
    )) as Record<string, unknown>;

    return {
      status: this.isTerminalFailure(raw.status) ? 'failed' : 'submitted',
      exchangeOrderId:
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : intent.mixinOrderId,
      details: raw,
    };
  }

  async queryState(intent: StrategyOrderIntent): Promise<ConnectorState> {
    if (!intent.mixinOrderId) {
      return { status: 'no_exchange_order' };
    }

    const raw = (await this.exchangeConnectorAdapterService.fetchOrder(
      intent.exchange,
      intent.pair,
      intent.mixinOrderId,
      intent.accountLabel,
    )) as Record<string, unknown> | null;

    if (!raw) {
      return { status: 'missing' };
    }

    return {
      status: typeof raw.status === 'string' ? raw.status : 'unknown',
      exchangeOrderId:
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : intent.mixinOrderId,
      details: raw,
    };
  }

  private readMetadata(intent: StrategyOrderIntent): Record<string, unknown> {
    return intent.metadata && typeof intent.metadata === 'object'
      ? intent.metadata
      : {};
  }

  private readRequiredString(
    metadata: Record<string, unknown>,
    key: string,
  ): string {
    const value = metadata[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    throw new Error(`CLOB connector missing ${key}`);
  }

  private isTerminalFailure(status: unknown): boolean {
    return ['failed', 'rejected', 'expired'].includes(
      String(status || '').toLowerCase(),
    );
  }
}
