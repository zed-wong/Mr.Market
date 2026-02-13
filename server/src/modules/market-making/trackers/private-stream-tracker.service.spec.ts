import { PrivateStreamTrackerService } from './private-stream-tracker.service';

describe('PrivateStreamTrackerService', () => {
  it('tracks latest account events by exchange and account label', async () => {
    const service = new PrivateStreamTrackerService();

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'read-only',
      eventType: 'balance_update',
      payload: { asset: 'USDT', free: '100' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    const latest = service.getLatestEvent('binance', 'read-only');

    expect(latest?.eventType).toBe('balance_update');
  });
});
