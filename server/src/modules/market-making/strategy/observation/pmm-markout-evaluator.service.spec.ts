import { PmmMarkoutEvaluatorService } from './pmm-markout-evaluator.service';

describe('PmmMarkoutEvaluatorService', () => {
  const marketDataProvider = {
    getTrackedMidPriceHistory: jest.fn(),
  };
  let service: PmmMarkoutEvaluatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PmmMarkoutEvaluatorService(marketDataProvider as any);
  });

  it('increments buy toxicity and pauses buy side after adverse markout', () => {
    marketDataProvider.getTrackedMidPriceHistory.mockReturnValue([
      { price: 99, ts: 1_500, sequence: 1 },
    ]);

    service.recordFill({
      strategyKey: 'pmm-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      observedAtMs: 1_000,
      markoutWindowMs: 500,
      guardBps: 50,
      cooldownMs: 2_000,
    });

    service.evaluateDue(1_500);

    expect(service.getToxicity('pmm-1', 1_500)).toEqual({
      buyScore: 1,
      sellScore: 0,
      buyPausedUntilMs: 3_500,
      sellPausedUntilMs: null,
      buyLastPausedUntilMs: 3_500,
      sellLastPausedUntilMs: null,
    });

    expect(service.getToxicity('pmm-1', 3_600)).toEqual({
      buyScore: 1,
      sellScore: 0,
      buyPausedUntilMs: null,
      sellPausedUntilMs: null,
      buyLastPausedUntilMs: 3_500,
      sellLastPausedUntilMs: null,
    });
  });

  it('does not increment toxicity when markout is not adverse', () => {
    marketDataProvider.getTrackedMidPriceHistory.mockReturnValue([
      { price: 100.1, ts: 1_500, sequence: 1 },
    ]);

    service.recordFill({
      strategyKey: 'pmm-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      side: 'sell',
      price: '100',
      observedAtMs: 1_000,
      markoutWindowMs: 500,
      guardBps: 50,
      cooldownMs: 2_000,
    });

    service.evaluateDue(1_500);

    expect(service.getToxicity('pmm-1', 1_500)).toEqual({
      buyScore: 0,
      sellScore: 0,
      buyPausedUntilMs: null,
      sellPausedUntilMs: null,
      buyLastPausedUntilMs: null,
      sellLastPausedUntilMs: null,
    });
  });
});
