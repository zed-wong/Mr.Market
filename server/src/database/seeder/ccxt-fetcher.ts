/* eslint-disable no-console */
import * as ccxt from 'ccxt';

export interface MarketInfo {
  symbol: string;
  base: string;
  quote: string;
  precision: {
    price: number;
    amount: number;
  };
  limits: {
    amount: {
      min?: number;
      max?: number;
    };
    price: {
      min?: number;
      max?: number;
    };
  };
}

// Type for dynamic ccxt exchange access
type CcxtExchangeClass = new () => ccxt.Exchange;
const ccxtExchanges = ccxt as unknown as Record<string, CcxtExchangeClass>;

/**
 * Fetch market info from CCXT for a specific exchange and symbol
 */
export async function fetchMarketInfo(
  exchangeId: string,
  symbol: string,
): Promise<MarketInfo | null> {
  try {
    const ExchangeClass = ccxtExchanges[exchangeId];

    if (!ExchangeClass) {
      console.warn(`Exchange ${exchangeId} not supported by CCXT`);

      return null;
    }

    const exchange = new ExchangeClass();
    await exchange.loadMarkets();

    const market = exchange.markets[symbol];

    if (!market) {
      console.warn(`Symbol ${symbol} not found on ${exchangeId}`);

      return null;
    }

    return {
      symbol: market.symbol,
      base: market.base,
      quote: market.quote,
      precision: {
        price: market.precision?.price ?? 8,
        amount: market.precision?.amount ?? 8,
      },
      limits: {
        amount: {
          min: market.limits?.amount?.min,
          max: market.limits?.amount?.max,
        },
        price: {
          min: market.limits?.price?.min,
          max: market.limits?.price?.max,
        },
      },
    };
  } catch (error) {
    console.error(
      `Error fetching market info for ${symbol} on ${exchangeId}:`,
      error instanceof Error ? error.message : error,
    );

    return null;
  }
}

/**
 * Fetch multiple markets in parallel with rate limiting
 */
export async function fetchMarketsBatch(
  exchangeId: string,
  symbols: string[],
  delayMs: number = 500,
): Promise<Map<string, MarketInfo>> {
  const results = new Map<string, MarketInfo>();

  for (const symbol of symbols) {
    const info = await fetchMarketInfo(exchangeId, symbol);

    if (info) {
      results.set(symbol, info);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return results;
}

/**
 * Check if an exchange supports a symbol
 */
export async function exchangeSupportsSymbol(
  exchangeId: string,
  symbol: string,
): Promise<boolean> {
  try {
    const ExchangeClass = ccxtExchanges[exchangeId];

    if (!ExchangeClass) {
      return false;
    }

    const exchange = new ExchangeClass();
    await exchange.loadMarkets();

    return symbol in exchange.markets;
  } catch {
    return false;
  }
}
