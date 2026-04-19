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
        clientOrderId:
          typeof payload.clientOrderId === 'string'
            ? payload.clientOrderId
            : typeof payload.clientOid === 'string'
            ? payload.clientOid
            : undefined,
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
        clientOrderId:
          typeof payload.clientOrderId === 'string'
            ? payload.clientOrderId
            : typeof payload.clientOid === 'string'
            ? payload.clientOid
            : undefined,
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
        raw: payload,
      },
      receivedAt,
    };
  }

}
