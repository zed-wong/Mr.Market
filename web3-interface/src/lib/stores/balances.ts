import { derived, writable } from 'svelte/store';
import BigNumber from 'bignumber.js';
import { getBalances } from '$lib/helpers/api/web3';
import { walletIsConnected, walletIsUnsupported } from '$lib/stores/wallet';
import type { BalanceEntry, Web3BalancesResponse, Web3SerializedBalance } from '$lib/types/balances';

export const balancesLoading = writable(false);
export const balancesError = writable<string | null>(null);
export const web3Balances = writable<Web3BalancesResponse | null>(null);

const parseAssetId = (assetId: string) => {
  const [, chainId, tokenAddress] = assetId.split(':');
  return {
    chainId: Number(chainId) || null,
    tokenAddress: tokenAddress || null,
  };
};

const symbolForAsset = (assetId: string): string => {
  const lower = assetId.toLowerCase();
  if (lower.includes('usdc')) return 'USDC';
  if (lower.includes('usdt')) return 'USDT';
  if (lower.includes('weth')) return 'WETH';
  const token = assetId.split(':').pop() || assetId;
  return token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token.toUpperCase();
};

const normalizeAmount = (value: string | null | undefined): string => {
  const amount = new BigNumber(value || 0);
  return amount.isFinite() ? amount.toFixed() : '0';
};

const toBalanceEntry = (balance: Web3SerializedBalance): BalanceEntry => {
  const parsed = parseAssetId(balance.assetId);
  const amount = normalizeAmount(balance.available);
  const symbol = symbolForAsset(balance.assetId);

  return {
    asset: balance.assetId,
    assetId: balance.assetId,
    chainNamespace: 'evm',
    chainId: parsed.chainId,
    tokenAddress: parsed.tokenAddress,
    symbol,
    name: symbol,
    decimals: symbol === 'WETH' ? 18 : 6,
    amount,
    usdValue: new BigNumber(amount).times(symbol === 'WETH' ? 3000 : 1).toFixed(2),
    orderId: balance.orderId,
    locked: normalizeAmount(balance.locked),
    total: normalizeAmount(balance.total),
    updatedAt: balance.updatedAt,
  };
};

export const refreshBalances = async () => {
  balancesLoading.set(true);
  balancesError.set(null);
  try {
    web3Balances.set(await getBalances());
  } catch (error) {
    balancesError.set(error instanceof Error ? error.message : 'Unable to load balances');
    web3Balances.set(null);
  } finally {
    balancesLoading.set(false);
  }
};

export const balances = derived(
  [walletIsConnected, walletIsUnsupported, web3Balances],
  ([$walletIsConnected, $walletIsUnsupported, $web3Balances]) => {
    if (!$walletIsConnected || $walletIsUnsupported || !$web3Balances) return [];
    return $web3Balances.available.map(toBalanceEntry);
  }
);
export const totalBalanceUsd = derived(balances, ($balances) =>
  $balances.reduce((sum, entry) => sum + Number(entry.usdValue || 0), 0).toFixed(2)
);

export const inMarketMakingBalances = derived(web3Balances, ($web3Balances) =>
  $web3Balances?.inMarketMaking ?? []
);

export const fundingActivity = derived(web3Balances, ($web3Balances) =>
  $web3Balances?.activity ?? []
);
