import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminLedgerController } from './admin-ledger.controller';

describe('AdminLedgerController', () => {
  it('protects admin ledger routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminLedgerController);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates the summary request to the ledger service', async () => {
    const ledgerService = {
      getSummary: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
      })),
      listEntries: jest.fn(),
      listBalances: jest.fn(),
    };
    const controller = new AdminLedgerController(ledgerService as any);

    await expect(controller.getSummary()).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
    });
    expect(ledgerService.getSummary).toHaveBeenCalledTimes(1);
  });

  it('delegates bounded entry query parameters to the ledger service', async () => {
    const ledgerService = {
      getSummary: jest.fn(),
      listEntries: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        items: [],
      })),
      listBalances: jest.fn(),
    };
    const controller = new AdminLedgerController(ledgerService as any);

    await expect(
      controller.listEntries('fill_settle', 'BTC', 'order', '50', '2'),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      items: [],
    });
    expect(ledgerService.listEntries).toHaveBeenCalledWith({
      type: 'fill_settle',
      asset: 'BTC',
      query: 'order',
      limit: '50',
      page: '2',
    });
  });

  it('delegates bounded balance query parameters to the ledger service', async () => {
    const ledgerService = {
      getSummary: jest.fn(),
      listEntries: jest.fn(),
      listBalances: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        items: [],
      })),
    };
    const controller = new AdminLedgerController(ledgerService as any);

    await expect(
      controller.listBalances('binance', 'BTC', 'order', '50', '2'),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      items: [],
    });
    expect(ledgerService.listBalances).toHaveBeenCalledWith({
      exchange: 'binance',
      asset: 'BTC',
      query: 'order',
      limit: '50',
      page: '2',
    });
  });
});
