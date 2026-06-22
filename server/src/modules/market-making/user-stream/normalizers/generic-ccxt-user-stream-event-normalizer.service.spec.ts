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

  it('normalizes Hyperliquid trade fees into fill fee fields', () => {
    const service = new GenericCcxtUserStreamEventNormalizerService();

    const event = service.normalizeTrade(
      'hyperliquid',
      'hl-wallet-1',
      {
        symbol: 'BTC/USDC',
        order: 'hl-ex-1',
        id: 'hl-fill-1',
        side: 'sell',
        amount: '0.25',
        price: '100',
        fee: {
          cost: '0.0125',
          currency: 'USDC',
        },
      },
      '2026-04-18T10:28:55.000Z',
    );

    expect(event).toEqual(
      expect.objectContaining({
        exchange: 'hyperliquid',
        accountLabel: 'hl-wallet-1',
        payload: expect.objectContaining({
          exchangeOrderId: 'hl-ex-1',
          fillId: 'hl-fill-1',
          feeAmount: '0.0125',
          feeAsset: 'USDC',
        }),
      }),
    );
  });
});
