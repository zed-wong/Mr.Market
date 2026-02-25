import { marketDataType } from 'src/modules/data/market-data/market-data.service';

export interface CompositeKey {
  type: marketDataType;
  exchange: string;
  symbol?: string;
  symbols?: string[];
  timeFrame?: string;
}

export const createCompositeKey = (
  type: marketDataType,
  exchange: string,
  symbol?: string,
  symbols?: string[],
  timeFrame?: string,
): string => {
  let key = '';
  const normalizedSymbols = Array.isArray(symbols)
    ? [...new Set(symbols.map((item) => String(item).trim()).filter(Boolean))]
        .sort()
        .join(',')
    : '';

  if (type === 'orderbook' || type === 'ticker') {
    key = `${type}:${exchange}:${symbol}`;
  } else if (type === 'OHLCV') {
    key = `${type}:${exchange}:${symbol}:${timeFrame}`;
  } else if (type === 'tickers') {
    key = `${type}:${exchange}:${normalizedSymbols}`;
  }

  return key;
};
export const decodeCompositeKey = (compositeKey: string): CompositeKey => {
  const parts = compositeKey.split(':');
  const type = parts[0] as marketDataType;
  const exchange = parts[1];
  const decodedKey: CompositeKey = { type, exchange };

  switch (type) {
    case 'orderbook':
    case 'ticker':
      decodedKey.symbol = parts[2];
      break;
    case 'OHLCV':
      decodedKey.symbol = parts[2];
      decodedKey.timeFrame = parts[3];
      break;
    case 'tickers':
      decodedKey.symbols = parts[2]
        ? parts[2].split(',').filter((symbol) => symbol.length > 0)
        : [];
      break;
  }

  return decodedKey;
};
