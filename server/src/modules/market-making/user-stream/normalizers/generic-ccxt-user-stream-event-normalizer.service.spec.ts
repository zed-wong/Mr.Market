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
});
