/**
 * Trading pairs to generate for each exchange
 * Format: BASE/QUOTE (e.g., BTC/USDT)
 *
 * Asset info (asset_id, chain_id, icon_url) is fetched dynamically from Mixin API
 */
export const TRADING_PAIRS = [
  // Major pairs
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'XRP/USDT',
  'DOGE/USDT',
  'LTC/USDT',
  'AVAX/USDT',
  'MATIC/USDT',
  'BNB/USDT',
  // Project tokens (mainly on MEXC)
  'HMT/USDT',
  'XIN/USDT',
] as const;

export type TradingPairSymbol = (typeof TRADING_PAIRS)[number];
