import { parseBaseQuoteSymbol } from './time-indicator.service';

describe('parseBaseQuoteSymbol', () => {
  it('parses slash-separated symbols', () => {
    expect(parseBaseQuoteSymbol('BTC/USDT')).toEqual({
      base: 'BTC',
      quote: 'USDT',
    });
  });

  it('parses symbols using configured suffix quotes', () => {
    expect(parseBaseQuoteSymbol('SOLUSDC', ['USDC'])).toEqual({
      base: 'SOL',
      quote: 'USDC',
    });
  });
});
