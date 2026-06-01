import type {
  Web3MarketMakingAssetOption,
  Web3MarketMakingOrderDetail,
  Web3MarketMakingPairOption,
} from '$lib/types/market-making';

export type MarketMakingFundingAssetOption = {
  assetId: string;
  symbol: string | null;
  label: string;
};

const normalize = (value: string | null | undefined): string =>
  String(value || '').trim().toLowerCase();

const normalizePair = (value: string | null | undefined): string =>
  normalize(value).replace(/[^a-z0-9]/g, '');

const unique = (values: string[]): string[] =>
  values.filter((value, index, allValues) => allValues.findIndex((candidate) => normalize(candidate) === normalize(value)) === index);

const assetMatches = (asset: Web3MarketMakingAssetOption, assetId: string): boolean =>
  normalize(asset.assetId) === normalize(assetId) || normalize(asset.symbol) === normalize(assetId);

const fundingAssetLabel = (assetId: string, metadata: Web3MarketMakingAssetOption | null | undefined): string => {
  const symbol = String(metadata?.symbol || '').trim();

  if (!symbol) return assetId;
  return normalize(symbol) === normalize(assetId) ? symbol : `${symbol} · ${assetId}`;
};

export const findMarketMakingPairOptionForOrder = (
  detail: Web3MarketMakingOrderDetail,
  pairOptions: Web3MarketMakingPairOption[]
): Web3MarketMakingPairOption | null => {
  const orderPairKeys = unique([detail.pair || '', detail.specs.pair || ''].map(normalizePair).filter(Boolean));
  const orderExchange = normalize(detail.exchangeName || detail.specs.exchangeName || '');

  return (
    pairOptions.find((option) => {
      if (!orderPairKeys.includes(normalizePair(option.pair))) return false;
      if (!orderExchange) return true;
      return normalize(option.exchangeName) === orderExchange;
    }) || null
  );
};

export const buildMarketMakingFundingAssetOptions = (
  detail: Web3MarketMakingOrderDetail,
  pairOptions: Web3MarketMakingPairOption[]
): MarketMakingFundingAssetOption[] => {
  const pairOption = findMarketMakingPairOptionForOrder(detail, pairOptions);

  if (!pairOption) {
    return unique(detail.balances.map((balance) => balance.assetId).filter(Boolean)).map((assetId) => ({
      assetId,
      symbol: null,
      label: assetId,
    }));
  }

  const metadataAssets = [pairOption.base, pairOption.quote];
  const supportedAssetIds = unique(
    (pairOption.supportedDepositAssets.length > 0
      ? pairOption.supportedDepositAssets
      : metadataAssets.map((asset) => asset.assetId || '')
    )
      .map((assetId) => String(assetId || '').trim())
      .filter(Boolean)
  );

  return supportedAssetIds.map((assetId) => {
    const metadata = metadataAssets.find((asset) => assetMatches(asset, assetId));

    return {
      assetId,
      symbol: metadata?.symbol || null,
      label: fundingAssetLabel(assetId, metadata),
    };
  });
};

export const isMarketMakingFundingAssetSupported = (
  assetId: string,
  options: MarketMakingFundingAssetOption[]
): boolean => options.some((option) => normalize(option.assetId) === normalize(assetId));

export const marketMakingFundingAssetLabel = (
  assetId: string,
  options: MarketMakingFundingAssetOption[]
): string => options.find((option) => normalize(option.assetId) === normalize(assetId))?.label || assetId;
