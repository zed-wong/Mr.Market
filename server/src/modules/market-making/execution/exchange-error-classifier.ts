import * as ccxt from 'ccxt';

export type ExchangeErrorKind =
  | 'INSUFFICIENT_FUNDS'
  | 'ORDER_NOT_FOUND'
  | 'DUPLICATE_ORDER_ID'
  | 'ORDER_IMMEDIATELY_FILLABLE'
  | 'ORDER_NOT_FILLABLE'
  | 'INVALID_ORDER'
  | 'RATE_LIMIT'
  | 'REQUEST_TIMEOUT'
  | 'NETWORK'
  | 'AUTHENTICATION'
  | 'PERMISSION_DENIED'
  | 'EXCHANGE_REJECTED'
  | 'UNKNOWN';

export type ExchangeErrorClassification = {
  kind: ExchangeErrorKind;
  recoverable: boolean;
};

export function classifyExchangeError(
  error: unknown,
): ExchangeErrorClassification {
  if (error instanceof ccxt.InsufficientFunds) {
    return { kind: 'INSUFFICIENT_FUNDS', recoverable: false };
  }
  if (error instanceof ccxt.OrderNotFound) {
    return { kind: 'ORDER_NOT_FOUND', recoverable: false };
  }
  if (error instanceof ccxt.DuplicateOrderId) {
    return { kind: 'DUPLICATE_ORDER_ID', recoverable: false };
  }
  if (error instanceof ccxt.OrderImmediatelyFillable) {
    return { kind: 'ORDER_IMMEDIATELY_FILLABLE', recoverable: false };
  }
  if (error instanceof ccxt.OrderNotFillable) {
    return { kind: 'ORDER_NOT_FILLABLE', recoverable: false };
  }
  if (error instanceof ccxt.RateLimitExceeded) {
    return { kind: 'RATE_LIMIT', recoverable: true };
  }
  if (error instanceof ccxt.RequestTimeout) {
    return { kind: 'REQUEST_TIMEOUT', recoverable: true };
  }
  if (error instanceof ccxt.AuthenticationError) {
    return { kind: 'AUTHENTICATION', recoverable: false };
  }
  if (error instanceof ccxt.PermissionDenied) {
    return { kind: 'PERMISSION_DENIED', recoverable: false };
  }
  if (error instanceof ccxt.InvalidOrder) {
    return { kind: 'INVALID_ORDER', recoverable: false };
  }
  if (error instanceof ccxt.NetworkError) {
    return { kind: 'NETWORK', recoverable: true };
  }
  if (error instanceof ccxt.ExchangeError) {
    return { kind: 'EXCHANGE_REJECTED', recoverable: false };
  }

  return { kind: 'UNKNOWN', recoverable: false };
}

export function isExchangeInsufficientFundsError(error: unknown): boolean {
  return classifyExchangeError(error).kind === 'INSUFFICIENT_FUNDS';
}

export function isAmbiguousPlacementError(error: unknown): boolean {
  const { kind } = classifyExchangeError(error);

  return (
    kind === 'NETWORK' ||
    kind === 'REQUEST_TIMEOUT' ||
    kind === 'UNKNOWN' ||
    kind === 'DUPLICATE_ORDER_ID'
  );
}

export function isExchangeOrderNotFoundError(error: unknown): boolean {
  return classifyExchangeError(error).kind === 'ORDER_NOT_FOUND';
}

export function isExchangePostOnlyReject(error: unknown): boolean {
  const kind = classifyExchangeError(error).kind;

  return kind === 'ORDER_IMMEDIATELY_FILLABLE' || kind === 'ORDER_NOT_FILLABLE';
}

export function isExchangeRateLimitError(error: unknown): boolean {
  return classifyExchangeError(error).kind === 'RATE_LIMIT';
}
