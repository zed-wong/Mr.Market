import type { Side } from 'src/common/constants/side';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

const DEFAULT_VOLUME_CADENCE_SECONDS = 10;
const MIN_CADENCE_MS = 1000;

type NormalizedVolumeRerunConfig = {
  exchangeName?: string;
  symbol?: string;
  baseIncrementPercentage: number;
  baseIntervalTime: number;
  baseTradeAmount: number;
  numTrades: number;
  userId: string;
  clientId: string;
  pricePushRate: number;
  postOnlySide?: Side;
  executionVenue?: string;
  dexId?: string;
  chainId?: number;
  tokenIn?: string;
  tokenOut?: string;
  feeTier?: number;
  slippageBps?: number;
  recipient?: string;
  executionCategory?: string;
  tradeAmountVariance?: number;
  priceOffsetVariance?: number;
  cadenceVariance?: number;
  buyBias?: number;
  accountProfiles?: Record<string, unknown>;
};

export function sanitizeVolumeCadenceMs(value: unknown): number {
  const seconds = readFiniteNumber(value);
  const effectiveSeconds =
    seconds !== undefined && seconds > 0
      ? seconds
      : DEFAULT_VOLUME_CADENCE_SECONDS;

  return Math.max(MIN_CADENCE_MS, effectiveSeconds * 1000);
}

export function normalizeVolumeRerunConfig(
  strategyInstance: StrategyInstance,
): NormalizedVolumeRerunConfig {
  const parameters = strategyInstance.parameters || {};

  return {
    exchangeName: readString(parameters.exchangeName),
    symbol: readString(parameters.symbol),
    baseIncrementPercentage:
      readFiniteNumber(parameters.baseIncrementPercentage) ??
      readFiniteNumber(parameters.incrementPercentage) ??
      0,
    baseIntervalTime:
      readFiniteNumber(parameters.baseIntervalTime) ??
      readFiniteNumber(parameters.intervalTime) ??
      DEFAULT_VOLUME_CADENCE_SECONDS,
    baseTradeAmount:
      readFiniteNumber(parameters.baseTradeAmount) ??
      readFiniteNumber(parameters.tradeAmount) ??
      0,
    numTrades: readFiniteNumber(parameters.numTrades) ?? 1,
    userId: strategyInstance.userId,
    clientId: strategyInstance.clientId,
    pricePushRate: readFiniteNumber(parameters.pricePushRate) ?? 0,
    postOnlySide: readSide(parameters.postOnlySide),
    executionVenue: readString(parameters.executionVenue),
    dexId: readString(parameters.dexId),
    chainId: readFiniteNumber(parameters.chainId),
    tokenIn: readString(parameters.tokenIn),
    tokenOut: readString(parameters.tokenOut),
    feeTier: readFiniteNumber(parameters.feeTier),
    slippageBps: readFiniteNumber(parameters.slippageBps),
    recipient: readString(parameters.recipient),
    executionCategory: readString(parameters.executionCategory),
    tradeAmountVariance: readFiniteNumber(parameters.tradeAmountVariance),
    priceOffsetVariance: readFiniteNumber(parameters.priceOffsetVariance),
    cadenceVariance: readFiniteNumber(parameters.cadenceVariance),
    buyBias: readFiniteNumber(parameters.buyBias),
    accountProfiles: readRecord(parameters.accountProfiles),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : undefined;

  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function readSide(value: unknown): Side | undefined {
  return value === 'buy' || value === 'sell' ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
