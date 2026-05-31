import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

import { Web3MarketMakingController } from './web3-market-making.controller';

describe('Web3MarketMakingController', () => {
  const service = {
    listOrders: jest.fn(),
    getOrderDetail: jest.fn(),
    getOrderPerformance: jest.fn(),
    listStrategies: jest.fn(),
    listPairOptions: jest.fn(),
    createOrder: jest.fn(),
    deposit: jest.fn(),
    withdraw: jest.fn(),
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    createValidationReconciliationMismatch: jest.fn(),
  };

  let controller: Web3MarketMakingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new Web3MarketMakingController(service as never);
  });

  it('uses a single web3 market-making namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, Web3MarketMakingController)).toBe(
      'web3/market-making',
    );
  });

  it('binds list/detail/mutations to the authenticated user only', async () => {
    service.listOrders.mockResolvedValueOnce({ orders: [] });
    service.createOrder.mockResolvedValueOnce({ orderId: 'order-1' });
    service.deposit.mockResolvedValueOnce({ mutation: { type: 'deposit' } });

    await controller.listOrders({ user: { userId: 'user-1' } });
    await controller.createOrder(
      { userId: 'spoofed-user', marketMakingPairId: 'pair-1' },
      { user: { userId: 'user-1' } },
    );
    await controller.deposit(
      'order-1',
      { assetId: 'USDT', amount: '1', idempotencyKey: 'k' },
      { user: { userId: 'user-1' } },
    );

    expect(service.listOrders).toHaveBeenCalledWith('user-1');
    expect(service.createOrder).toHaveBeenCalledWith('user-1', {
      userId: 'spoofed-user',
      marketMakingPairId: 'pair-1',
    });
    expect(service.deposit).toHaveBeenCalledWith('user-1', 'order-1', {
      assetId: 'USDT',
      amount: '1',
      idempotencyKey: 'k',
    });
  });

  it('binds order performance lookup to the authenticated user', async () => {
    service.getOrderPerformance.mockResolvedValueOnce({ series: [] });

    await controller.getOrderPerformance('order-1', {
      user: { userId: 'user-1' },
    });

    expect(service.getOrderPerformance).toHaveBeenCalledWith(
      'user-1',
      'order-1',
    );
  });

  it('rejects protected routes when the authenticated user is absent', async () => {
    await expect(controller.listOrders({ user: {} })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.listOrders).not.toHaveBeenCalled();
  });

  it('binds validation reconciliation mismatch fixture setup to the authenticated owner', async () => {
    service.createValidationReconciliationMismatch.mockResolvedValueOnce({
      fixture: 'reconciliation_mismatch',
    });

    await controller.createValidationReconciliationMismatch(
      'order-1',
      { assetId: 'asset-usdt' },
      { user: { userId: 'user-1' } },
    );

    expect(service.createValidationReconciliationMismatch).toHaveBeenCalledWith(
      'user-1',
      'order-1',
      { assetId: 'asset-usdt' },
    );
  });
});
