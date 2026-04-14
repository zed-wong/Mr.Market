/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserStreamCapabilityService } from './user-stream-capability.service';

describe('UserStreamCapabilityService', () => {
  it('classifies full-capability exchanges', () => {
    const service = new UserStreamCapabilityService({
      getExchange: jest.fn().mockReturnValue({
        watchOrders: jest.fn(),
        watchMyTrades: jest.fn(),
        watchBalance: jest.fn(),
      }),
    } as any);

    expect(service.getCapabilities('binance', 'maker')).toEqual({
      watchOrders: true,
      watchMyTrades: true,
      watchBalance: true,
      tier: 'full',
    });
  });

  it('classifies rest-only exchanges', () => {
    const service = new UserStreamCapabilityService({
      getExchange: jest.fn().mockReturnValue({}),
    } as any);

    expect(service.getCapabilities('binance')).toEqual({
      watchOrders: false,
      watchMyTrades: false,
      watchBalance: false,
      tier: 'rest_only',
    });
  });
});
