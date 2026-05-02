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
const LOAD_MARKETS_TIMEOUT_MS = 30_000;

// Cache for loaded exchange markets
const exchangeCache = new Map<string, ccxt.Exchange>();

// Logger helper
const log = {
  loading: (exchange: string, current: number, total: number) =>
    process.stdout.write(`  → Loading ${exchange} (${current}/${total})...\r`),
  loaded: (exchange: string, pairs: number) =>
    console.log(`  ✓ ${exchange}: ${pairs} pairs available`.padEnd(50)),
  failed: (exchange: string, error: string) =>
    console.log(`  ✗ ${exchange}: ${error}`.padEnd(50)),
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}

/**
 * Load exchange markets (cached per exchange)
 */
async function getExchange(
  exchangeId: string,
  index: number,
  total: number,
): Promise<ccxt.Exchange | null> {
  // Return cached exchange if available
  if (exchangeCache.has(exchangeId)) {
    return exchangeCache.get(exchangeId)!;
  }

  const ExchangeClass = ccxtExchanges[exchangeId];

  if (!ExchangeClass) {
    log.failed(exchangeId, 'not supported by CCXT');

    return null;
  }

  try {
    log.loading(exchangeId, index, total);
    const exchange = new ExchangeClass();

    await withTimeout(
      exchange.loadMarkets(),
      LOAD_MARKETS_TIMEOUT_MS,
      `${exchangeId}.loadMarkets()`,
    );
    exchangeCache.set(exchangeId, exchange);
    log.loaded(exchangeId, Object.keys(exchange.markets).length);

    return exchange;
  } catch (error) {
    log.failed(
      exchangeId,
      error instanceof Error ? error.message : 'unknown error',
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
  delayBetweenExchangesMs: number = 300,
): Promise<Map<string, Map<string, MarketInfo>>> {
  const results = new Map<string, Map<string, MarketInfo>>();
  const total = exchangeIds.length;

  for (let i = 0; i < exchangeIds.length; i++) {
    const exchangeId = exchangeIds[i];
    const exchange = await getExchange(exchangeId, i + 1, total);

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
    if (i < exchangeIds.length - 1) {
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
    const exchange = await getExchange(exchangeId, 1, 1);

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
  const exchange = await getExchange(exchangeId, 1, 1);

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
