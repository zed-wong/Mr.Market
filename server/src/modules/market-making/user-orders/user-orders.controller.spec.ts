import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { UserOrdersController } from './user-orders.controller';
import { UserOrdersService } from './user-orders.service';

describe('UserOrdersController', () => {
  let controller: UserOrdersController;
  let userOrdersService: {
    findAllStrategyByUser: jest.Mock;
    findOwnedMarketMakingPaymentStateById: jest.Mock;
    findSimplyGrowByUserId: jest.Mock;
    findOwnedSimplyGrowByOrderId: jest.Mock;
    findMarketMakingByUserId: jest.Mock;
    listEnabledMarketMakingStrategies: jest.Mock;
    findOwnedMarketMakingByOrderId: jest.Mock;
    createMarketMakingOrderIntent: jest.Mock;
    getUserOrders: jest.Mock;
  };

  beforeEach(async () => {
    userOrdersService = {
      findAllStrategyByUser: jest.fn(),
      findOwnedMarketMakingPaymentStateById: jest.fn(),
      findSimplyGrowByUserId: jest.fn(),
      findOwnedSimplyGrowByOrderId: jest.fn(),
      findMarketMakingByUserId: jest.fn(),
      listEnabledMarketMakingStrategies: jest.fn(),
      findOwnedMarketMakingByOrderId: jest.fn(),
      createMarketMakingOrderIntent: jest.fn(),
      getUserOrders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserOrdersController],
      providers: [
        {
          provide: UserOrdersService,
          useValue: userOrdersService,
        },
      ],
    }).compile();

    controller = module.get<UserOrdersController>(UserOrdersController);
  });

  it('binds combined order listing to the authenticated user', async () => {
    await controller.getAllStrategy({
      user: { userId: 'user-1' },
    });

    expect(userOrdersService.findAllStrategyByUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('binds market-making payment state lookup to the authenticated user', async () => {
    await controller.getMarketMakingPaymentState('order-1', {
      user: { userId: 'user-1' },
    });

    expect(
      userOrdersService.findOwnedMarketMakingPaymentStateById,
    ).toHaveBeenCalledWith('user-1', 'order-1');
  });

  it('keeps enabled market-making strategies public', async () => {
    await controller.getEnabledMarketMakingStrategies();

    expect(
      userOrdersService.listEnabledMarketMakingStrategies,
    ).toHaveBeenCalledTimes(1);
  });

  it('uses the authenticated user for market-making intent creation', async () => {
    const body = {
      userId: 'spoofed-user',
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { bidSpread: 0.01 },
    };

    await controller.createMarketMakingIntent(body, {
      user: { userId: 'user-1' },
    });

    expect(
      userOrdersService.createMarketMakingOrderIntent,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { bidSpread: 0.01 },
    });
  });

  it('throws when the authenticated user is missing on a protected route', async () => {
    await expect(
      controller.getAllMarketMakingByUser({ user: {} }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
