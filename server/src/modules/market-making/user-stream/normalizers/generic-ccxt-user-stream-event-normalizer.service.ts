import { Injectable } from '@nestjs/common';

import {
  UserStreamOrderEvent,
  UserStreamTradeEvent,
} from '../user-stream-event.types';
import { UserStreamEventNormalizer } from '../user-stream-event-normalizer.interface';

@Injectable()
export class GenericCcxtUserStreamEventNormalizerService
  implements UserStreamEventNormalizer
{
  normalizeOrder(
    exchange: string,
    accountLabel: string,
    rawPayload: unknown,
    receivedAt: string,
  ): UserStreamOrderEvent | null {
    if (
      !rawPayload ||
      typeof rawPayload !== 'object' ||
      Array.isArray(rawPayload)
    ) {
      return null;
    }

    const payload = rawPayload as Record<string, unknown>;

    return {
      exchange,
      accountLabel,
      kind: 'order',
      payload: {
        pair:
          typeof payload.symbol === 'string' && payload.symbol
            ? payload.symbol
            : undefined,
        exchangeOrderId:
          typeof payload.id === 'string' ? payload.id : undefined,
        clientOrderId: this.readClientOrderId(payload),
        side:
          payload.side === 'buy' || payload.side === 'sell'
            ? payload.side
            : undefined,
        status: typeof payload.status === 'string' ? payload.status : undefined,
        cumulativeQty:
          typeof payload.filled === 'string' ||
          typeof payload.filled === 'number'
            ? String(payload.filled)
            : undefined,
        price:
          typeof payload.price === 'string' || typeof payload.price === 'number'
            ? String(payload.price)
            : undefined,
        raw: payload,
      },
      receivedAt,
    };
  }

  normalizeTrade(
    exchange: string,
    accountLabel: string,
    rawPayload: unknown,
    receivedAt: string,
  ): UserStreamTradeEvent | null {
    if (
      !rawPayload ||
      typeof rawPayload !== 'object' ||
      Array.isArray(rawPayload)
    ) {
      return null;
    }

    const payload = rawPayload as Record<string, unknown>;
    const fee =
      payload.fee && typeof payload.fee === 'object'
        ? (payload.fee as Record<string, unknown>)
        : undefined;

    return {
      exchange,
      accountLabel,
      kind: 'trade',
      payload: {
        pair:
          typeof payload.symbol === 'string' && payload.symbol
            ? payload.symbol
            : undefined,
        exchangeOrderId:
          typeof payload.orderId === 'string'
            ? payload.orderId
            : typeof payload.order === 'string'
            ? payload.order
            : typeof payload.id === 'string'
            ? payload.id
            : undefined,
        clientOrderId: this.readClientOrderId(payload),
        fillId:
          typeof payload.tradeId === 'string'
            ? payload.tradeId
            : typeof payload.id === 'string'
            ? payload.id
            : undefined,
        side:
          payload.side === 'buy' || payload.side === 'sell'
            ? payload.side
            : undefined,
        qty:
          typeof payload.amount === 'string' ||
          typeof payload.amount === 'number'
            ? String(payload.amount)
            : typeof payload.qty === 'string' || typeof payload.qty === 'number'
            ? String(payload.qty)
            : undefined,
        cumulativeQty:
          typeof payload.filled === 'string' ||
          typeof payload.filled === 'number'
            ? String(payload.filled)
            : undefined,
        price:
          typeof payload.price === 'string' || typeof payload.price === 'number'
            ? String(payload.price)
            : undefined,
        feeAmount:
          typeof fee?.cost === 'string' || typeof fee?.cost === 'number'
            ? String(fee.cost)
            : undefined,
        feeAsset:
          typeof fee?.currency === 'string' && fee.currency
            ? fee.currency
            : undefined,
        raw: payload,
      },
      receivedAt,
    };
  }

  private readClientOrderId(
    payload: Record<string, unknown>,
  ): string | undefined {
    return (
      this.readNonEmptyString(payload.clientOrderId) ||
      this.readNonEmptyString(payload.clientOid) ||
      this.readNonEmptyString(payload.cloid) ||
      this.readNestedInfoClientOrderId(payload)
    );
  }

  private readNestedInfoClientOrderId(
    payload: Record<string, unknown>,
  ): string | undefined {
    if (!payload.info || typeof payload.info !== 'object') {
      return undefined;
    }

    const info = payload.info as Record<string, unknown>;

    return (
      this.readNonEmptyString(info.clientOrderId) ||
      this.readNonEmptyString(info.clientOid) ||
      this.readNonEmptyString(info.cloid)
    );
  }

  private readNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
