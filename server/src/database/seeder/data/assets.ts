/**
 * Popular crypto assets with Mixin Network asset IDs
 * These are the base and quote assets for trading pairs
 */
export const POPULAR_ASSETS = {
  // Native chain assets (chain_id === asset_id)
  BTC: {
    asset_id: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa',
    name: 'Bitcoin',
    symbol: 'BTC',
    icon_url:
      'https://images.mixin.one/HvYGJsV5TGeZ-X9Ek3FEQohQZ3fE9LBEBGcOcn4c4BNHovP4fW4YB97Dg5LcXoQ1hUjMEgjbl1DPlKg1TW7kK6XP=s128',
  },
  ETH: {
    asset_id: '43d61dcd-e413-450d-80b8-101d5e903357',
    name: 'Ethereum',
    symbol: 'ETH',
    icon_url:
      'https://images.mixin.one/zVDjOxNTQvVsA8h2B4ZVxuHoCF3DJszufYKWpd9duXUSbSapoZadC7_13cnWBqg0EmwmRcKGbJaUpA8wFfpgZA=s128',
  },
  SOL: {
    asset_id: '64692c23-8971-4cf4-84a7-4dd1271dd887',
    name: 'Solana',
    symbol: 'SOL',
    icon_url:
      'https://images.mixin.one/k-1L0i-cYGMVt0vzTlnhZ1z5y8Qsa6Ksv5IL9F55uYb5-W0eVOHB7-ckdWDLWuoTTVpnKP2kWyLVB6_a6wYfgDli-VsMfB0uw=s128',
  },
  XRP: {
    asset_id: '23dfb5a5-5d7b-48b6-905f-3970e3176e27',
    name: 'XRP',
    symbol: 'XRP',
    icon_url:
      'https://images.mixin.one/rsJpGUDeY0yD5y-9c51T3kXvXq8YXJ4cA-WsTwdgez6FwY9YjvQmZIbWBkx8K4Cy0LX-xqIozv-KM3H6nS1cBg=s128',
  },
  DOGE: {
    asset_id: '6770a1e5-6086-44d5-b60f-545f9d9e8ffd',
    name: 'Dogecoin',
    symbol: 'DOGE',
    icon_url:
      'https://images.mixin.one/6nVr-p9-MjH9VMZkX6pwT6_W9yTGte7LNw9g0lif4ilE1Lej6JIi_7s_cz9dRX9D4QLZ80fSfM3gV_VhKwL93ktfCvOF9gjeLQ=s128',
  },
  LTC: {
    asset_id: '76c802a2-7c88-447f-a93e-c29c9e5dd9c8',
    name: 'Litecoin',
    symbol: 'LTC',
    icon_url:
      'https://images.mixin.one/8V-te2Hr1Ok82PR7bWF7SuDiyV7RbOt1YfwDgV82HRdDKZV7JZB5qZ4zIa-iF17aYp0IiOG9W5O7JgBFJ8VzKcCQ=s128',
  },
  BCH: {
    asset_id: 'fd11b6e3-0b87-41f1-a41f-f0e9b49e5bf0',
    name: 'Bitcoin Cash',
    symbol: 'BCH',
    icon_url:
      'https://images.mixin.one/Hnne4tEfA3mV6f6d-gfgO6S_R8b1O8xG6A7R-Em3q6KssBLoW8j9rZlBHc3Ht-ojL4YlY2iT7LsZ8jZ9t3X2F1=s128',
  },
  TRX: {
    asset_id: '25dabac5-056a-48ff-b9f9-f67395dc407c',
    name: 'TRON',
    symbol: 'TRX',
    icon_url:
      'https://images.mixin.one/HBVqPTiHfJ9BZJ6E1hXG7e_4C7jQ8m6tY3QXz2hF8K9pL1oV5m3N7eR2dT4wX6Yk8sA1bC3dE5fG7hI9jK0lM2n=s128',
  },
  AVAX: {
    asset_id: 'cbc77539-0a20-4666-8c8a-4ded62b36f0a',
    name: 'Avalanche',
    symbol: 'AVAX',
    icon_url:
      'https://images.mixin.one/WoyjFnJEmS4wYim3ez6tMrfzf8MqFqY9yF9mU8j-G9u7Kj5Xl9XzV7L6d0-c7kLRiZk-g_8M9U-Jx3CY5kB0nw=s128',
  },

  // Stablecoins (tokens on chains)
  USDT: {
    asset_id: '4d8c508b-91c5-375b-92b0-ee702ed2dac5',
    name: 'Tether USD',
    symbol: 'USDT',
    icon_url:
      'https://images.mixin.one/ndNBEpObYs7450U08oAOMnSEPzN66SL8Mh-f2pPWBDeWaKbXTPUIdrZph7yj8Z93Rl8uZ16m7Qjz-E-9JFKSsJ-F=s128',
  },
  USDC: {
    asset_id: '9b180ab6-6abe-3dc0-a13f-04169eb34bfa',
    name: 'USD Coin',
    symbol: 'USDC',
    icon_url:
      'https://images.mixin.one/w3Lb-pMrgcmmrzamf7FG_0c6Dkh3w_NRbysqzpuacwdVhMYSOtnX2zedWqiSG7JuZ3jd4xfhAJduQXY1rPidmywn=s128',
  },

  // Other popular tokens
  BNB: {
    asset_id: '1949e683-6a08-49e2-b087-d6b72398588f',
    name: 'BNB',
    symbol: 'BNB',
    icon_url:
      'https://images.mixin.one/a5R1N8Lr3h4F5J6K7L8M9N0O1P2Q3R4S5T6U7V8W9X0Y1Z2a3B4c5D6e7F8g9H0i1J2k3L4m5N6o7P8q9R0s1T2u3V4w5X6y7Z8=s128',
  },
  MATIC: {
    asset_id: 'b7938396-3f94-4e0a-9179-d3440718156f',
    name: 'Polygon',
    symbol: 'MATIC',
    icon_url:
      'https://images.mixin.one/t9MP6wRk4E3Gg5dY5K1Z7dZ2H8P3H4Z5a8D9F0g1h2I3j4K5l6M7n8O9p0Q1r2S3t4U5v6W7x8Y9z0A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K7l8M9n0O1p2Q3r4S5t6U7v8W9x0Y1z2A3b4C5d6E7f8G9h0I1j2K3l4M5n6O7p8Q9r0S1t2U3v4W5x6Y7z8A9b0C1d2E3f4G5h6I7j8K9l0M1n2O3p4Q5r6S7t8U9v0W1x2Y3z4A5b6C7d8E9f0G1h2I3j4K5l6M7n8O9p0Q1r2S3t4U5v6W7x8Y9z0A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K7l8M9n0O1p2Q3r4S5t6U7v8W9x0Y1z2A3b4C5d6E7f8G9h0I1j2K3l4M5n6O7p8Q9r0S1t2U3v4W5x6Y7z8A9b0C1d2E3f4G5h6I7j8K9l0M1n2O3p4Q5r6S7t8U9v0W1x2Y3z4A5b6C7d8E9f0G1h2I3j4K5l6M7n8O9p0Q1r2S3t4U5v6W7x8Y9z0=s128',
  },
} as const;

/**
 * Trading pairs to generate for each exchange
 * Format: BASE/QUOTE (e.g., BTC/USDT)
 */
export const TRADING_PAIRS = [
  // BTC pairs
  'BTC/USDT',
  // ETH pairs
  'ETH/USDT',
  // SOL pairs
  'SOL/USDT',
  // XRP pairs
  'XRP/USDT',
  // DOGE pairs
  'DOGE/USDT',
  // LTC pairs
  'LTC/USDT',
  // AVAX pairs
  'AVAX/USDT',
  // MATIC pairs
  'MATIC/USDT',
  // BNB pairs (may not be available on all exchanges)
  'BNB/USDT',
] as const;

export type AssetConfig = (typeof POPULAR_ASSETS)[keyof typeof POPULAR_ASSETS];
export type TradingPairSymbol = (typeof TRADING_PAIRS)[number];
