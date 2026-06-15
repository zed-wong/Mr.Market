import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminOrdersController } from './admin-orders.controller';

describe('AdminOrdersController', () => {
  it('protects admin order routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminOrdersController);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates bounded query parameters to the orders service', async () => {
    const ordersService = {
      listOrders: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        items: [],
      })),
    };
    const controller = new AdminOrdersController(ordersService as any);

    await expect(
      controller.listOrders(
        'open',
        'buy',
        'btc',
        'user-order-1',
        'strategy-key-1',
        '50',
        '2',
      ),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      items: [],
    });
    expect(ordersService.listOrders).toHaveBeenCalledWith({
      status: 'open',
      side: 'buy',
      query: 'btc',
      userOrderId: 'user-order-1',
      strategyKey: 'strategy-key-1',
      limit: '50',
      page: '2',
    });
  });
});
