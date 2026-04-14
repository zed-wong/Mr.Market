export type UserStreamBalanceEvent = {
  kind: 'balance';
  exchange: string;
  accountLabel: string;
  receivedAt: string;
  payload: {
    asset: string;
    free?: string;
    used?: string;
    total?: string;
    source: 'ws' | 'rest';
  };
};

export type UserStreamOrderEvent = {
  kind: 'order';
  exchange: string;
  accountLabel: string;
  receivedAt: string;
  payload: {
    pair?: string;
    exchangeOrderId?: string;
    clientOrderId?: string;
    side?: 'buy' | 'sell';
    status?: string;
    cumulativeQty?: string;
    price?: string;
    raw: Record<string, unknown>;
  };
};

export type UserStreamTradeEvent = {
  kind: 'trade';
  exchange: string;
  accountLabel: string;
  receivedAt: string;
  payload: {
    pair?: string;
    exchangeOrderId?: string;
    clientOrderId?: string;
    fillId?: string;
    side?: 'buy' | 'sell';
    qty?: string;
    cumulativeQty?: string;
    price?: string;
    raw: Record<string, unknown>;
  };
};

export type UserStreamEvent =
  | UserStreamBalanceEvent
  | UserStreamOrderEvent
  | UserStreamTradeEvent;
