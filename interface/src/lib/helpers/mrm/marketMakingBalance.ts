import { formatDecimals } from "$lib/helpers/utils";

type WalletAsset = {
  balance?: string | number;
  symbol?: string;
  details?: {
    symbol?: string;
  };
};

type WalletLike = {
  balances?: WalletAsset[];
};

const normalizeSymbol = (symbol: string | null | undefined) => {
  if (!symbol) return "";
  return symbol.split("@")[0].toUpperCase();
};

export const getAssetBalanceBySymbol = (
  wallet: WalletLike | null | undefined,
  symbol: string | null | undefined,
) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return "0";

  const balances = wallet?.balances || [];
  const matchedAsset = balances.find((asset) => {
    const assetSymbol = normalizeSymbol(asset?.details?.symbol || asset?.symbol);
    return assetSymbol === normalizedSymbol;
  });

  if (!matchedAsset?.balance && matchedAsset?.balance !== 0) {
    return "0";
  }

  return String(matchedAsset.balance);
};

const isValidBalance = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return false;
  const numericValue = Number(value);
  return Number.isFinite(numericValue);
};

export const formatBalanceForDisplay = (
  balance: string | number | null | undefined,
  maxDecimals = 8,
) => {
  if (!isValidBalance(balance)) return "0";
  const raw = String(balance);
  const [, decimalPart] = raw.split(".");
  if (!decimalPart || decimalPart.length <= maxDecimals) {
    return raw;
  }
  return formatDecimals(raw, maxDecimals);
};

export const getBalanceAutofillAmount = (
  balance: string | number | null | undefined,
) => {
  if (!isValidBalance(balance)) return "0";
  return String(balance);
};
