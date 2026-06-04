export const HYPERLIQUID_EXCHANGE_ID = 'hyperliquid';

const DERIVATIVE_MARKET_TYPES = new Set([
  'swap',
  'perp',
  'perpetual',
  'future',
  'futures',
  'option',
]);

export function isHyperliquidExchange(exchangeName: string): boolean {
  return exchangeName.trim().toLowerCase() === HYPERLIQUID_EXCHANGE_ID;
}

export function buildHyperliquidSpotOptions(
  existingOptions: Record<string, unknown> = {},
  walletAddress?: string,
): Record<string, unknown> {
  return {
    ...existingOptions,
    builderFee: false,
    ...(walletAddress ? { walletAddress } : {}),
    defaultType: 'spot',
    fetchMarkets: {
      ...((existingOptions.fetchMarkets as Record<string, unknown>) || {}),
      types: ['spot'],
    },
    createOrder: {
      ...((existingOptions.createOrder as Record<string, unknown>) || {}),
      defaultType: 'spot',
    },
    fetchOrder: {
      ...((existingOptions.fetchOrder as Record<string, unknown>) || {}),
      defaultType: 'spot',
    },
    fetchOpenOrders: {
      ...((existingOptions.fetchOpenOrders as Record<string, unknown>) || {}),
      defaultType: 'spot',
    },
    cancelOrder: {
      ...((existingOptions.cancelOrder as Record<string, unknown>) || {}),
      defaultType: 'spot',
    },
  };
}

export function isHyperliquidSpotMarket(market: unknown): boolean {
  if (!market || typeof market !== 'object') {
    return false;
  }

  const typedMarket = market as Record<string, unknown>;

  if (isDerivativeMarket(typedMarket)) {
    return false;
  }

  if (typedMarket.spot === true) {
    return true;
  }

  if (String(typedMarket.type || '').trim().toLowerCase() === 'spot') {
    return true;
  }

  return false;
}

function isDerivativeMarket(market: Record<string, unknown>): boolean {
  const type = String(market.type || '').trim().toLowerCase();

  return (
    DERIVATIVE_MARKET_TYPES.has(type) ||
    market.swap === true ||
    market.future === true ||
    market.futures === true ||
    market.option === true ||
    market.contract === true
  );
}
