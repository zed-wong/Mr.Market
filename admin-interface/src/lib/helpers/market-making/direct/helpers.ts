import { _ } from "svelte-i18n";
import { get } from "svelte/store";
import BigNumber from "bignumber.js";
import type {
  DirectReadinessBalance,
  DirectReadinessBlockingReason,
  DirectReadinessCapitalRequirement,
  DirectReadinessMissingBalance,
  DirectReadinessResult,
  DirectRuntimeCycle,
  DirectRuntimeCycleLeg,
  DirectRuntimeCycleLegRole,
} from "$lib/types/hufi/admin-direct-market-making";

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

export interface DirectOrderActionState {
  state?: string | null;
  runtimeState?: string | null;
}

export interface DirectOrderActionAvailability {
  canStop: boolean;
  canResume: boolean;
  canRemove: boolean;
}

export interface DirectRuntimeLifecycleView {
  label: string;
  tone: "success" | "warning" | "error" | "info";
  summary: string;
  canResumeNow: boolean;
  readinessGated: boolean;
}

export type {
  DirectOrderDiagnosis,
  DirectOrderDiagnosisEvidence,
  DirectOrderDiagnosisTone,
} from "./diagnosis-summary";
export {
  buildDirectOrderDiagnosis,
  explainDirectOrderWarning,
} from "./diagnosis-summary";

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
  if (state === "active" || state === "running" || state === "joined") return "badge bg-success/10 text-success border-success/20";
  if (state === "created" || state === "stale") return "badge bg-warning/10 text-warning border-warning/20";
  if (state === "failed" || state === "gone" || state === "deleted" || state === "removed") return "badge bg-error/10 text-error border-error/20";
  return "badge bg-base-content/5 text-base-content/60 border-base-300";
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
    deleted: "admin_direct_mm_state_deleted",
    removed: "admin_direct_mm_state_deleted",
  };

  return $_(map[state] || "admin_direct_mm_state_unknown");
}

function normalizeOrderLifecycleState(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

export function getDirectOrderActionAvailability(
  order: DirectOrderActionState | null | undefined,
): DirectOrderActionAvailability {
  const persistedState = normalizeOrderLifecycleState(order?.state);
  const runtimeState = normalizeOrderLifecycleState(order?.runtimeState);
  const effectiveRuntimeState = runtimeState || persistedState;
  const isPersistedStopped = persistedState === "stopped";
  const isPersistedPaused = persistedState === "paused";
  const isPersistedFailed = persistedState === "failed";
  const isGoneRunningOrder =
    persistedState === "running" && effectiveRuntimeState === "gone";
  const canStop =
    !isPersistedPaused &&
    !isPersistedStopped &&
    !isPersistedFailed &&
    ["active", "created", "failed", "gone", "running", "stale"].includes(effectiveRuntimeState);

  return {
    canStop,
    canResume: isPersistedStopped || isPersistedPaused,
    canRemove: isPersistedStopped || isPersistedFailed || isGoneRunningOrder,
  };
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
  mode?: EfficientDualAccountVolumeMode;
}

export type EfficientDualAccountVolumeMode =
  | "cheapest_capital"
  | "balanced"
  | "fastest_volume";

export interface DirectStrategyOptionLike {
  id: string;
  key?: string;
  name?: string;
  controllerType?: string;
  directExecutionMode?: string | null;
}

export interface EfficientDualAccountModeOption {
  value: EfficientDualAccountVolumeMode;
  label: string;
  description: string;
}

export type DirectReadinessSubmitStatus =
  | "missing"
  | "loading"
  | "failed"
  | "stale"
  | "blocked"
  | "ready";

export type DirectReadinessCapitalKind =
  | "current"
  | "minimum"
  | "recommended"
  | "maximum";

export interface DirectReadinessRefreshKeyInput {
  showStartForm: boolean;
  isEfficientDualAccountStrategy: boolean;
  exchangeName: string;
  pair: string;
  strategyDefinitionId: string;
  makerApiKeyId: string;
  takerApiKeyId: string;
  controllerType: string;
  orderAmount: string;
  orderSpread: string;
  intervalTime: string;
  numTrades: string;
  pricePushRate: string;
  postOnlySide: string;
  dynamicRoleSwitching: boolean;
  targetQuoteVolume: string;
  efficientMode: EfficientDualAccountVolumeMode;
  configRows: Array<{ key: string; value: string }>;
  genericConfig: Record<string, unknown>;
}

export interface DirectReadinessDisplayAmount {
  accountLabel: string;
  asset: string;
  value: string;
  label: string;
  testId: string;
}

export const EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE =
  "efficientDualAccountVolume";

export const EFFICIENT_DUAL_ACCOUNT_STRATEGY_KEY =
  "efficient-dual-account-volume";

const EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPES = new Set([
  EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
  "optimalDualAccountVolume",
]);

const EFFICIENT_DUAL_ACCOUNT_STRATEGY_KEYS = new Set([
  EFFICIENT_DUAL_ACCOUNT_STRATEGY_KEY,
  "efficient-dual-account-volume",
  "efficient_dual_account_volume",
  "optimal-dual-account-volume",
  "optimal_dual_account_volume",
]);

const LEGACY_DUAL_ACCOUNT_CONTROLLER_TYPES = new Set([
  "dualAccountVolume",
  "dualAccountBestCapacityVolume",
]);

const LEGACY_DUAL_ACCOUNT_STRATEGY_NAMES = new Set([
  "dual account volume",
  "dual account volume best capacity",
  "dual account best capacity volume",
]);

const LEGACY_DUAL_ACCOUNT_STRATEGY_KEYS = new Set([
  "dual-account-volume",
  "dual-account-best-capacity-volume",
]);

const SUPPORTED_EFFICIENT_DUAL_ACCOUNT_MODES: EfficientDualAccountVolumeMode[] =
  ["cheapest_capital", "balanced", "fastest_volume"];

export function normalizeEfficientDualAccountMode(
  value: unknown,
): EfficientDualAccountVolumeMode {
  return SUPPORTED_EFFICIENT_DUAL_ACCOUNT_MODES.includes(
    value as EfficientDualAccountVolumeMode,
  )
    ? (value as EfficientDualAccountVolumeMode)
    : "balanced";
}

export function getEfficientDualAccountModeOptions(): EfficientDualAccountModeOption[] {
  return [
    {
      value: "cheapest_capital",
      label: "Cheapest capital",
      description:
        "Prioritizes reusing available balances and minimizing extra capital.",
    },
    {
      value: "balanced",
      label: "Balanced",
      description:
        "Balances capital efficiency, volume pace, fees, and future cycle capacity.",
    },
    {
      value: "fastest_volume",
      label: "Fastest volume",
      description:
        "Prioritizes eligible cycle volume while still respecting exchange minimums.",
    },
  ];
}

export function buildDirectReadinessRefreshKey(
  input: DirectReadinessRefreshKeyInput,
): string {
  return JSON.stringify({
    showStartForm: input.showStartForm,
    isEfficientDualAccountStrategy: input.isEfficientDualAccountStrategy,
    exchangeName: input.exchangeName,
    pair: input.pair,
    strategyDefinitionId: input.strategyDefinitionId,
    makerApiKeyId: input.makerApiKeyId,
    takerApiKeyId: input.takerApiKeyId,
    controllerType: input.controllerType,
    orderAmount: input.orderAmount,
    orderSpread: input.orderSpread,
    intervalTime: input.intervalTime,
    numTrades: input.numTrades,
    pricePushRate: input.pricePushRate,
    postOnlySide: input.postOnlySide,
    dynamicRoleSwitching: input.dynamicRoleSwitching,
    targetQuoteVolume: input.targetQuoteVolume,
    efficientMode: normalizeEfficientDualAccountMode(input.efficientMode),
    configRows: input.configRows.map((row) => ({
      key: String(row.key ?? ""),
      value: String(row.value ?? ""),
    })),
    genericConfig: input.genericConfig,
  });
}

export function isEfficientDualAccountControllerType(
  controllerType: unknown,
): boolean {
  return EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPES.has(
    String(controllerType || ""),
  );
}

export function isLegacyDualAccountControllerType(
  controllerType: unknown,
): boolean {
  return LEGACY_DUAL_ACCOUNT_CONTROLLER_TYPES.has(String(controllerType || ""));
}

export function isEfficientDualAccountStrategy(
  strategy: DirectStrategyOptionLike | null | undefined,
): boolean {
  if (!strategy) return false;
  const key = String(strategy.key || "").trim();
  const normalizedKey = normalizeDirectStrategyText(strategy.key).replace(
    /\s+/g,
    "-",
  );
  const name = normalizeDirectStrategyText(strategy.name);
  return (
    isEfficientDualAccountControllerType(strategy.controllerType) ||
    EFFICIENT_DUAL_ACCOUNT_STRATEGY_KEYS.has(key) ||
    EFFICIENT_DUAL_ACCOUNT_STRATEGY_KEYS.has(normalizedKey) ||
    /(?:efficient|optimal)\s+dual\s+account\s+volume/i.test(name)
  );
}

function normalizeDirectStrategyText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isLegacyDualAccountStrategy(
  strategy: DirectStrategyOptionLike | null | undefined,
): boolean {
  if (!strategy) return false;
  const key = normalizeDirectStrategyText(strategy.key).replace(/\s+/g, "-");
  const name = normalizeDirectStrategyText(strategy.name);
  return (
    isLegacyDualAccountControllerType(strategy.controllerType) ||
    LEGACY_DUAL_ACCOUNT_STRATEGY_KEYS.has(key) ||
    LEGACY_DUAL_ACCOUNT_STRATEGY_NAMES.has(name)
  );
}

function isPureMarketMakingStrategy(
  strategy: DirectStrategyOptionLike | null | undefined,
): boolean {
  if (!strategy) return false;
  const key = normalizeDirectStrategyText(strategy.key).replace(/\s+/g, "-");
  return (
    strategy.controllerType === "pureMarketMaking" ||
    key === "pure-market-making" ||
    /pure\s+market\s+making/i.test(strategy.name || "")
  );
}

export function filterDirectCreateStrategies<T extends DirectStrategyOptionLike>(
  strategies: T[],
): T[] {
  return strategies.filter(
    (strategy) =>
      isPureMarketMakingStrategy(strategy) ||
      isLegacyDualAccountStrategy(strategy) ||
      isEfficientDualAccountStrategy(strategy),
  );
}

export function getDirectReadinessSubmitStatus(args: {
  requiredInputsComplete: boolean;
  loading: boolean;
  failed: boolean;
  displayedSignature: string;
  currentSignature: string;
  canStart?: boolean | null;
}): DirectReadinessSubmitStatus {
  if (!args.requiredInputsComplete) return "missing";
  if (args.loading) return "loading";
  if (args.failed) return "failed";
  if (!args.displayedSignature || args.displayedSignature !== args.currentSignature) {
    return "stale";
  }
  return args.canStart ? "ready" : "blocked";
}

export function isDirectReadinessForCurrentSelection(args: {
  readiness: DirectReadinessResult | null | undefined;
  displayedSignature: string;
  currentSignature: string;
  selectedMode: unknown;
}): boolean {
  if (!args.readiness) return false;
  if (!args.displayedSignature || args.displayedSignature !== args.currentSignature) {
    return false;
  }

  return (
    normalizeEfficientDualAccountMode(args.readiness.mode) ===
    normalizeEfficientDualAccountMode(args.selectedMode)
  );
}

export function formatReadinessAmount(value: unknown, asset: unknown): string {
  const amount = String(value ?? "").trim();
  const unit = String(asset ?? "").trim();

  if (!amount && !unit) return "—";
  if (!unit) return amount || "—";
  if (!amount) return unit;

  return `${amount} ${unit}`;
}

export function getReadinessCapitalRows(
  rows: Array<DirectReadinessCapitalRequirement | DirectReadinessBalance>,
  kind: DirectReadinessCapitalKind,
): DirectReadinessDisplayAmount[] {
  return rows.map((row) => {
    const value =
      "amount" in row ? row.amount : row.availableAmount;

    return {
      accountLabel: row.accountLabel,
      asset: row.asset,
      value,
      label: formatReadinessAmount(value, row.asset),
      testId: `readiness-${kind}-${row.accountLabel}-${row.asset}`,
    };
  });
}

export function describeReadinessMissingBalance(
  missing: DirectReadinessMissingBalance,
): string {
  return `${missing.accountLabel} needs ${formatReadinessAmount(
    missing.missingAmount,
    missing.asset,
  )}. Available ${formatReadinessAmount(
    missing.availableAmount,
    missing.asset,
  )}; minimum useful ${formatReadinessAmount(
    missing.minimumUsefulAmount,
    missing.asset,
  )}. Deposit the missing asset amount or lower the cycle limit if market rules allow.`;
}

export function describeReadinessBlockingReason(
  reason: DirectReadinessBlockingReason,
): string {
  const accountPrefix = reason.accountLabel ? `${reason.accountLabel}: ` : "";
  const assetSuffix = reason.asset ? ` (${reason.asset})` : "";
  const copyByCode: Record<string, string> = {
    market_data_stale:
      "Market data is stale. Refresh market data before starting.",
    market_data_missing:
      "Reference market data is unavailable. Configure deterministic market data before starting.",
    trading_rules_missing:
      "Trading rules are unavailable for this pair. Load exchange rules before starting.",
    trading_rules_incomplete:
      "Trading rules are incomplete for this pair. Add amount and notional minimums before starting.",
    fee_data_missing:
      "Fee data is unavailable. Configure maker and taker fee data before starting.",
    balance_snapshot_unavailable:
      "Current balances are unavailable or stale. Refresh account balances before starting.",
    below_exchange_minimums:
      "Current balances cannot satisfy exchange minimums plus the safety buffer.",
    capacity_limited:
      "Usable capital is below the minimum useful cycle size.",
  };

  return `${accountPrefix}${copyByCode[reason.code] || "Planner readiness is blocked. Review the account, asset, and market-rule details before starting."}${assetSuffix}`;
}

export function describeSafeDirectStartFailure(
  readiness: DirectReadinessResult | null | undefined,
  _error?: unknown,
): string {
  const missing = readiness?.missingBalances?.[0];

  if (missing) {
    return describeReadinessMissingBalance(missing);
  }

  const blocker = readiness?.blockingReasons?.[0];

  if (blocker) {
    return describeReadinessBlockingReason(blocker);
  }

  return "Start was rejected after planner revalidation. Refresh readiness and resolve account, asset, or market-rule blockers before retrying.";
}

function readRuntimeString(value: unknown): string {
  return String(value ?? "").trim();
}

function readNullableRuntimeString(value: unknown): string | null {
  const text = readRuntimeString(value);

  return text || null;
}

function readRuntimeCycleRole(value: unknown): DirectRuntimeCycleLegRole | null {
  const role = readRuntimeString(value);

  return role === "maker" || role === "taker" ? role : null;
}

function readRuntimeSide(value: unknown): "buy" | "sell" | null {
  const side = readRuntimeString(value);

  return side === "buy" || side === "sell" ? side : null;
}

function normalizeRuntimeCycleLeg(
  cycleId: string,
  value: unknown,
): DirectRuntimeCycleLeg | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const cycleRole = readRuntimeCycleRole(row.cycleRole);
  const side = readRuntimeSide(row.side);

  if (!cycleRole || !side) {
    return null;
  }

  return {
    cycleId,
    cycleRole,
    accountLabel: readRuntimeString(row.accountLabel),
    side,
    plannedQty: readRuntimeString(row.plannedQty),
    plannedPrice: readRuntimeString(row.plannedPrice),
    filledQty: readRuntimeString(row.filledQty),
    notional: readRuntimeString(row.notional),
    status: readRuntimeString(row.status) || "unknown",
    failureReason: readNullableRuntimeString(row.failureReason),
    linkedIntentId: readNullableRuntimeString(row.linkedIntentId),
    linkedTrackedOrderId: readNullableRuntimeString(row.linkedTrackedOrderId),
  };
}

type DirectRuntimeCycleSortEntry = {
  cycle: DirectRuntimeCycle;
  backendIndex: number;
  numericCycleCounter: number | null;
  timestampMs: number | null;
};

const RUNTIME_CYCLE_COUNTER_PATTERN =
  /(?:^|[:_-])cycle[:_-](\d+)(?=[:_-]|$)/i;
const RUNTIME_CYCLE_TIMESTAMP_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

function readRuntimeCycleCounter(cycleId: string): number | null {
  const match = cycleId.match(RUNTIME_CYCLE_COUNTER_PATTERN);

  if (!match) {
    return null;
  }

  const counter = Number(match[1]);

  return Number.isSafeInteger(counter) ? counter : null;
}

function readRuntimeCycleTimestampMs(cycleId: string): number | null {
  const match = cycleId.match(RUNTIME_CYCLE_TIMESTAMP_PATTERN);

  if (!match) {
    return null;
  }

  const timestampMs = Date.parse(match[0]);

  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function compareDirectRuntimeCycleSortEntries(
  left: DirectRuntimeCycleSortEntry,
  right: DirectRuntimeCycleSortEntry,
): number {
  if (
    left.numericCycleCounter !== null &&
    right.numericCycleCounter !== null &&
    left.numericCycleCounter !== right.numericCycleCounter
  ) {
    return left.numericCycleCounter - right.numericCycleCounter;
  }

  if (
    left.timestampMs !== null &&
    right.timestampMs !== null &&
    left.timestampMs !== right.timestampMs
  ) {
    return left.timestampMs - right.timestampMs;
  }

  return left.backendIndex - right.backendIndex;
}

export function normalizeDirectRuntimeCycles(
  value: unknown,
): DirectRuntimeCycle[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row, backendIndex): DirectRuntimeCycleSortEntry | null => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const record = row as Record<string, unknown>;
      const cycleId = readRuntimeString(record.cycleId);

      if (!cycleId) {
        return null;
      }

      const legs = Array.isArray(record.legs)
        ? record.legs
            .map((leg) => normalizeRuntimeCycleLeg(cycleId, leg))
            .filter((leg): leg is DirectRuntimeCycleLeg => leg !== null)
            .sort((left, right) => {
              if (left.cycleRole !== right.cycleRole) {
                return left.cycleRole === "maker" ? -1 : 1;
              }

              return left.accountLabel.localeCompare(right.accountLabel);
            })
        : [];

      const cycle = {
        cycleId,
        aggregateStatus: readRuntimeString(record.aggregateStatus) || "unknown",
        failureReason: readNullableRuntimeString(record.failureReason),
        legs,
      };

      return {
        cycle,
        backendIndex,
        numericCycleCounter: readRuntimeCycleCounter(cycleId),
        timestampMs: readRuntimeCycleTimestampMs(cycleId),
      };
    })
    .filter((entry): entry is DirectRuntimeCycleSortEntry => entry !== null)
    .sort(compareDirectRuntimeCycleSortEntries)
    .map((entry) => entry.cycle);
}

export function getLatestDirectRuntimeCycle(
  cycles: DirectRuntimeCycle[],
): DirectRuntimeCycle | null {
  return cycles.length > 0 ? cycles[cycles.length - 1] : null;
}

export function describeDirectRuntimeNextAction(
  readiness: DirectReadinessResult | null | undefined,
): string {
  const action = readiness?.bestFirstAction;

  if (!action) {
    return readiness
      ? "Resolve planner blockers before the next cycle."
      : "No next action was provided by runtime status.";
  }

  return `Maker ${action.makerAccountLabel} should ${action.side} ${formatReadinessAmount(
    action.quantity,
    action.baseAsset,
  )} against taker ${action.takerAccountLabel} at ${formatReadinessAmount(
    action.price,
    action.quoteAsset,
  )} (${formatReadinessAmount(action.notional, action.quoteAsset)} notional).`;
}

export function describeDirectRuntimeBottleneck(
  readiness: DirectReadinessResult | null | undefined,
): string {
  const missing = readiness?.missingBalances?.[0];

  if (missing) {
    return `${missing.accountLabel} ${missing.asset} is the current bottleneck: ${formatReadinessAmount(
      missing.missingAmount,
      missing.asset,
    )} missing, ${formatReadinessAmount(
      missing.availableAmount,
      missing.asset,
    )} available, ${formatReadinessAmount(
      missing.minimumUsefulAmount,
      missing.asset,
    )} minimum useful.`;
  }

  const blocker = readiness?.blockingReasons?.[0];

  if (blocker) {
    return describeReadinessBlockingReason(blocker);
  }

  return readiness?.canStart
    ? "No current bottleneck reported by planner readiness."
    : "Runtime status did not provide a current bottleneck.";
}

export function formatDirectRuntimeRemainingEstimate(
  readiness: DirectReadinessResult | null | undefined,
): string {
  if (!readiness) {
    return "No remaining estimate provided.";
  }

  return `${readiness.estimatedCycles.count} cycles, ${formatReadinessAmount(
    readiness.estimatedVolume.quoteAmount,
    readiness.estimatedVolume.quoteAsset,
  )} / ${formatReadinessAmount(
    readiness.estimatedVolume.baseAmount,
    readiness.estimatedVolume.baseAsset,
  )} estimated volume.`;
}

export function getDirectRuntimeLifecycleView(args: {
  state?: string | null;
  runtimeState?: string | null;
  readiness?: DirectReadinessResult | null;
  warnings?: string[];
}): DirectRuntimeLifecycleView {
  const persistedState = normalizeOrderLifecycleState(args.state);
  const runtimeState = normalizeOrderLifecycleState(args.runtimeState);
  const effectiveState = runtimeState || persistedState;
  const hasPlannerBlocker =
    args.readiness?.canStart === false ||
    (args.readiness?.missingBalances?.length ?? 0) > 0 ||
    (args.readiness?.blockingReasons?.length ?? 0) > 0;
  const hasExecutionBlocker = (args.warnings || []).some((warning) =>
    normalizeOrderLifecycleState(warning).includes("blocked"),
  );

  if (persistedState === "paused") {
    return {
      label: "Paused",
      tone: "info",
      summary: "This order is paused. Resume it when you want runtime cycles to continue.",
      canResumeNow: true,
      readinessGated: false,
    };
  }

  if (persistedState === "stopped") {
    return {
      label: "Operator stopped",
      tone: "info",
      summary:
        "This order was stopped by an operator. Resume it to restart runtime cycles.",
      canResumeNow: true,
      readinessGated: false,
    };
  }

  if (
    effectiveState === "failed" ||
    effectiveState === "blocked" ||
    hasExecutionBlocker
  ) {
    return {
      label: "Failed or blocked",
      tone: "error",
      summary:
        "Runtime execution is blocked and needs operator attention before more cycles can run.",
      canResumeNow: false,
      readinessGated: false,
    };
  }

  if (hasPlannerBlocker) {
    return {
      label: "Waiting for next cycle",
      tone: "info",
      summary: "Runtime is active; the strategy will continue when it can produce the next cycle.",
      canResumeNow: false,
      readinessGated: false,
    };
  }

  if (effectiveState === "running" || effectiveState === "active") {
    return {
      label: "Running",
      tone: "success",
      summary:
        "Runtime is active and planner readiness does not report blockers.",
      canResumeNow: false,
      readinessGated: false,
    };
  }

  if (effectiveState === "created") {
    return {
      label: "Created",
      tone: "info",
      summary:
        "Order is created and waiting for runtime execution to become active.",
      canResumeNow: false,
      readinessGated: false,
    };
  }

  return {
    label: effectiveState || "Unknown",
    tone: "info",
    summary: "Runtime lifecycle needs review before taking action.",
    canResumeNow: false,
    readinessGated: false,
  };
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
  "orderId",
  "marketMakingOrderId",
  "pair",
  "symbol",
  "exchangeName",
  "controllerType",
  "strategyDefinitionId",
  "definitionId",
  "externalId",
  "accountLabel",
  "makerAccountLabel",
  "takerAccountLabel",
  "makerApiKeyId",
  "takerApiKeyId",
  "apiKeyId",
  "id",
]);

const EFFICIENT_DUAL_ACCOUNT_HIDDEN_MECHANICS_FIELDS = new Set([
  "cycleMode",
  "dynamicRoleSwitching",
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
    isLegacyDualAccountControllerType(controllerType) ||
    isEfficientDualAccountControllerType(controllerType)
  );
}

export function isBestCapacityDirectOrderControllerType(
  controllerType: unknown,
): boolean {
  return (
    controllerType === "dualAccountBestCapacityVolume" ||
    isEfficientDualAccountControllerType(controllerType)
  );
}

export function isSchemaDrivenDirectOrderControllerType(
  controllerType: unknown,
): boolean {
  if (!controllerType) return false;
  return !(
    controllerType === "pureMarketMaking" ||
    isDualDirectOrderControllerType(controllerType)
  );
}

export function isKnownDirectStrategyControllerType(
  controllerType: unknown,
): boolean {
  return (
    controllerType === "pureMarketMaking" ||
    isDualDirectOrderControllerType(controllerType)
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
  const isEfficientDualAccountStrategy =
    isEfficientDualAccountControllerType(controllerType);
  const accumulator = configRows.reduce<Record<string, unknown>>((acc, row) => {
    const key = row.key.trim();

    if (!key || DIRECT_RESERVED_CONFIG_FIELDS.has(key)) return acc;
    if (
      isEfficientDualAccountStrategy &&
      EFFICIENT_DUAL_ACCOUNT_HIDDEN_MECHANICS_FIELDS.has(key)
    ) {
      return acc;
    }
    acc[key] = parseConfigValue(row.value);
    return acc;
  }, {});
  if (orderAmount) {
    const num = Number(orderAmount);
    const value = isNaN(num) ? orderAmount : num;

    if (
      controllerType === "dualAccountBestCapacityVolume" ||
      isEfficientDualAccountStrategy
    ) {
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
    const fractionalSpread = isNaN(num) ? orderSpread : num / 100;

    if (
      controllerType === "dualAccountBestCapacityVolume" ||
      isEfficientDualAccountStrategy
    ) {
      // Best-capacity strategy does not use spread configuration.
    } else if (isDualAccountStrategy) {
      accumulator["baseIncrementPercentage"] = value;
    } else {
      accumulator["bidSpread"] = fractionalSpread;
      accumulator["askSpread"] = fractionalSpread;
    }
  }
  if (isDualAccountStrategy && dualFields) {
    if (isEfficientDualAccountStrategy) {
      accumulator["mode"] = normalizeEfficientDualAccountMode(dualFields.mode);
      if (dualFields.intervalTime) {
        const num = Number(dualFields.intervalTime);
        if (!isNaN(num)) accumulator["interval"] = num;
      }
      if (dualFields.targetQuoteVolume) {
        const num = Number(dualFields.targetQuoteVolume);
        if (!isNaN(num)) accumulator["dailyVolumeTarget"] = num;
      }
      if (dualFields.tradeAmountVariance) {
        const num = Number(dualFields.tradeAmountVariance);
        if (!isNaN(num)) accumulator["tradeAmountVariance"] = num;
      }
      if (dualFields.priceOffsetVariance) {
        const num = Number(dualFields.priceOffsetVariance);
        if (!isNaN(num)) accumulator["priceOffsetVariance"] = num;
      }

      return accumulator;
    }

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
  excludedFields: string[] = [],
): Record<string, unknown> {
  const properties = schema?.properties || {};
  const excluded = new Set(excludedFields);

  return Object.entries(config).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (
        DIRECT_RESERVED_CONFIG_FIELDS.has(key) ||
        excluded.has(key) ||
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
