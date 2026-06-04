import { GenericCcxtUserStreamEventNormalizerService } from './generic-ccxt-user-stream-event-normalizer.service';

describe('GenericCcxtUserStreamEventNormalizerService', () => {
  it('prefers the unified CCXT trade order field over the trade id for exchangeOrderId', () => {
    const service = new GenericCcxtUserStreamEventNormalizerService();

    const event = service.normalizeTrade(
      'mexc',
      'default',
      {
        symbol: 'XIN/USDT',
        id: '674133284879245312X1',
        order: 'C02__674133284879245312059',
        side: 'sell',
        amount: '0.261',
        price: '58.45',
      },
      '2026-04-18T10:28:55.000Z',
    );

    expect(event).toEqual(
      expect.objectContaining({
        kind: 'trade',
        payload: expect.objectContaining({
          exchangeOrderId: 'C02__674133284879245312059',
          fillId: '674133284879245312X1',
          pair: 'XIN/USDT',
          qty: '0.261',
          price: '58.45',
        }),
      }),
    );
  });

  it('normalizes CCXT trade fee cost and currency', () => {
    const service = new GenericCcxtUserStreamEventNormalizerService();

    const event = service.normalizeTrade(
      'binance',
      'maker',
      {
        symbol: 'BTC/USDT',
        order: 'ex-1',
        id: 'fill-1',
        side: 'buy',
        amount: '0.5',
        price: '100',
        fee: {
          cost: '0.0005',
          currency: 'BTC',
        },
      },
      '2026-04-18T10:28:55.000Z',
    );

    expect(event?.payload).toEqual(
      expect.objectContaining({
        feeAmount: '0.0005',
        feeAsset: 'BTC',
      }),
    );
  });

  it('normalizes Hyperliquid top-level cloid as the client order id for trades', () => {
    const service = new GenericCcxtUserStreamEventNormalizerService();

    const event = service.normalizeTrade(
      'hyperliquid',
      'maker',
      {
        symbol: 'BTC/USDT',
        order: 'hl-order-1',
        id: 'fill-1',
        cloid: '0x8634de59f9b5c185d0cdddf053927df7',
        side: 'buy',
        amount: '0.5',
        price: '100',
      },
      '2026-04-18T10:28:55.000Z',
    );

    expect(event?.payload).toEqual(
      expect.objectContaining({
        exchangeOrderId: 'hl-order-1',
        clientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
    );
  });

  it('normalizes Hyperliquid nested info cloid as the client order id for orders', () => {
    const service = new GenericCcxtUserStreamEventNormalizerService();

    const event = service.normalizeOrder(
      'hyperliquid',
      'maker',
      {
        symbol: 'BTC/USDT',
        id: 'hl-order-1',
        info: {
          cloid: '0x8634de59f9b5c185d0cdddf053927df7',
        },
        side: 'sell',
        status: 'open',
      },
      '2026-04-18T10:28:55.000Z',
    );

    expect(event?.payload).toEqual(
      expect.objectContaining({
        exchangeOrderId: 'hl-order-1',
        clientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
    );
  });
});
