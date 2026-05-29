import BigNumber from 'bignumber.js';

import type {
  DualAccountBehaviorProfileDto,
  DualAccountBehaviorProfilesDto,
  ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ExecuteDualAccountVolumeStrategyDto,
} from '../config/strategy.dto';
import type {
  DualAccountBehaviorProfile,
  DualAccountVolumeStrategyParams,
  VolumeStrategyParams,
} from '../config/strategy-params.types';

export function mergeDualAccountConfigIntoRuntime(
  runtime: DualAccountVolumeStrategyParams,
  persisted?: Partial<DualAccountVolumeStrategyParams>,
): DualAccountVolumeStrategyParams {
  if (!persisted) {
    return runtime;
  }

  const merged: DualAccountVolumeStrategyParams = {
    ...runtime,
  };

  if (typeof persisted.exchangeName === 'string') {
    merged.exchangeName = readString(persisted.exchangeName, runtime.exchangeName);
  }

  if (typeof persisted.symbol === 'string') {
    merged.symbol = readString(persisted.symbol, runtime.symbol);
  }

  if (typeof persisted.pair === 'string') {
    merged.pair = readString(persisted.pair, runtime.pair || merged.symbol);
    if (!readString(merged.symbol)) {
      merged.symbol = merged.pair;
    }
  }

  if (Number.isFinite(Number(persisted.baseIncrementPercentage))) {
    merged.baseIncrementPercentage = Number(persisted.baseIncrementPercentage);
  }

  if (Number.isFinite(Number(persisted.baseIntervalTime))) {
    merged.baseIntervalTime = Number(persisted.baseIntervalTime);
  }

  if (Number.isFinite(Number(persisted.baseTradeAmount))) {
    merged.baseTradeAmount = Number(persisted.baseTradeAmount);
  }

  if (Number.isFinite(Number(persisted.numTrades))) {
    merged.numTrades = Number(persisted.numTrades);
  }

  if (Number.isFinite(Number(persisted.pricePushRate))) {
    merged.pricePushRate = Number(persisted.pricePushRate);
  }

  if (Number.isFinite(Number(persisted.tradeAmountVariance))) {
    merged.tradeAmountVariance = readNonNegativeNumber(
      persisted.tradeAmountVariance,
    );
  }

  if (Number.isFinite(Number(persisted.priceOffsetVariance))) {
    merged.priceOffsetVariance = readNonNegativeNumber(
      persisted.priceOffsetVariance,
    );
  }

  if (Number.isFinite(Number(persisted.cadenceVariance))) {
    merged.cadenceVariance = readNonNegativeNumber(persisted.cadenceVariance);
  }

  if (Number.isFinite(Number(persisted.buyBias))) {
    merged.buyBias = readUnitIntervalNumber(persisted.buyBias);
  }

  if (
    persisted.accountProfiles &&
    typeof persisted.accountProfiles === 'object' &&
    !Array.isArray(persisted.accountProfiles)
  ) {
    merged.accountProfiles =
      persisted.accountProfiles as DualAccountBehaviorProfilesDto;
  }

  if (
    persisted.postOnlySide === 'buy' ||
    persisted.postOnlySide === 'sell' ||
    persisted.postOnlySide === undefined
  ) {
    merged.postOnlySide = persisted.postOnlySide;
  }

  if (typeof persisted.dynamicRoleSwitching === 'boolean') {
    merged.dynamicRoleSwitching = persisted.dynamicRoleSwitching;
  }

  if (persisted.targetQuoteVolume === undefined) {
    merged.targetQuoteVolume = undefined;
  } else if (Number.isFinite(Number(persisted.targetQuoteVolume))) {
    merged.targetQuoteVolume = Number(persisted.targetQuoteVolume);
  }

  return merged;
}

export function resolveNextDualAccountCadenceMs(
  params: DualAccountVolumeStrategyParams,
): number {
  const baseCadenceSeconds = params.interval ?? params.baseIntervalTime ?? 10;
  const cadenceSeconds = isBestCapacityConfig(params)
    ? baseCadenceSeconds
    : applyVariance(baseCadenceSeconds, params.cadenceVariance);

  return Math.max(1000, cadenceSeconds * 1000);
}

export function resolveDualAccountBehaviorProfile(
  params: DualAccountVolumeStrategyParams,
  accountLabel: string,
): DualAccountBehaviorProfile {
  const profiles = params.accountProfiles;

  if (!profiles) {
    return {};
  }

  const candidate =
    accountLabel === params.makerAccountLabel
      ? profiles.maker
      : accountLabel === params.takerAccountLabel
      ? profiles.taker
      : undefined;

  return candidate ? normalizeBehaviorProfile(candidate) : {};
}

export function normalizeDualAccountStrategyParams(
  params: ExecuteDualAccountVolumeStrategyDto,
): DualAccountVolumeStrategyParams {
  const makerAccountLabel = String(params.makerAccountLabel || '').trim();
  const takerAccountLabel = String(params.takerAccountLabel || '').trim();

  if (!makerAccountLabel || !takerAccountLabel) {
    throw new Error(
      'Dual account volume strategy requires makerAccountLabel and takerAccountLabel',
    );
  }

  if (makerAccountLabel === takerAccountLabel) {
    throw new Error(
      'Dual account volume strategy requires different maker and taker account labels',
    );
  }

  const pair = resolveStrategyInputPair(params.symbol, params.pair);

  return {
    exchangeName: String(params.exchangeName || '').trim(),
    symbol: pair,
    pair,
    baseIncrementPercentage: Number(params.baseIncrementPercentage || 0),
    baseIntervalTime: Number(params.baseIntervalTime || 10),
    baseTradeAmount: Number(params.baseTradeAmount || 0),
    numTrades: Number(params.numTrades || 0),
    userId: params.userId,
    clientId: params.clientId,
    pricePushRate: Number(params.pricePushRate || 0),
    executionCategory: 'clob_cex',
    executionVenue: 'cex',
    postOnlySide: params.postOnlySide,
    makerAccountLabel,
    takerAccountLabel,
    tradeAmountVariance: readNonNegativeNumber(params.tradeAmountVariance),
    priceOffsetVariance: readNonNegativeNumber(params.priceOffsetVariance),
    cadenceVariance: readNonNegativeNumber(params.cadenceVariance),
    buyBias: readUnitIntervalNumber(params.buyBias),
    accountProfiles: params.accountProfiles,
    dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
    targetQuoteVolume:
      params.targetQuoteVolume !== undefined
        ? Number(params.targetQuoteVolume)
        : undefined,
    publishedCycles: 0,
    completedCycles: 0,
    cycleMode: params.cycleMode || 'alternating',
    makerProtectionMode: params.makerProtectionMode || 'alive_only',
    nextMakerAccountLabel: params.makerAccountLabel,
    nextTakerAccountLabel: params.takerAccountLabel,
    orderBookReady: false,
    consecutiveFallbackCycles: 0,
    tradedQuoteVolume: 0,
    realizedPnlQuote: 0,
    inventoryBaseQty: 0,
    inventoryCostQuote: 0,
  };
}

export function normalizeDualAccountBestCapacityStrategyParams(
  params: ExecuteDualAccountBestCapacityVolumeStrategyDto,
): DualAccountVolumeStrategyParams {
  const makerAccountLabel = String(params.makerAccountLabel || '').trim();
  const takerAccountLabel = String(params.takerAccountLabel || '').trim();

  if (!makerAccountLabel || !takerAccountLabel) {
    throw new Error(
      'Dual account best-capacity strategy requires makerAccountLabel and takerAccountLabel',
    );
  }

  if (makerAccountLabel === takerAccountLabel) {
    throw new Error(
      'Dual account best-capacity strategy requires different maker and taker account labels',
    );
  }

  const maxOrderAmount = Number(params.maxOrderAmount || 0);
  const interval = Number(params.interval || 10);
  const dailyVolumeTarget =
    params.dailyVolumeTarget !== undefined
      ? Number(params.dailyVolumeTarget)
      : undefined;
  const pair = resolveStrategyInputPair(params.symbol, params.pair);

  return {
    exchangeName: String(params.exchangeName || '').trim(),
    symbol: pair,
    pair,
    baseIncrementPercentage: 0,
    baseIntervalTime: interval,
    baseTradeAmount: maxOrderAmount,
    maxOrderAmount,
    interval,
    numTrades: 0,
    userId: params.userId,
    clientId: params.clientId,
    pricePushRate: 0,
    executionCategory: 'clob_cex',
    executionVenue: 'cex',
    makerAccountLabel,
    takerAccountLabel,
    dailyVolumeTarget,
    targetQuoteVolume: dailyVolumeTarget,
    publishedCycles: 0,
    completedCycles: 0,
    cycleMode: params.cycleMode || 'alternating',
    makerProtectionMode: params.makerProtectionMode || 'alive_only',
    nextMakerAccountLabel: params.makerAccountLabel,
    nextTakerAccountLabel: params.takerAccountLabel,
    orderBookReady: false,
    consecutiveFallbackCycles: 0,
    tradedQuoteVolume: 0,
    realizedPnlQuote: 0,
    inventoryBaseQty: 0,
    inventoryCostQuote: 0,
  };
}

export function isBestCapacityConfig(
  params: DualAccountVolumeStrategyParams,
): boolean {
  return Number.isFinite(Number(params.maxOrderAmount));
}

export function resolveStrategyInputPair(symbol: unknown, pair: unknown): string {
  return readString(symbol, readString(pair));
}

export function resolveRuntimePair(
  params: Pick<VolumeStrategyParams, 'symbol' | 'pair'>,
): string {
  return readString(params.symbol, readString(params.pair));
}

export function normalizeBehaviorProfile(
  profile: Partial<DualAccountBehaviorProfileDto>,
): DualAccountBehaviorProfile {
  return {
    tradeAmountMultiplier: profile.tradeAmountMultiplier,
    tradeAmountVariance: profile.tradeAmountVariance,
    priceOffsetMultiplier: profile.priceOffsetMultiplier,
    priceOffsetVariance: profile.priceOffsetVariance,
    cadenceMultiplier: profile.cadenceMultiplier,
    cadenceVariance: profile.cadenceVariance,
    buyBias: profile.buyBias,
    activeHours: profile.activeHours,
  };
}

export function applyVariance(
  baseValue: number,
  variance?: number,
  multiplier?: number,
  varianceSample?: number,
): number {
  const normalizedBase = new BigNumber(baseValue);

  if (!normalizedBase.isFinite()) {
    return normalizedBase.toNumber();
  }

  const normalizedMultiplier =
    multiplier !== undefined ? readPositiveNumber(multiplier) ?? 1 : 1;
  const effectiveBase = normalizedBase.multipliedBy(normalizedMultiplier);
  const normalizedVariance = readNonNegativeNumber(variance);

  if (!normalizedVariance || normalizedVariance <= 0) {
    return effectiveBase.toNumber();
  }

  const sample = readUnitIntervalNumber(varianceSample) ?? Math.random();
  const swing = new BigNumber(sample * 2 - 1).multipliedBy(
    normalizedVariance,
  );

  return effectiveBase.multipliedBy(new BigNumber(1).plus(swing)).toNumber();
}

export function readPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function readNonNegativeNumber(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function readUnitIntervalNumber(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : undefined;
}

export function isWithinDualAccountProfileWindow(
  profile: DualAccountBehaviorProfile,
): boolean {
  if (!profile.activeHours?.length) {
    return true;
  }

  return profile.activeHours.includes(new Date().getHours());
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback;
}
