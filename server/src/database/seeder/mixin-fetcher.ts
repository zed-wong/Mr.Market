/* eslint-disable no-console */
import axios from 'axios';

const MIXIN_ASSETS_API = 'https://api.mixin.one/network/assets/top';

// Known chain IDs for prioritizing asset versions
const CHAIN_IDS = {
  ETHEREUM: '43d61dcd-e413-450d-80b8-101d5e903357',
  BITCOIN: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa',
  SOLANA: '64692c23-8971-4cf4-84a7-4dd1271dd887',
  BSC: '1949e683-6a08-49e2-b087-d6b72398588f',
  POLYGON: 'b7938396-3f94-4e0a-9179-d3440718156f',
  TRON: '25dabac5-056a-48ff-b9f9-f67395dc407c',
  AVALANCHE: 'cbc77539-0a20-4666-8c8a-4ded62b36f0a',
  RIPPLE: '23dfb5a5-5d7b-48b6-905f-3970e3176e27',
  DOGECOIN: '6770a1e5-6086-44d5-b60f-545f9d9e8ffd',
  LITECOIN: '76c802a2-7c88-447f-a93e-c29c9e5dd9c8',
  MIXIN: 'c94ac88f-4671-3976-b60a-09064f1811e8',
} as const;

// Priority order for choosing which chain version to use for a symbol
// For tokens (non-native assets), prefer Ethereum version
const CHAIN_PRIORITY = [
  CHAIN_IDS.ETHEREUM, // Prefer Ethereum version for tokens (most common for trading)
  CHAIN_IDS.BITCOIN,
  CHAIN_IDS.SOLANA,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.AVALANCHE,
  CHAIN_IDS.TRON,
  CHAIN_IDS.RIPPLE,
  CHAIN_IDS.DOGECOIN,
  CHAIN_IDS.LITECOIN,
  CHAIN_IDS.MIXIN,
];

export interface MixinAsset {
  asset_id: string;
  chain_id: string;
  symbol: string;
  name: string;
  icon_url: string;
  precision: number;
}

interface MixinApiResponse {
  data: Array<{
    asset_id: string;
    chain_id: string;
    symbol: string;
    name: string;
    icon_url: string;
    precision: number;
  }>;
}

// Cache for assets
let assetsCache: Map<string, MixinAsset> | null = null;
let chainsCache: Map<string, MixinAsset> | null = null;

// Logger helper
const log = {
  loading: () => process.stdout.write('  → Fetching assets from Mixin API...\r'),
  loaded: (count: number) =>
    console.log(`  ✓ Fetched ${count} assets from Mixin API`.padEnd(50)),
  failed: (error: string) =>
    console.log(`  ✗ Failed to fetch from Mixin: ${error}`.padEnd(50)),
};

/**
 * Fetch all assets from Mixin API
 * - Stores native chain assets (asset_id === chain_id) in chainsCache
 * - For symbols with multiple versions, picks based on CHAIN_PRIORITY (ETH first)
 */
export async function fetchMixinAssets(): Promise<Map<string, MixinAsset>> {
  if (assetsCache) {
    return assetsCache;
  }

  log.loading();

  try {
    const response = await axios.get<MixinApiResponse>(MIXIN_ASSETS_API, {
      timeout: 30000,
    });

    // First pass: collect all assets grouped by symbol and identify chains
    const assetsBySymbol = new Map<string, MixinAsset[]>();
    const chains = new Map<string, MixinAsset>();

    for (const item of response.data.data) {
      const asset: MixinAsset = {
        asset_id: item.asset_id,
        chain_id: item.chain_id,
        symbol: item.symbol,
        name: item.name,
        icon_url: item.icon_url,
        precision: item.precision,
      };

      // Group by symbol (uppercase)
      const symbolUpper = item.symbol.toUpperCase();
      if (!assetsBySymbol.has(symbolUpper)) {
        assetsBySymbol.set(symbolUpper, []);
      }
      assetsBySymbol.get(symbolUpper)!.push(asset);

      // Store chain info (native chain asset: asset_id === chain_id)
      if (item.asset_id === item.chain_id) {
        chains.set(item.asset_id, asset);
      }
    }

    // Second pass: pick best version for each symbol
    // - For native assets (asset_id === chain_id): use native version
    // - For tokens: prefer Ethereum version based on CHAIN_PRIORITY
    const assets = new Map<string, MixinAsset>();

    for (const [symbol, versions] of assetsBySymbol) {
      if (versions.length === 1) {
        // Only one version, use it
        assets.set(symbol, versions[0]);
      } else {
        // Check if any version is a native chain asset (asset_id === chain_id)
        const nativeAsset = versions.find(
          (a) => a.asset_id === a.chain_id && chains.has(a.chain_id),
        );

        if (nativeAsset) {
          // Native asset exists, use it
          assets.set(symbol, nativeAsset);
        } else {
          // No native asset, pick based on chain priority (Ethereum first for tokens)
          let bestAsset = versions[0];
          let bestPriority = Infinity;

          for (const asset of versions) {
            const priority = CHAIN_PRIORITY.indexOf(
              asset.chain_id as (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS],
            );
            if (priority !== -1 && priority < bestPriority) {
              bestPriority = priority;
              bestAsset = asset;
            }
          }
          assets.set(symbol, bestAsset);
        }
      }
    }

    assetsCache = assets;
    chainsCache = chains;

    log.loaded(assets.size);

    return assets;
  } catch (error) {
    log.failed(error instanceof Error ? error.message : 'unknown error');
    throw error;
  }
}

/**
 * Get asset info by symbol
 */
export async function getAssetBySymbol(
  symbol: string,
): Promise<MixinAsset | undefined> {
  const assets = await fetchMixinAssets();
  return assets.get(symbol.toUpperCase());
}

/**
 * Get chain info (native asset) by chain_id
 */
export async function getChainById(
  chainId: string,
): Promise<MixinAsset | undefined> {
  if (!chainsCache) {
    await fetchMixinAssets();
  }
  return chainsCache?.get(chainId);
}

/**
 * Get chain icon URL by chain_id
 * Returns the icon of the native chain asset (e.g., ETH icon for Ethereum chain)
 */
export async function getChainIconUrl(chainId: string): Promise<string> {
  const chain = await getChainById(chainId);
  return chain?.icon_url || '';
}

/**
 * Clear cache
 */
export function clearCache(): void {
  assetsCache = null;
  chainsCache = null;
}
