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

// Cache for loaded exchange markets
const exchangeCache = new Map<string, ccxt.Exchange>();

/**
 * Load exchange markets (cached per exchange)
 */
async function getExchange(exchangeId: string): Promise<ccxt.Exchange | null> {
  // Return cached exchange if available
  if (exchangeCache.has(exchangeId)) {
    return exchangeCache.get(exchangeId)!;
  }

  const ExchangeClass = ccxtExchanges[exchangeId];

  if (!ExchangeClass) {
    console.warn(`Exchange ${exchangeId} not supported by CCXT`);
    return null;
  }

  try {
    const exchange = new ExchangeClass();

    await exchange.loadMarkets();
    exchangeCache.set(exchangeId, exchange);
    console.log(`Loaded markets for ${exchangeId}`);

    return exchange;
  } catch (error) {
    console.error(
      `Failed to load markets for ${exchangeId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * Get market info from a loaded exchange
 */
function getMarketInfoFromExchange(
  exchange: ccxt.Exchange,
  symbol: string,
): MarketInfo | null {
  const market = exchange.markets[symbol];

  if (!market) {
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
}

/**
 * Fetch all markets for multiple exchanges efficiently
 * - Loads each exchange's markets only once
 * - Processes exchanges sequentially to avoid rate limits
 * - Adds delay between exchanges
 */
export async function fetchAllMarkets(
  exchangeIds: string[],
  symbols: string[],
  delayBetweenExchangesMs: number = 500,
): Promise<Map<string, Map<string, MarketInfo>>> {
  const results = new Map<string, Map<string, MarketInfo>>();

  for (const exchangeId of exchangeIds) {
    const exchange = await getExchange(exchangeId);

    if (!exchange) {
      results.set(exchangeId, new Map());
      continue;
    }

    const exchangeResults = new Map<string, MarketInfo>();

    for (const symbol of symbols) {
      const marketInfo = getMarketInfoFromExchange(exchange, symbol);
      if (marketInfo) {
        exchangeResults.set(symbol, marketInfo);
      }
    }

    results.set(exchangeId, exchangeResults);

    // Delay between exchanges to avoid rate limits
    if (exchangeIds.indexOf(exchangeId) < exchangeIds.length - 1) {
      await sleep(delayBetweenExchangesMs);
    }
  }

  return results;
}

/**
 * Legacy function for backwards compatibility
 */
export async function fetchMarketInfo(
  exchangeId: string,
  symbol: string,
): Promise<MarketInfo | null> {
  try {
    const exchange = await getExchange(exchangeId);

    if (!exchange) {
      return null;
    }

    return getMarketInfoFromExchange(exchange, symbol);
  } catch (error) {
    console.error(
      `Error fetching market info for ${symbol} on ${exchangeId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Check if an exchange supports a symbol
 */
export async function exchangeSupportsSymbol(
  exchangeId: string,
  symbol: string,
): Promise<boolean> {
  const exchange = await getExchange(exchangeId);

  if (!exchange) {
    return false;
  }

  return symbol in exchange.markets;
}

/**
 * Clear exchange cache
 */
export function clearCache(): void {
  exchangeCache.clear();
}
