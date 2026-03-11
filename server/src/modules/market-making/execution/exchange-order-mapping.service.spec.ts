/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';

describe('ExchangeOrderMappingService', () => {
  const repository = {
    countBy: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: 'mapping-1',
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      ...value,
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapping count for an order id', async () => {
    repository.countBy.mockResolvedValue(2);
    const service = new ExchangeOrderMappingService(repository as any);

    await expect(service.countMappingsForOrder('order-1')).resolves.toBe(2);
    expect(repository.countBy).toHaveBeenCalledWith({ orderId: 'order-1' });
  });

  it('reuses existing mapping for the same clientOrderId', async () => {
    const existing = {
      id: 'mapping-existing',
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'order-1:0',
    };
    repository.findOneBy.mockResolvedValue(existing);
    const service = new ExchangeOrderMappingService(repository as any);

    await expect(
      service.createMapping({
        orderId: 'order-1',
        exchangeOrderId: 'ex-2',
        clientOrderId: 'order-1:0',
      }),
    ).resolves.toBe(existing);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('creates a new mapping when clientOrderId is not reserved yet', async () => {
    repository.findOneBy.mockResolvedValue(null);
    const service = new ExchangeOrderMappingService(repository as any);

    await expect(
      service.createMapping({
        orderId: 'order-1',
        exchangeOrderId: 'ex-1',
        clientOrderId: 'order-1:0',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        exchangeOrderId: 'ex-1',
        clientOrderId: 'order-1:0',
      }),
    );
    expect(repository.create).toHaveBeenCalledWith({
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'order-1:0',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('looks up mappings by clientOrderId and exchangeOrderId', async () => {
    const service = new ExchangeOrderMappingService(repository as any);

    repository.findOneBy.mockResolvedValueOnce({
      orderId: 'order-1',
      clientOrderId: 'order-1:0',
    });
    repository.findOneBy.mockResolvedValueOnce({
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
    });

    await expect(service.findByClientOrderId('order-1:0')).resolves.toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        clientOrderId: 'order-1:0',
      }),
    );
    await expect(service.findByExchangeOrderId('ex-1')).resolves.toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        exchangeOrderId: 'ex-1',
      }),
    );
  });
});
