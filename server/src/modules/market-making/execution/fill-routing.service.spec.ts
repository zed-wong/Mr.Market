import { FillRoutingService } from './fill-routing.service';

describe('FillRoutingService', () => {
  it('resolves order directly from parseable clientOrderId', async () => {
    const service = new FillRoutingService({
      findByClientOrderId: jest.fn(),
    } as any);

    await expect(
      service.resolveOrderFromClientOrderId('order-1:3'),
    ).resolves.toEqual({
      orderId: 'order-1',
      seq: 3,
      source: 'clientOrderId',
    });
  });

  it('falls back to persisted mapping when clientOrderId format is legacy', async () => {
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue({
        orderId: 'legacy-order',
      }),
      findByExchangeOrderId: jest.fn(),
    };
    const service = new FillRoutingService(exchangeOrderMappingService as any);

    await expect(
      service.resolveOrderFromClientOrderId('legacy-client-oid'),
    ).resolves.toEqual({
      orderId: 'legacy-order',
      source: 'mapping',
    });
    expect(
      exchangeOrderMappingService.findByClientOrderId,
    ).toHaveBeenCalledWith('legacy-client-oid');
  });

  it('returns null when clientOrderId cannot be resolved', async () => {
    const service = new FillRoutingService({
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(
      service.resolveOrderFromClientOrderId('legacy-client-oid'),
    ).resolves.toBeNull();
    await expect(
      service.resolveOrderFromClientOrderId(undefined),
    ).resolves.toBeNull();
  });

  it('falls back to exchangeOrderId mapping when clientOrderId is absent or unresolved', async () => {
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue({
        orderId: 'mapped-by-exchange-order',
      }),
    };
    const service = new FillRoutingService(exchangeOrderMappingService as any);

    await expect(
      service.resolveOrderForFill({
        clientOrderId: 'legacy-client-oid',
        exchangeOrderId: 'ex-1',
      }),
    ).resolves.toEqual({
      orderId: 'mapped-by-exchange-order',
      source: 'exchangeOrderMapping',
    });
    await expect(
      service.resolveOrderForFill({
        exchangeOrderId: 'ex-1',
      }),
    ).resolves.toEqual({
      orderId: 'mapped-by-exchange-order',
      source: 'exchangeOrderMapping',
    });
  });
});
