import { _ } from "svelte-i18n";
import { get } from "svelte/store";
import BigNumber from "bignumber.js";

export interface ExchangeMarketAmountLimits {
  amount?: {
    min?: number | string | null;
  };
  cost?: {
    min?: number | string | null;
  };
}

export interface ExchangeMarketMetadata {
  symbol?: string;
  limits?: ExchangeMarketAmountLimits;
}

export interface InventoryBalanceSummary {
  asset: string;
  free: string;
  used: string;
  total: string;
  accountLabel?: string;
}

export interface InventorySkewAllocation {
  baseAsset: string;
  quoteAsset: string;
  basePercent: number;
  quotePercent: number;
}

const errorKeyMap: Record<string, string> = {
  "API key not found": "admin_direct_mm_error_api_key_not_found",
  "API key exchange does not match request":
    "admin_direct_mm_error_api_key_exchange_mismatch",
  "API key must have read-trade permissions":
    "admin_direct_mm_error_api_key_permissions",
  "API key account label does not match request":
    "admin_direct_mm_error_api_key_account_mismatch",
  "Strategy definition not found": "admin_direct_mm_error_definition_not_found",
  "Order not found": "admin_direct_mm_error_order_not_found",
  "Order already stopped": "admin_direct_mm_error_already_stopped",
  "Only stopped or failed orders can be removed":
    "admin_direct_mm_error_remove_requires_stopped",
  "API key authentication failed": "admin_direct_mm_error_authentication",
  "Rate limited, try again": "admin_direct_mm_error_rate_limit",
  "Exchange timeout": "admin_direct_mm_error_timeout",
  "Campaign join already exists": "admin_direct_mm_error_campaign_join_exists",
};

export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const key = errorKeyMap[message];

  return key ? get(_)(key) : message;
}

export function getRecoveryHint(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const $_ = get(_);

  if (message.includes("API key")) {
    return $_("admin_direct_mm_recovery_api_keys");
  }
  if (message.includes("Strategy definition")) {
    return $_("admin_direct_mm_recovery_strategy");
  }

  return $_("admin_direct_mm_recovery_retry");
}

export function getBadgeClass(state: string): string {
  if (state === "joined") return "badge badge-success text-base-100";
  if (state === "created") return "badge badge-warning";
  return "badge";
}

export function getStateLabel(state: string): string {
  const $_ = get(_);
  const map: Record<string, string> = {
    active: "admin_direct_mm_state_running",
    running: "admin_direct_mm_state_running",
    created: "admin_direct_mm_state_created",
    stopped: "admin_direct_mm_state_stopped",
    failed: "admin_direct_mm_state_failed",
    joined: "admin_direct_mm_state_joined",
    gone: "admin_direct_mm_state_gone",
    stale: "admin_direct_mm_state_stale",
  };

  return $_(map[state] || "admin_direct_mm_state_unknown");
}

export function formatTimestamp(value: string | null): string {
  const $_ = get(_);
  if (!value) return $_("admin_direct_mm_na");

  return new Date(value).toLocaleString();
}

export function parseConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // not JSON, keep as string
  }
  return trimmed;
}

const typeI18nMap: Record<string, string> = {
  MARKET_MAKING: "admin_direct_mm_type_market_making",
  THRESHOLD: "admin_direct_mm_type_threshold",
  HOLDING: "admin_direct_mm_type_holding",
};

export function formatCampaignType(type: unknown): string {
  const key = String(type || "").toUpperCase();
  const i18nKey = typeI18nMap[key];
  return i18nKey ? get(_)(i18nKey) : String(type || "");
}

export function formatFundAmount(amount: unknown, decimals: unknown): string {
  if (!amount) return "—";
  const raw = String(amount);
  const dec = Number(decimals) || 0;
  if (dec <= 0) return raw;
  const bn = new BigNumber(raw);
  if (bn.isNaN()) return raw;
  return bn.dividedBy(new BigNumber(10).pow(dec)).toFormat();
}

export interface DualAccountVolumeFields {
  intervalTime: string;
  numTrades: string;
  pricePushRate: string;
  postOnlySide: string;
  dynamicRoleSwitching: boolean;
  targetQuoteVolume: string;
  cadenceVariance: string;
  tradeAmountVariance: string;
  priceOffsetVariance: string;
}

export interface StrategySchemaProperty {
  type?: string;
  enum?: string[];
  description?: string;
}

export interface StrategySchema {
  type?: string;
  required?: string[];
  properties?: Record<string, StrategySchemaProperty>;
}

const DIRECT_RESERVED_CONFIG_FIELDS = new Set([
  "userId",
  "clientId",
  "marketMakingOrderId",
  "pair",
  "symbol",
  "exchangeName",
  "accountLabel",
  "makerAccountLabel",
  "takerAccountLabel",
  "makerApiKeyId",
  "takerApiKeyId",
  "apiKeyId",
]);

function normalizeMarketSymbol(symbol: unknown): string {
  return String(symbol || "")
    .split(":")[0]
    .trim()
    .toUpperCase();
}

function readPositiveBigNumber(value: unknown): BigNumber | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const amount = new BigNumber(raw);

  if (!amount.isFinite() || !amount.isGreaterThan(0)) {
    return null;
  }

  return amount;
}

function readNonNegativeBigNumber(value: unknown): BigNumber {
  const amount = new BigNumber(String(value ?? "").trim() || 0);

  if (!amount.isFinite() || amount.isNegative()) {
    return new BigNumber(0);
  }

  return amount;
}

export function readPositiveOrderAmount(value: unknown): string {
  return readPositiveBigNumber(value)?.toString() || "";
}

function trimTrailingZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function formatOrderAmountForDisplay(
  value: unknown,
  amountStep?: unknown,
): string {
  const amount = readPositiveBigNumber(value);

  if (!amount) {
    return "";
  }

  const step = readPositiveBigNumber(amountStep);

  if (step) {
    const rounded = amount
      .dividedBy(step)
      .integerValue(BigNumber.ROUND_CEIL)
      .multipliedBy(step);
    const decimals = step.decimalPlaces() ?? 0;

    return trimTrailingZeros(rounded.toFixed(decimals));
  }

  const decimals = amount.isGreaterThanOrEqualTo(1)
    ? Math.min(amount.decimalPlaces() ?? 0, 4)
    : Math.min(amount.decimalPlaces() ?? 0, 8);

  return trimTrailingZeros(amount.toFixed(decimals));
}

function resolveDerivedPairPrice(
  basePrice: unknown,
  quotePrice: unknown,
): BigNumber | null {
  const base = readPositiveBigNumber(basePrice);
  const quote = readPositiveBigNumber(quotePrice);

  if (!base || !quote) {
    return null;
  }

  return base.dividedBy(quote);
}

export function resolveMinOrderAmount(
  persistedMinimum: unknown,
  exchangeMarkets: ExchangeMarketMetadata[],
  pair: string,
  basePrice?: unknown,
  quotePrice?: unknown,
): string {
  const candidates = [readPositiveBigNumber(persistedMinimum)].filter(
    (value): value is BigNumber => value !== null,
  );
  const normalizedPair = normalizeMarketSymbol(pair);

  if (!normalizedPair || exchangeMarkets.length === 0) {
    return candidates[0]?.toString() || "";
  }

  const market = exchangeMarkets.find(
    (item) => normalizeMarketSymbol(item?.symbol) === normalizedPair,
  );
  const marketAmountMinimum = readPositiveBigNumber(
    market?.limits?.amount?.min,
  );
  const marketCostMinimum = readPositiveBigNumber(market?.limits?.cost?.min);
  const derivedPairPrice = resolveDerivedPairPrice(basePrice, quotePrice);

  if (marketAmountMinimum) {
    candidates.push(marketAmountMinimum);
  }

  if (marketCostMinimum && derivedPairPrice) {
    candidates.push(marketCostMinimum.dividedBy(derivedPairPrice));
  }

  if (candidates.length === 0) {
    return "";
  }

  return candidates
    .reduce((maximum, candidate) =>
      candidate.isGreaterThan(maximum) ? candidate : maximum,
    )
    .toString();
}

export function resolveInventorySkewAllocation(
  balances: InventoryBalanceSummary[],
  pair: string,
  bid?: unknown,
  ask?: unknown,
): InventorySkewAllocation | null {
  if (!balances || balances.length < 2) {
    return null;
  }

  const [baseAsset, quoteAsset] = String(pair || "")
    .split("/")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!baseAsset || !quoteAsset) {
    return null;
  }

  const baseBalance = balances.find(
    (balance) => String(balance.asset || "").trim().toUpperCase() === baseAsset.toUpperCase(),
  );
  const quoteBalance = balances.find(
    (balance) => String(balance.asset || "").trim().toUpperCase() === quoteAsset.toUpperCase(),
  );

  if (!baseBalance || !quoteBalance) {
    return null;
  }

  const bidPrice = readPositiveBigNumber(bid);
  const askPrice = readPositiveBigNumber(ask);
  const pairPrice = bidPrice && askPrice
    ? bidPrice.plus(askPrice).dividedBy(2)
    : bidPrice || askPrice;

  if (!pairPrice || !pairPrice.isFinite() || !pairPrice.isGreaterThan(0)) {
    return null;
  }

  const baseValueInQuote = readNonNegativeBigNumber(baseBalance.total).multipliedBy(pairPrice);
  const quoteValue = readNonNegativeBigNumber(quoteBalance.total);
  const portfolioValue = baseValueInQuote.plus(quoteValue);

  if (!portfolioValue.isGreaterThan(0)) {
    return null;
  }

  const basePercent = baseValueInQuote
    .dividedBy(portfolioValue)
    .multipliedBy(100)
    .decimalPlaces(0, BigNumber.ROUND_HALF_UP)
    .toNumber();

  return {
    baseAsset: baseBalance.asset,
    quoteAsset: quoteBalance.asset,
    basePercent,
    quotePercent: 100 - basePercent,
  };
}

export function isDualDirectOrderControllerType(controllerType: unknown): boolean {
  return (
    controllerType === "dualAccountVolume" ||
    controllerType === "dualAccountBestCapacityVolume"
  );
}

export function isBestCapacityDirectOrderControllerType(
  controllerType: unknown,
): boolean {
  return controllerType === "dualAccountBestCapacityVolume";
}

export function isSchemaDrivenDirectOrderControllerType(
  controllerType: unknown,
): boolean {
  if (!controllerType) return false;
  return !(
    controllerType === "pureMarketMaking" ||
    controllerType === "dualAccountVolume" ||
    controllerType === "dualAccountBestCapacityVolume"
  );
}

export function isKnownDirectStrategyControllerType(
  controllerType: unknown,
): boolean {
  return (
    controllerType === "pureMarketMaking" ||
    controllerType === "dualAccountVolume" ||
    controllerType === "dualAccountBestCapacityVolume"
  );
}

export function isDualAccountOrder(
  order: { directExecutionMode?: string | null; controllerType?: string; makerAccountLabel?: string; takerAccountLabel?: string },
): boolean {
  if (order.directExecutionMode === "dual_account") {
    return true;
  }
  if (order.directExecutionMode === "single_account") {
    return false;
  }
  if (
    order.makerAccountLabel &&
    order.takerAccountLabel
  ) {
    return true;
  }

  return isDualDirectOrderControllerType(order.controllerType);
}

export function aggregateBalancesByAsset(
  balances: InventoryBalanceSummary[],
): InventoryBalanceSummary[] {
  const map = new Map<string, { free: BigNumber; used: BigNumber; total: BigNumber }>();
  for (const b of balances) {
    const key = String(b.asset || "").trim().toUpperCase();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.free = existing.free.plus(readNonNegativeBigNumber(b.free));
      existing.used = existing.used.plus(readNonNegativeBigNumber(b.used));
      existing.total = existing.total.plus(readNonNegativeBigNumber(b.total));
    } else {
      map.set(key, {
        free: readNonNegativeBigNumber(b.free),
        used: readNonNegativeBigNumber(b.used),
        total: readNonNegativeBigNumber(b.total),
      });
    }
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    asset: key,
    free: v.free.toString(),
    used: v.used.toString(),
    total: v.total.toString(),
  }));
}

export function normalizeConfigOverrides(
  controllerType: string,
  configRows: { key: string; value: string }[],
  orderAmount: string,
  orderSpread: string,
  dualFields?: DualAccountVolumeFields,
): Record<string, unknown> {
  const isDualAccountStrategy = isDualDirectOrderControllerType(controllerType);
  const accumulator = configRows.reduce<Record<string, unknown>>((acc, row) => {
    const key = row.key.trim();

    if (!key || DIRECT_RESERVED_CONFIG_FIELDS.has(key)) return acc;
    acc[key] = parseConfigValue(row.value);
    return acc;
  }, {});
  if (orderAmount) {
    const num = Number(orderAmount);
    const value = isNaN(num) ? orderAmount : num;

    if (controllerType === "dualAccountBestCapacityVolume") {
      accumulator["maxOrderAmount"] = value;
    } else if (isDualAccountStrategy) {
      accumulator["baseTradeAmount"] = value;
    } else {
      accumulator["orderAmount"] = value;
    }
  }
  if (orderSpread) {
    const num = Number(orderSpread);
    const value = isNaN(num) ? orderSpread : num;

    if (controllerType === "dualAccountBestCapacityVolume") {
      // Best-capacity strategy does not use spread configuration.
    } else if (isDualAccountStrategy) {
      accumulator["baseIncrementPercentage"] = value;
    } else {
      accumulator["bidSpread"] = value;
      accumulator["askSpread"] = value;
    }
  }
  if (isDualAccountStrategy && dualFields) {
    if (controllerType === "dualAccountBestCapacityVolume") {
      if (dualFields.intervalTime) {
        const num = Number(dualFields.intervalTime);
        if (!isNaN(num)) accumulator["interval"] = num;
      }
      if (dualFields.targetQuoteVolume) {
        const num = Number(dualFields.targetQuoteVolume);
        if (!isNaN(num)) accumulator["dailyVolumeTarget"] = num;
      }

      return accumulator;
    }

    if (dualFields.intervalTime) {
      const num = Number(dualFields.intervalTime);
      if (!isNaN(num)) accumulator["baseIntervalTime"] = num;
    }
    if (dualFields.numTrades) {
      const num = Number(dualFields.numTrades);
      if (!isNaN(num)) accumulator["numTrades"] = num;
    }
    if (dualFields.pricePushRate) {
      const num = Number(dualFields.pricePushRate);
      if (!isNaN(num)) accumulator["pricePushRate"] = num;
    }
    if (dualFields.postOnlySide) {
      accumulator["postOnlySide"] = dualFields.postOnlySide;
    }
    if (dualFields.dynamicRoleSwitching) {
      accumulator["dynamicRoleSwitching"] = true;
    }
    if (dualFields.targetQuoteVolume) {
      const num = Number(dualFields.targetQuoteVolume);
      if (!isNaN(num)) accumulator["targetQuoteVolume"] = num;
    }
    if (dualFields.cadenceVariance) {
      const num = Number(dualFields.cadenceVariance);
      if (!isNaN(num)) accumulator["cadenceVariance"] = num;
    }
    if (dualFields.tradeAmountVariance) {
      const num = Number(dualFields.tradeAmountVariance);
      if (!isNaN(num)) accumulator["tradeAmountVariance"] = num;
    }
    if (dualFields.priceOffsetVariance) {
      const num = Number(dualFields.priceOffsetVariance);
      if (!isNaN(num)) accumulator["priceOffsetVariance"] = num;
    }
  }
  return accumulator;
}

export function buildGenericSchemaConfigOverrides(
  schema: StrategySchema | undefined,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema?.properties || {};

  return Object.entries(config).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (
        DIRECT_RESERVED_CONFIG_FIELDS.has(key) ||
        !(key in properties) ||
        value === "" ||
        value === undefined
      ) {
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {},
  );
}
