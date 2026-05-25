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

  it('widens spreads when volatility-based spread is enabled', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      volBasedSpread: true,
      realizedVolatility: 0.02,
      spreadSigmaMultiplier: 2,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('95');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('105');
  });

  it('keeps base spreads when volatility sample is unavailable', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      volBasedSpread: true,
      realizedVolatility: null,
      spreadSigmaMultiplier: 2,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('99');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('101');
  });

  it('clamps volatility-adjusted spread to max adaptive spread', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      volBasedSpread: true,
      realizedVolatility: 0.1,
      spreadSigmaMultiplier: 2,
      maxAdaptiveSpread: 0.05,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('95');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('105');
  });

  it('skews spreads with positive order book imbalance', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      orderBookImbalance: 0.5,
      imbalanceSkewFactor: 0.01,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('98.5');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('100.5');
  });

  it('skews spreads with negative order book imbalance', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      orderBookImbalance: -0.5,
      imbalanceSkewFactor: 0.01,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('99.5');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('101.5');
  });

  it('suppresses imbalance skew when inventory deviation is severe', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '1',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.8,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      orderBookImbalance: 0.5,
      imbalanceSkewFactor: 0.01,
      inventorySeverePivot: 0.3,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('99');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('101');
  });

  it('reduces quote sizes when volatility is active', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      adaptiveSizeEnabled: true,
      realizedVolatility: 0.1,
      sizeVolScalingFactor: 5,
      sizeFloor: 0.2,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.qty).toBe('5');
    expect(quotes.find((quote) => quote.side === 'sell')?.qty).toBe('5');
  });

  it('reduces only the side that worsens severe inventory', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.65,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      adaptiveSizeEnabled: true,
      inventorySeverePivot: 0.3,
      sizeFloor: 0.2,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.qty).toBe('5');
    expect(quotes.find((quote) => quote.side === 'sell')?.qty).toBe('10');
  });

  it('reduces sell size when quote inventory is severely low', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.35,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      adaptiveSizeEnabled: true,
      inventorySeverePivot: 0.3,
      sizeFloor: 0.2,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.qty).toBe('10');
    expect(quotes.find((quote) => quote.side === 'sell')?.qty).toBe('5');
  });

  it('omits the side that would worsen extreme inventory deviation', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.95,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      inventoryPauseSidePivot: 0.4,
    });

    expect(quotes.map((quote) => quote.side)).toEqual(['sell']);
  });

  it('caps layers while volatility is active', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 3,
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
      adaptiveSizeEnabled: true,
      realizedVolatility: 0.01,
      maxLayersInVol: 1,
    });

    expect(quotes.map((quote) => quote.slotKey)).toEqual([
      'layer-1-buy',
      'layer-1-sell',
    ]);
  });

  it('widens and reduces only the toxic side', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      buyToxicityScore: 1,
      toxicityWidenBps: 50,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('98.5');
    expect(quotes.find((quote) => quote.side === 'buy')?.qty).toBe('5');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('101');
    expect(quotes.find((quote) => quote.side === 'sell')?.qty).toBe('10');
  });

  it('omits paused toxic sides', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      buyPaused: true,
    });

    expect(quotes.map((quote) => quote.side)).toEqual(['sell']);
  });

  it('gradually restores a side after toxicity cooldown', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      buyRecoveryWidenBps: 50,
      buyRecoverySizeRatio: 0.5,
    });

    expect(quotes.find((quote) => quote.side === 'buy')?.price).toBe('98.5');
    expect(quotes.find((quote) => quote.side === 'buy')?.qty).toBe('5');
    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('101');
    expect(quotes.find((quote) => quote.side === 'sell')?.qty).toBe('10');
  });

  it('does not emit quotes when adaptive size reduces quantity to zero', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '10',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.5,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
      adaptiveSizeEnabled: true,
      realizedVolatility: 1,
      sizeVolScalingFactor: 2,
      sizeFloor: 0,
    });

    expect(quotes).toEqual([]);
  });

  it('clamps extreme spreads before they can create negative bid prices', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
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
      volBasedSpread: true,
      realizedVolatility: 1,
      spreadSigmaMultiplier: 2,
    });

    expect(Number(quotes.find((quote) => quote.side === 'buy')?.price)).toBe(5);
    expect(
      Number(quotes.find((quote) => quote.side === 'sell')?.price),
    ).toBeGreaterThan(100);
  });

  it('returns no quotes when current inventory ratio is not finite', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: '1',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 0,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: Number.NaN,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
    });

    expect(quotes).toEqual([]);
  });

  it('keeps inventory skew from collapsing a spread to mid', () => {
    const service = new QuoteExecutorManagerService();

    const quotes = service.buildQuotes({
      midPrice: '100',
      numberOfLayers: 1,
      bidSpread: 0.001,
      askSpread: 0.001,
      orderAmount: '1',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      inventorySkewFactor: 1,
      inventoryTargetBaseRatio: 0.5,
      currentBaseRatio: 0.502,
      makerHeavyMode: false,
      makerHeavyBiasBps: 0,
    });

    expect(quotes.find((quote) => quote.side === 'sell')?.price).toBe('100.1');
  });
});
