import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

describe('AdminAnalyticsController', () => {
  it('protects analytics routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminAnalyticsController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates foundation query validation and projection reads to the service', async () => {
    const analyticsService = {
      getFoundation: jest.fn(async () => ({
        generatedAt: '2026-06-04T00:00:00.000Z',
      })),
      getOrderAnalytics: jest.fn(),
      getDirectMarketMakingDashboard: jest.fn(),
    };
    const controller = new AdminAnalyticsController(analyticsService as any);

    await expect(
      controller.getFoundation(
        'pair',
        undefined,
        'binance',
        'BTC/USDT',
        '2026-06-04T00:00:00.000Z',
        '2026-06-04T01:00:00.000Z',
        undefined,
        '25',
      ),
    ).resolves.toEqual({
      generatedAt: '2026-06-04T00:00:00.000Z',
    });
    expect(analyticsService.getFoundation).toHaveBeenCalledWith({
      scope: 'pair',
      orderId: undefined,
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: '2026-06-04T00:00:00.000Z',
      endAt: '2026-06-04T01:00:00.000Z',
      range: undefined,
      limit: '25',
    });
  });

  it('delegates per-order analytics queries to the service', async () => {
    const analyticsService = {
      getFoundation: jest.fn(),
      getOrderAnalytics: jest.fn(async () => ({
        orderId: 'order-1',
      })),
      getDirectMarketMakingDashboard: jest.fn(),
    };
    const controller = new AdminAnalyticsController(analyticsService as any);

    await expect(
      controller.getOrderAnalytics(
        'order-1',
        'binance',
        'BTC/USDT',
        '2026-06-04T00:00:00.000Z',
        '2026-06-04T01:00:00.000Z',
        undefined,
        '25',
      ),
    ).resolves.toEqual({
      orderId: 'order-1',
    });
    expect(analyticsService.getOrderAnalytics).toHaveBeenCalledWith('order-1', {
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: '2026-06-04T00:00:00.000Z',
      endAt: '2026-06-04T01:00:00.000Z',
      range: undefined,
      limit: '25',
    });
  });

  it('delegates Direct Market Making dashboard queries to the service', async () => {
    const analyticsService = {
      getFoundation: jest.fn(),
      getOrderAnalytics: jest.fn(),
      getDirectMarketMakingDashboard: jest.fn(async () => ({
        dashboard: { scope: { type: 'order', orderId: 'order-1' } },
      })),
    };
    const controller = new AdminAnalyticsController(analyticsService as any);

    await expect(
      controller.getDirectMarketMakingDashboard(
        'order',
        'order-1',
        'binance',
        'BTC/USDT',
        '2026-06-04T00:00:00.000Z',
        '2026-06-04T01:00:00.000Z',
        undefined,
        '25',
      ),
    ).resolves.toEqual({
      dashboard: { scope: { type: 'order', orderId: 'order-1' } },
    });
    expect(
      analyticsService.getDirectMarketMakingDashboard,
    ).toHaveBeenCalledWith({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: '2026-06-04T00:00:00.000Z',
      endAt: '2026-06-04T01:00:00.000Z',
      range: undefined,
      limit: '25',
    });
  });

  it('surfaces deterministic validation errors for unsafe query shapes', async () => {
    const service = new AdminAnalyticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const controller = new AdminAnalyticsController(service);

    await expect(
      controller.getFoundation(
        ['pair', 'order'] as any,
        undefined,
        'binance',
        'BTC/USDT',
        '2026-06-04T00:00:00.000Z',
        '2026-06-04T01:00:00.000Z',
        undefined,
        '25',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
