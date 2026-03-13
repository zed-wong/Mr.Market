/* eslint-disable no-console */
import axios from 'axios';

const MIXIN_ASSETS_API = 'https://api.mixin.one/network/assets/top';

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
    // ... other fields
  }>;
}

// Cache for assets
let assetsCache: Map<string, MixinAsset> | null = null;
let chainsCache: Map<string, MixinAsset> | null = null;
let chainIconCache: Map<string, string> | null = null;

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

    const assets = new Map<string, MixinAsset>();
    const chains = new Map<string, MixinAsset>();
    const chainIcons = new Map<string, string>();

    for (const item of response.data.data) {
      const asset: MixinAsset = {
        asset_id: item.asset_id,
        chain_id: item.chain_id,
        symbol: item.symbol,
        name: item.name,
        icon_url: item.icon_url,
        precision: item.precision,
      };

      // Store by symbol (uppercase)
      assets.set(item.symbol.toUpperCase(), asset);

      // Store chain info (when asset_id === chain_id, it's a native chain asset)
      if (item.asset_id === item.chain_id) {
        chains.set(item.asset_id, asset);
      }
    }

    // Build chain icon map: for each chain, find all assets on that chain
    // and use the native asset's icon as the chain icon
    for (const asset of assets.values()) {
      const chain = chains.get(asset.chain_id);
      if (chain && !chainIcons.has(asset.chain_id)) {
        chainIcons.set(asset.chain_id, chain.icon_url);
      }
    }

    assetsCache = assets;
    chainsCache = chains;
    chainIconCache = chainIcons;

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
 * Get chain info by chain_id
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
 * Uses cached chain icon map built from native chain assets
 */
export async function getChainIconUrl(chainId: string): Promise<string> {
  if (!chainIconCache) {
    await fetchMixinAssets();
  }
  return chainIconCache?.get(chainId) || '';
}

/**
 * Clear cache
 */
export function clearCache(): void {
  assetsCache = null;
  chainsCache = null;
  chainIconCache = null;
}
