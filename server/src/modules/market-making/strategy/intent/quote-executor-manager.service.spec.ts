import { QuoteExecutorManagerService } from './quote-executor-manager.service';

describe('QuoteExecutorManagerService', () => {
  it('builds layered quotes with inventory skew and maker-heavy mode', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 2,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '1',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0.5,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.8,
      makerHeavyMode: true,
      makerHeavyBiasBps: 20,
    });

    expect(quotes.length).toBe(4);
    const buyQuote = quotes.find((quote) => quote.side === 'buy');
    const sellQuote = quotes.find((quote) => quote.side === 'sell');

    expect(Number(buyQuote?.price)).toBeLessThan(99);
    expect(Number(sellQuote?.price)).toBeGreaterThanOrEqual(100);
  });

  it('assigns stable slot keys per layer and side', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 2,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '1',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
    });

    expect(quotes.map((quote) => quote.slotKey)).toEqual([
      'layer-1-buy',
      'layer-1-sell',
      'layer-2-buy',
      'layer-2-sell',
    ]);
  });
});
