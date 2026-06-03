import BigNumber from 'bignumber.js';

import type {
  DualAccountBehaviorProfileDto,
  DualAccountBehaviorProfilesDto,
  ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ExecuteDualAccountVolumeStrategyDto,
  ExecuteEfficientDualAccountVolumeStrategyDto,
} from '../config/strategy.dto';
import type {
  DualAccountBehaviorProfile,
  DualAccountSafetyBufferConfig,
  DualAccountVolumeStrategyParams,
  EfficientDualAccountVolumeMode,
  VolumeStrategyParams,
} from '../config/strategy-params.types';

export const EFFICIENT_DUAL_ACCOUNT_VOLUME_MODES = [
  'cheapest_capital',
  'balanced',
  'fastest_volume',
] as const satisfies readonly EfficientDualAccountVolumeMode[];

export const EFFICIENT_DUAL_ACCOUNT_VOLUME_STRATEGY_CONTRACT =
  'efficientDualAccountVolume' as const;

export const DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER: DualAccountSafetyBufferConfig =
  {
    kind: 'default_formula',
    exchangeCostMinMultiplier: 0.5,
    feeCostMultiplier: 2,
  };

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
    merged.exchangeName = readString(
      persisted.exchangeName,
      runtime.exchangeName,
    );
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

  if (typeof persisted.marketMakingOrderId === 'string') {
    merged.marketMakingOrderId = readString(
      persisted.marketMakingOrderId,
      runtime.marketMakingOrderId,
    );
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

  if (isEfficientDualAccountMode(persisted.mode)) {
    merged.mode = persisted.mode;
  }

  if (
    persisted.strategyContract ===
    EFFICIENT_DUAL_ACCOUNT_VOLUME_STRATEGY_CONTRACT
  ) {
    merged.strategyContract = persisted.strategyContract;
  }

  if (
    persisted.safetyBuffer &&
    typeof persisted.safetyBuffer === 'object' &&
    !Array.isArray(persisted.safetyBuffer)
  ) {
    merged.safetyBuffer = persisted.safetyBuffer;
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
    marketMakingOrderId: params.marketMakingOrderId || params.clientId,
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
    marketMakingOrderId: params.marketMakingOrderId || params.clientId,
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

export function normalizeEfficientDualAccountVolumeStrategyParams(
  params: ExecuteEfficientDualAccountVolumeStrategyDto,
): DualAccountVolumeStrategyParams {
  const normalized = normalizeEfficientDualAccountVolumeConfig(
    params as unknown as Record<string, unknown>,
    {
      requireAccounts: true,
      requireMarket: true,
    },
  ) as unknown as ExecuteEfficientDualAccountVolumeStrategyDto;

  const maxOrderAmount = Number(normalized.maxOrderAmount);
  const interval = Number(normalized.interval || 10);
  const dailyVolumeTarget =
    normalized.dailyVolumeTarget !== undefined
      ? Number(normalized.dailyVolumeTarget)
      : normalized.targetQuoteVolume !== undefined
      ? Number(normalized.targetQuoteVolume)
      : undefined;
  const pair = resolveStrategyInputPair(normalized.symbol, normalized.pair);

  return {
    exchangeName: String(normalized.exchangeName || '').trim(),
    symbol: pair,
    pair,
    baseIncrementPercentage: 0,
    baseIntervalTime: interval,
    baseTradeAmount: maxOrderAmount,
    maxOrderAmount,
    interval,
    numTrades: 0,
    userId: normalized.userId,
    clientId: normalized.clientId,
    marketMakingOrderId: normalized.marketMakingOrderId || normalized.clientId,
    pricePushRate: 0,
    executionCategory: 'clob_cex',
    executionVenue: 'cex',
    makerAccountLabel: String(normalized.makerAccountLabel || '').trim(),
    takerAccountLabel: String(normalized.takerAccountLabel || '').trim(),
    dailyVolumeTarget,
    targetQuoteVolume: dailyVolumeTarget,
    tradeAmountVariance: readOptionalUnitIntervalNumber(
      normalized.tradeAmountVariance,
      'tradeAmountVariance',
    ),
    priceOffsetVariance: readOptionalUnitIntervalNumber(
      normalized.priceOffsetVariance,
      'priceOffsetVariance',
    ),
    mode: normalized.mode || 'balanced',
    strategyContract: EFFICIENT_DUAL_ACCOUNT_VOLUME_STRATEGY_CONTRACT,
    safetyBuffer: normalizeSafetyBuffer(normalized.safetyBuffer),
    publishedCycles: 0,
    completedCycles: 0,
    cycleMode: normalized.cycleMode || 'alternating',
    makerProtectionMode: normalized.makerProtectionMode || 'alive_only',
    dynamicRoleSwitching:
      normalized.dynamicRoleSwitching === undefined
        ? true
        : normalized.dynamicRoleSwitching,
    nextMakerAccountLabel: normalized.makerAccountLabel,
    nextTakerAccountLabel: normalized.takerAccountLabel,
    orderBookReady: false,
    consecutiveFallbackCycles: 0,
    tradedQuoteVolume: 0,
    realizedPnlQuote: 0,
    inventoryBaseQty: 0,
    inventoryCostQuote: 0,
  };
}

export function normalizeEfficientDualAccountVolumeConfig(
  params: Record<string, unknown>,
  options: {
    requireAccounts?: boolean;
    requireMarket?: boolean;
  } = {},
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...params,
  };
  const exchangeName = readString(normalized.exchangeName);
  const pair = resolveStrategyInputPair(normalized.symbol, normalized.pair);

  if (options.requireMarket && !exchangeName) {
    throw new Error(
      'Efficient dual account volume strategy requires exchangeName',
    );
  }

  if (exchangeName) {
    normalized.exchangeName = exchangeName;
  }

  if (options.requireMarket && !pair) {
    throw new Error('Efficient dual account volume strategy requires pair');
  }

  if (pair) {
    if (!isValidTradingPair(pair)) {
      throw new Error(
        'Efficient dual account volume strategy requires a valid pair like BASE/QUOTE',
      );
    }
    normalized.symbol = pair;
    normalized.pair = pair;
  }

  const makerAccountLabel = readString(normalized.makerAccountLabel);
  const takerAccountLabel = readString(normalized.takerAccountLabel);

  if (options.requireAccounts && (!makerAccountLabel || !takerAccountLabel)) {
    throw new Error(
      'Efficient dual account volume strategy requires makerAccountLabel and takerAccountLabel',
    );
  }

  if (makerAccountLabel) {
    normalized.makerAccountLabel = makerAccountLabel;
  }

  if (takerAccountLabel) {
    normalized.takerAccountLabel = takerAccountLabel;
  }

  if (
    makerAccountLabel &&
    takerAccountLabel &&
    makerAccountLabel === takerAccountLabel
  ) {
    throw new Error(
      'Efficient dual account volume strategy requires different maker and taker account labels',
    );
  }

  normalized.mode = normalizeEfficientDualAccountMode(normalized.mode);
  normalized.cycleMode = normalizeCycleMode(normalized.cycleMode);
  normalized.dynamicRoleSwitching = normalizeDynamicRoleSwitching(
    normalized.dynamicRoleSwitching,
  );
  normalized.strategyContract = EFFICIENT_DUAL_ACCOUNT_VOLUME_STRATEGY_CONTRACT;
  normalized.safetyBuffer = normalizeSafetyBuffer(normalized.safetyBuffer);

  if (normalized.maxOrderAmount !== undefined) {
    normalized.maxOrderAmount = readRequiredPositiveNumber(
      normalized.maxOrderAmount,
      'maxOrderAmount',
    );
  }

  if (normalized.baseTradeAmount !== undefined) {
    normalized.baseTradeAmount = readRequiredPositiveNumber(
      normalized.baseTradeAmount,
      'baseTradeAmount',
    );
  }

  if (
    options.requireMarket &&
    normalized.maxOrderAmount === undefined &&
    normalized.baseTradeAmount === undefined
  ) {
    throw new Error(
      'Efficient dual account volume strategy requires a positive maxOrderAmount',
    );
  }

  if (normalized.interval !== undefined) {
    normalized.interval = readRequiredPositiveNumber(
      normalized.interval,
      'interval',
    );
  }

  if (normalized.baseIntervalTime !== undefined) {
    normalized.baseIntervalTime = readRequiredPositiveNumber(
      normalized.baseIntervalTime,
      'baseIntervalTime',
    );
  }

  if (normalized.maxNotional !== undefined) {
    normalized.maxNotional = readRequiredPositiveNumber(
      normalized.maxNotional,
      'maxNotional',
    );
  }

  if (normalized.cooldownSeconds !== undefined) {
    normalized.cooldownSeconds = readRequiredPositiveNumber(
      normalized.cooldownSeconds,
      'cooldownSeconds',
    );
  }

  if (normalized.dailyVolumeTarget !== undefined) {
    normalized.dailyVolumeTarget = readRequiredNonNegativeNumber(
      normalized.dailyVolumeTarget,
      'dailyVolumeTarget',
    );
  }

  if (normalized.targetQuoteVolume !== undefined) {
    normalized.targetQuoteVolume = readRequiredNonNegativeNumber(
      normalized.targetQuoteVolume,
      'targetQuoteVolume',
    );
  }

  if (normalized.tradeAmountVariance !== undefined) {
    normalized.tradeAmountVariance = readOptionalUnitIntervalNumber(
      normalized.tradeAmountVariance,
      'tradeAmountVariance',
    );
  }

  if (normalized.priceOffsetVariance !== undefined) {
    normalized.priceOffsetVariance = readOptionalUnitIntervalNumber(
      normalized.priceOffsetVariance,
      'priceOffsetVariance',
    );
  }

  return normalized;
}

export function isBestCapacityConfig(
  params: DualAccountVolumeStrategyParams,
): boolean {
  return (
    params.strategyContract ===
      EFFICIENT_DUAL_ACCOUNT_VOLUME_STRATEGY_CONTRACT ||
    Number.isFinite(Number(params.maxOrderAmount))
  );
}

export function isEfficientDualAccountMode(
  mode: unknown,
): mode is EfficientDualAccountVolumeMode {
  return EFFICIENT_DUAL_ACCOUNT_VOLUME_MODES.includes(
    mode as EfficientDualAccountVolumeMode,
  );
}

export function resolveStrategyInputPair(
  symbol: unknown,
  pair: unknown,
): string {
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
  const swing = new BigNumber(sample * 2 - 1).multipliedBy(normalizedVariance);

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

function normalizeEfficientDualAccountMode(
  mode: unknown,
): EfficientDualAccountVolumeMode {
  if (mode === undefined || mode === null || mode === '') {
    return 'balanced';
  }

  if (isEfficientDualAccountMode(mode)) {
    return mode;
  }

  throw new Error(
    `Efficient dual account volume strategy mode must be one of: ${EFFICIENT_DUAL_ACCOUNT_VOLUME_MODES.join(
      ', ',
    )}`,
  );
}

function normalizeCycleMode(cycleMode: unknown): 'alternating' | 'static' {
  if (cycleMode === undefined || cycleMode === null || cycleMode === '') {
    return 'alternating';
  }

  if (cycleMode === 'alternating' || cycleMode === 'static') {
    return 'alternating';
  }

  throw new Error(
    'Efficient dual account volume strategy cycleMode must be alternating or static',
  );
}

function normalizeDynamicRoleSwitching(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (typeof value === 'boolean') {
    return true;
  }

  throw new Error(
    'Efficient dual account volume strategy dynamicRoleSwitching must be boolean',
  );
}

function normalizeSafetyBuffer(value: unknown): DualAccountSafetyBufferConfig {
  if (value === undefined || value === null || value === '') {
    return { ...DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'Efficient dual account volume strategy safetyBuffer must be an object',
    );
  }

  const buffer = value as Partial<DualAccountSafetyBufferConfig>;
  const exchangeCostMinMultiplier = readRequiredNonNegativeNumber(
    buffer.exchangeCostMinMultiplier ??
      DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER.exchangeCostMinMultiplier,
    'safetyBuffer.exchangeCostMinMultiplier',
  );
  const feeCostMultiplier = readRequiredNonNegativeNumber(
    buffer.feeCostMultiplier ??
      DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER.feeCostMultiplier,
    'safetyBuffer.feeCostMultiplier',
  );

  return {
    kind: 'default_formula',
    exchangeCostMinMultiplier,
    feeCostMultiplier,
  };
}

function readRequiredPositiveNumber(value: unknown, field: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Efficient dual account volume strategy ${field} must be positive`,
    );
  }

  return parsed;
}

function readRequiredNonNegativeNumber(value: unknown, field: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Efficient dual account volume strategy ${field} must be non-negative`,
    );
  }

  return parsed;
}

function readOptionalUnitIntervalNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(
      `Efficient dual account volume strategy ${field} must be between 0 and 1`,
    );
  }

  return parsed;
}

function isValidTradingPair(pair: string): boolean {
  const [base, quote, extra] = pair.split('/');

  return Boolean(base?.trim() && quote?.trim() && !extra);
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
