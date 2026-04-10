import { _ } from "svelte-i18n";
import { get } from "svelte/store";
import BigNumber from "bignumber.js";

const errorKeyMap: Record<string, string> = {
  "API key not found": "admin_direct_mm_error_api_key_not_found",
  "API key exchange does not match request":
    "admin_direct_mm_error_api_key_exchange_mismatch",
  "API key account label does not match request":
    "admin_direct_mm_error_api_key_account_mismatch",
  "Strategy definition not found":
    "admin_direct_mm_error_definition_not_found",
  "Order not found": "admin_direct_mm_error_order_not_found",
  "Order already stopped": "admin_direct_mm_error_already_stopped",
  "API key authentication failed": "admin_direct_mm_error_authentication",
  "Rate limited, try again": "admin_direct_mm_error_rate_limit",
  "Exchange timeout": "admin_direct_mm_error_timeout",
  "Campaign join already exists":
    "admin_direct_mm_error_campaign_join_exists",
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

export function normalizeConfigOverrides(
  controllerType: string,
  configRows: { key: string; value: string }[],
  orderAmount: string,
  orderSpread: string,
): Record<string, unknown> {
  const accumulator = configRows.reduce<Record<string, unknown>>(
    (acc, row) => {
      if (!row.key.trim()) return acc;
      acc[row.key.trim()] = parseConfigValue(row.value);
      return acc;
    },
    {},
  );
  if (orderAmount) {
    const num = Number(orderAmount);
    const value = isNaN(num) ? orderAmount : num;

    if (controllerType === "dualAccountVolume") {
      accumulator["baseTradeAmount"] = value;
    } else {
      accumulator["orderAmount"] = value;
    }
  }
  if (orderSpread) {
    const num = Number(orderSpread);
    const value = isNaN(num) ? orderSpread : num;

    if (controllerType === "dualAccountVolume") {
      accumulator["baseIncrementPercentage"] = value;
    } else {
      accumulator["bidSpread"] = value;
      accumulator["askSpread"] = value;
    }
  }
  return accumulator;
}
