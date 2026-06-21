import type { StrategyOrderIntent } from '../strategy/config/strategy-intent.types';

export type ExchangeType = 'clob' | 'amm' | 'clmm' | 'clob_dex';

export type SettlementDomain = 'exchange_account' | 'evm_chain';

export type ConnectorCapability = {
  connectorId: string;
  exchangeType: ExchangeType;
  settlementDomain: SettlementDomain;
  supportedIntentTypes: string[];
  supportsOpenOrders: boolean;
  supportsAtomicSwap: boolean;
  supportsLpPositions: boolean;
  requiresOnchainConfirmations: boolean;
  supportedChainIds?: number[];
};

export type ConnectorActionResult = {
  status: 'submitted' | 'confirmed' | 'failed' | 'not_supported';
  exchangeOrderId?: string;
  txHash?: string;
  evmExecutionId?: string;
  details?: Record<string, unknown>;
};

export type ConnectorState = {
  status: string;
  exchangeOrderId?: string;
  txHash?: string;
  evmExecutionId?: string;
  details?: Record<string, unknown>;
};

export interface Connector {
  readonly connectorId: string;
  readonly exchangeType: ExchangeType;
  readonly capabilities: ConnectorCapability;

  submitAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult>;
  cancelAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult>;
  queryState(intent: StrategyOrderIntent): Promise<ConnectorState>;
}
