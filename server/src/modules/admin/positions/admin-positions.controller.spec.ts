import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminPositionsController } from './admin-positions.controller';

describe('AdminPositionsController', () => {
  it('protects admin position routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminPositionsController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates bounded query parameters to the positions service', async () => {
    const positionsService = {
      listPositions: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        items: [],
      })),
    };
    const controller = new AdminPositionsController(positionsService as any);

    await expect(
      controller.listPositions('binance', 'BTC', 'order', '50', '2'),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      items: [],
    });
    expect(positionsService.listPositions).toHaveBeenCalledWith({
      exchange: 'binance',
      asset: 'BTC',
      query: 'order',
      limit: '50',
      page: '2',
    });
  });
});
