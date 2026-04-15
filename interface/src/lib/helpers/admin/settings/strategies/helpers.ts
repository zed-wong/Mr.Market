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
  switch (type) {
    case "pureMarketMaking":
      return "Market Making";
    case "arbitrage":
      return "Arbitrage";
    case "volume":
      return "Volume";
    case "timeIndicator":
      return "Time Indicator";
    default:
      return type || "—";
  }
}

export function getControllerTypeClasses(type: string): string {
  switch (type) {
    case "pureMarketMaking":
      return "bg-indigo-50 text-blue-600";
    case "arbitrage":
      return "bg-amber-50 text-amber-600";
    case "volume":
      return "bg-emerald-50 text-emerald-600";
    case "timeIndicator":
      return "bg-violet-50 text-violet-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "failed":
      return "Failed";
    case "created":
      return "Created";
    case "stale":
      return "Stale";
    default:
      return status || "—";
  }
}

export function getStatusClasses(status: string): string {
  switch (status) {
    case "running":
      return "bg-green-50 text-green-600";
    case "stopped":
      return "bg-slate-100 text-slate-500";
    case "failed":
      return "bg-red-50 text-red-600";
    case "created":
      return "bg-amber-50 text-amber-600";
    case "stale":
      return "bg-orange-50 text-orange-600";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

export function getVisibilityLabel(visibility: string): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "admin":
      return "Admin";
    default:
      return visibility || "—";
  }
}
