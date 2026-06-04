import { ExchangeOrderMappingService } from './exchange-order-mapping.service';
import { FillRoutingService } from './fill-routing.service';

describe('FillRoutingService', () => {
  const createMappingRepository = (rows: Record<string, unknown>[] = []) => ({
    countBy: jest.fn(async ({ orderId }: { orderId: string }) => {
      return rows.filter((row) => row.orderId === orderId).length;
    }),
    findOneBy: jest.fn(async (where: Record<string, unknown>) => {
      const [key, value] = Object.entries(where)[0] || [];

      return rows.find((row) => key && row[key] === value) || null;
    }),
    create: jest.fn((value) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      const existingIndex = rows.findIndex(
        (row) =>
          row.id === value.id ||
          row.clientOrderId === value.clientOrderId ||
          row.exchangeClientOrderId === value.exchangeClientOrderId,
      );
      const row = {
        id:
          existingIndex >= 0
            ? rows[existingIndex].id
            : `mapping-${rows.length + 1}`,
        createdAt:
          existingIndex >= 0
            ? rows[existingIndex].createdAt
            : new Date('2026-03-11T00:00:00.000Z'),
        ...(existingIndex >= 0 ? rows[existingIndex] : {}),
        ...value,
      };

      if (existingIndex >= 0) {
        rows[existingIndex] = row;
      } else {
        rows.push(row);
      }

      return row;
    }),
  });

  it('resolves order directly from parseable clientOrderId', async () => {
    const service = new FillRoutingService({
      findByClientOrderId: jest.fn(),
      findByExchangeClientOrderId: jest.fn(),
      findByExchangeOrderId: jest.fn(),
    } as unknown as ExchangeOrderMappingService);

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
      findByExchangeClientOrderId: jest.fn(),
      findByExchangeOrderId: jest.fn(),
    };
    const service = new FillRoutingService(
      exchangeOrderMappingService as unknown as ExchangeOrderMappingService,
    );

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
      findByExchangeClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue(null),
    } as unknown as ExchangeOrderMappingService);

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
      findByExchangeClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue({
        orderId: 'mapped-by-exchange-order',
      }),
    };
    const service = new FillRoutingService(
      exchangeOrderMappingService as unknown as ExchangeOrderMappingService,
    );

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

  it('resolves Hyperliquid encoded cloids through persisted exchange client order mappings', async () => {
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeClientOrderId: jest.fn().mockResolvedValue({
        orderId: 'hyperliquid-order',
        exchangeName: 'hyperliquid',
        clientOrderId: 'submitted-client-id',
        exchangeClientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
      findByExchangeOrderId: jest.fn(),
    };
    const service = new FillRoutingService(
      exchangeOrderMappingService as unknown as ExchangeOrderMappingService,
    );

    await expect(
      service.resolveOrderForFill({
        clientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
    ).resolves.toEqual({
      orderId: 'hyperliquid-order',
      source: 'mapping',
    });
    expect(
      exchangeOrderMappingService.findByExchangeClientOrderId,
    ).toHaveBeenCalledWith('0x8634de59f9b5c185d0cdddf053927df7');
    expect(
      exchangeOrderMappingService.findByExchangeOrderId,
    ).not.toHaveBeenCalled();
  });

  it('preserves exchange-order fallback when Hyperliquid cloid mapping is absent', async () => {
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue({
        orderId: 'fallback-order',
      }),
    };
    const service = new FillRoutingService(
      exchangeOrderMappingService as unknown as ExchangeOrderMappingService,
    );

    await expect(
      service.resolveOrderForFill({
        clientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
        exchangeOrderId: 'ex-fallback',
      }),
    ).resolves.toEqual({
      orderId: 'fallback-order',
      source: 'exchangeOrderMapping',
    });
  });

  it('routes Hyperliquid cloids from durable mapping storage after service reload', async () => {
    const rows: Record<string, unknown>[] = [];
    const repository = createMappingRepository(rows);
    const submissionMappingService = new ExchangeOrderMappingService(
      repository as any,
    );

    await submissionMappingService.reserveMapping({
      orderId: 'hyperliquid-order',
      exchangeName: 'hyperliquid',
      clientOrderId: 'submitted-client-id',
      exchangeClientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
    });
    await submissionMappingService.createMapping({
      orderId: 'hyperliquid-order',
      exchangeName: 'hyperliquid',
      exchangeOrderId: 'hl-exchange-order-1',
      clientOrderId: 'submitted-client-id',
      exchangeClientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
    });

    const reloadedMappingService = new ExchangeOrderMappingService(
      repository as any,
    );
    const reloadedRoutingService = new FillRoutingService(
      reloadedMappingService,
    );

    await expect(
      reloadedRoutingService.resolveOrderForFill({
        clientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
    ).resolves.toEqual({
      orderId: 'hyperliquid-order',
      source: 'mapping',
    });
    expect(rows).toEqual([
      expect.objectContaining({
        orderId: 'hyperliquid-order',
        exchangeName: 'hyperliquid',
        exchangeOrderId: 'hl-exchange-order-1',
        clientOrderId: 'submitted-client-id',
        exchangeClientOrderId: '0x8634de59f9b5c185d0cdddf053927df7',
      }),
    ]);
  });
});
