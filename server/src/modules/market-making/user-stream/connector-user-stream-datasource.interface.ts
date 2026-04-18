import { UserStreamEvent } from './user-stream-event.types';

export type UserStreamCapability =
  | 'watchOrders'
  | 'watchMyTrades'
  | 'watchBalance';

export type ConnectorCapabilityTier = 'full' | 'partial' | 'rest_only';

export interface ConnectorUserStreamDataSource {
  listen(
    exchange: string,
    accountLabel: string,
    onEvent: (event: UserStreamEvent) => void,
  ): void;

  stop(exchange: string, accountLabel: string): void;

  isActive(exchange: string, accountLabel: string): boolean;

  getCapabilities(exchange: string): UserStreamCapability[];

  getCapabilityTier(exchange: string): ConnectorCapabilityTier;
}
