import { UserStreamEvent } from './user-stream-event.types';

export interface UserStreamEventNormalizer {
  normalizeOrder(
    exchange: string,
    accountLabel: string,
    raw: unknown,
    receivedAt: string,
  ): UserStreamEvent | null;

  normalizeTrade(
    exchange: string,
    accountLabel: string,
    raw: unknown,
    receivedAt: string,
  ): UserStreamEvent | null;

  normalizeBalance(
    exchange: string,
    accountLabel: string,
    raw: unknown,
    receivedAt: string,
  ): UserStreamEvent[];
}
