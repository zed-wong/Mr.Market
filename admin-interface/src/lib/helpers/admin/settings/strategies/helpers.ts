import { get } from "svelte/store";
import { _ } from "svelte-i18n";

export function formatDate(value: string): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} • ${date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export function formatRelativeTime(value: string): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(-diffMinutes, "minute");
  }
  if (Math.abs(diffHours) < 24) {
    return formatter.format(-diffHours, "hour");
  }
  return formatter.format(-diffDays, "day");
}

export function getControllerTypeLabel(type: string): string {
  const $_ = get(_);
  switch (type) {
    case "pureMarketMaking":
      return $_("admin_strategy_controller_market_making");
    case "arbitrage":
      return $_("admin_strategy_controller_arbitrage");
    case "volume":
      return $_("admin_strategy_controller_volume");
    case "efficientDualAccountVolume":
      return $_("admin_direct_mm_strategy_efficient_dual_account_volume");
    case "timeIndicator":
      return $_("admin_strategy_controller_time_indicator");
    default:
      return type || "—";
  }
}

export function getControllerTypeClasses(type: string): string {
  switch (type) {
    case "pureMarketMaking":
      return "bg-base-300 text-base-content";
    case "arbitrage":
      return "bg-base-300 text-base-content";
    case "volume":
      return "bg-base-300 text-base-content";
    case "efficientDualAccountVolume":
      return "bg-base-300 text-base-content";
    case "timeIndicator":
      return "bg-base-300 text-base-content";
    default:
      return "bg-base-300 text-base-content";
  }
}

export function getStatusLabel(status: string): string {
  const $_ = get(_);
  switch (status) {
    case "running":
      return $_("admin_strategy_status_running");
    case "stopped":
      return $_("admin_strategy_status_stopped");
    case "failed":
      return $_("admin_strategy_status_failed");
    case "created":
      return $_("admin_strategy_status_created");
    case "stale":
      return $_("admin_strategy_status_stale");
    default:
      return status || "—";
  }
}

export function getStatusClasses(status: string): string {
  switch (status) {
    case "running":
      return "bg-success/10 text-success";
    case "stopped":
      return "bg-base-300 text-base-content";
    case "failed":
    case "deleted":
    case "removed":
      return "bg-error/10 text-error";
    case "created":
      return "bg-info/10 text-info";
    case "stale":
      return "bg-warning/10 text-warning";
    default:
      return "bg-base-300 text-base-content";
  }
}

export function getVisibilityLabel(visibility: string): string {
  const $_ = get(_);
  switch (visibility) {
    case "public":
      return $_("admin_strategy_visibility_public");
    case "admin":
      return $_("admin_strategy_visibility_admin");
    default:
      return visibility || "—";
  }
}
