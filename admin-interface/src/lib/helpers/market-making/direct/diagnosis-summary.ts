export type DirectOrderDiagnosisTone = "success" | "warning" | "error" | "info";

export interface DirectOrderDiagnosisEvidence {
  label: string;
  value: string;
  tone: DirectOrderDiagnosisTone;
}

export interface DirectOrderDiagnosis {
  kind: "normal" | "stopped" | "blocked" | "risky" | "unknown";
  tone: DirectOrderDiagnosisTone;
  title: string;
  summary: string;
  evidence: DirectOrderDiagnosisEvidence[];
  risks: string[];
}

interface DirectOrderDiagnosisInput {
  state?: string;
  runtimeState?: string;
  executorHealth?: string;
  lastTickAt?: string | null;
  lastUpdatedAt?: string | null;
  privateStreamEventAt?: string | null;
  openOrders?: unknown[];
  intents?: unknown[];
  recentErrors?: Array<{ ts?: string | null; message?: string | null }>;
  balanceCacheStatus?: Array<{
    asset?: string | null;
    accountLabel?: string | null;
    source?: string | null;
    freshnessTimestamp?: string | null;
    stale?: boolean | null;
  }>;
  streamHealth?: Array<{
    accountLabel?: string | null;
    state?: string | null;
    order?: boolean | null;
    trade?: boolean | null;
    balance?: boolean | null;
    lastEventAt?: string | null;
    lastBalanceRefreshAt?: string | null;
  }>;
  userStreamCapabilities?: Array<{
    accountLabel?: string | null;
    watchOrders?: boolean | null;
    watchTrades?: boolean | null;
    watchBalance?: boolean | null;
  }>;
  userStreamRuntime?: {
    activeWatcherCount?: number | null;
    queueDepth?: number | null;
    duplicateFillSuppressionCount?: number | null;
  };
  stale?: boolean | null;
}

interface DirectOrderDiagnosisSummaryInput {
  state?: string;
  runtimeState?: string;
  lastTickAt?: string | null;
  warnings?: string[] | null;
}

const DIAGNOSIS_STALE_TICK_MS = 60 * 1000;

function normalizeToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatAgeFromMs(ageMs: number): string {
  if (ageMs < 0) return "just now";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function ageMsFromIso(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return nowMs - parsed;
}

function hasOwnDiagnosticField(status: DirectOrderDiagnosisInput, field: keyof DirectOrderDiagnosisInput): boolean {
  return Object.prototype.hasOwnProperty.call(status, field);
}

function isRunningRuntimeState(runtimeState: string): boolean {
  return runtimeState === "running" || runtimeState === "active";
}

function isHealthyStreamState(state: string): boolean {
  return ["live", "healthy", "active", "ok", "ready"].includes(state);
}

function streamStateNeedsAttention(stream: {
  state?: string | null;
  order?: boolean | null;
  trade?: boolean | null;
  balance?: boolean | null;
}): boolean {
  const state = normalizeToken(stream.state);
  if (state) return !isHealthyStreamState(state);
  return stream.order === false && stream.trade === false && stream.balance === false;
}

export function explainDirectOrderWarning(warning: string): string {
  const normalized = normalizeToken(warning).replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    execution_blocked: "Execution is blocked until the failed queue item is cleared.",
    blocked_by_failed_intent: "A failed intent is blocking new market-making work.",
    failed_head_intent: "The queue head failed and is blocking execution.",
    stale_tick: "The strategy has not produced a recent tick.",
    stale_executor: "The runtime executor looks stale and may not be processing work.",
    executor_gone: "The runtime executor is gone, so the order may not be executing.",
    balance_cache_stale: "Balance cache data is stale and should be refreshed before relying on it.",
    balance_cache_missing: "Balance cache data is missing for one or more assets.",
    stream_stale: "Private stream data is stale for one or more linked accounts.",
    stream_missing: "Private stream health is missing for one or more linked accounts.",
    api_key_missing: "The linked API key is missing.",
    api_key_validation_failed: "The linked API key failed validation.",
  };

  if (map[normalized]) return `${map[normalized]} Source: ${warning}`;
  if (normalized.includes("blocked")) return `Execution appears blocked. Source: ${warning}`;
  if (normalized.includes("failed") || normalized.includes("error")) {
    return `A failure needs operator attention. Source: ${warning}`;
  }
  if (normalized.includes("stale")) return `A stale diagnostic needs attention. Source: ${warning}`;

  return `Operator warning: ${warning}`;
}

function buildTickEvidence(
  lastTickAt: string | null | undefined,
  runtimeState: string,
  nowMs: number,
): { evidence: DirectOrderDiagnosisEvidence; risk: string | null } {
  const ageMs = ageMsFromIso(lastTickAt, nowMs);
  const expectsTicks = runtimeState === "running" || runtimeState === "active";

  if (ageMs === null) {
    return {
      evidence: {
        label: "Tick freshness",
        value: expectsTicks
          ? "No tick timestamp is available for this running order."
          : "No tick timestamp is available.",
        tone: expectsTicks ? "warning" : "info",
      },
      risk: expectsTicks ? "Tick evidence is missing for a running order." : null,
    };
  }

  if (expectsTicks && ageMs > DIAGNOSIS_STALE_TICK_MS) {
    return {
      evidence: {
        label: "Tick freshness",
        value: `Last tick was stale at ${formatAgeFromMs(ageMs)}.`,
        tone: "warning",
      },
      risk: `Last tick is stale (${formatAgeFromMs(ageMs)}).`,
    };
  }

  return {
    evidence: {
      label: "Tick freshness",
      value: `Last tick ${formatAgeFromMs(ageMs)}.`,
      tone: "success",
    },
    risk: null,
  };
}

function buildStreamEvidence(
  status: DirectOrderDiagnosisInput,
  runtimeState: string,
): { evidence: DirectOrderDiagnosisEvidence; risks: string[] } {
  const streams = status.streamHealth || [];
  const runtime = status.userStreamRuntime;
  const capabilities = status.userStreamCapabilities || [];
  const expectsRuntime = isRunningRuntimeState(runtimeState);
  const risks = streams
    .filter(streamStateNeedsAttention)
    .map((stream) => `${stream.accountLabel || "account"} stream health is ${stream.state || "missing"}.`);

  if (risks.length > 0) {
    return {
      evidence: {
        label: "Stream health",
        value: risks[0],
        tone: "warning",
      },
      risks,
    };
  }

  if (streams.length > 0) {
    const watcherCopy = runtime
      ? ` Runtime watchers: ${runtime.activeWatcherCount ?? 0}; queue depth: ${runtime.queueDepth ?? 0}.`
      : "";
    const capabilityCopy =
      capabilities.length > 0
        ? ` Capabilities returned for ${capabilities.length} account${capabilities.length === 1 ? "" : "s"}.`
        : "";
    return {
      evidence: {
        label: "Stream health",
        value: `${streams.length} linked stream${streams.length === 1 ? "" : "s"} reported without stale or failed state.${watcherCopy}${capabilityCopy}`,
        tone: "success",
      },
      risks: [],
    };
  }

  if (expectsRuntime) {
    return {
      evidence: {
        label: "Stream health",
        value: "No stream health payload was returned for this running order; stream state is unknown.",
        tone: "warning",
      },
      risks: ["Stream health evidence is missing for a running order."],
    };
  }

  return {
    evidence: {
      label: "Stream health",
      value: "No stream health payload was returned; check the runtime section below.",
      tone: "info",
    },
    risks: [],
  };
}

function buildBalanceEvidence(
  status: DirectOrderDiagnosisInput,
  runtimeState: string,
): { evidence: DirectOrderDiagnosisEvidence; risks: string[] } {
  const balances = status.balanceCacheStatus || [];
  const expectsRuntime = isRunningRuntimeState(runtimeState);
  const risky = balances.filter(
    (balance) => balance.stale || normalizeToken(balance.source) === "missing",
  );

  if (risky.length > 0) {
    const first = risky[0];
    const account = first.accountLabel || "account";
    const asset = first.asset || "asset";
    const reason = first.stale ? "stale" : "missing";
    return {
      evidence: {
        label: "Balance cache",
        value: `${account} ${asset} balance cache is ${reason}.`,
        tone: "warning",
      },
      risks: risky.map(
        (balance) =>
          `${balance.accountLabel || "account"} ${balance.asset || "asset"} balance cache is ${
            balance.stale ? "stale" : "missing"
          }.`,
      ),
    };
  }

  if (balances.length > 0) {
    return {
      evidence: {
        label: "Balance cache",
        value: `${balances.length} balance cache entr${balances.length === 1 ? "y is" : "ies are"} current enough for diagnosis.`,
        tone: "success",
      },
      risks: [],
    };
  }

  if (expectsRuntime) {
    return {
      evidence: {
        label: "Balance cache",
        value: "No balance cache payload was returned for this running order; balance freshness is unknown.",
        tone: "warning",
      },
      risks: ["Balance cache evidence is missing for a running order."],
    };
  }

  return {
    evidence: {
      label: "Balance cache",
      value: "No balance cache payload was returned; inventory balances below are the available evidence.",
      tone: "info",
    },
    risks: [],
  };
}

export function buildDirectOrderDiagnosis(
  status: DirectOrderDiagnosisInput,
  order?: DirectOrderDiagnosisSummaryInput | null,
  nowMs: number = Date.now(),
): DirectOrderDiagnosis {
  const runtimeState = normalizeToken(status.runtimeState || order?.runtimeState || status.state || order?.state);
  const warnings = order?.warnings || [];
  const expectsRuntime = isRunningRuntimeState(runtimeState);
  const hasRecentErrors = hasOwnDiagnosticField(status, "recentErrors");
  const hasOpenOrders = hasOwnDiagnosticField(status, "openOrders");
  const hasIntents = hasOwnDiagnosticField(status, "intents");
  const recentErrors = status.recentErrors || [];
  const openOrders = status.openOrders || [];
  const intents = status.intents || [];
  const firstError = recentErrors.find((error) => error.message)?.message || "";
  const blockingWarning = warnings.find((warning) => {
    const normalized = normalizeToken(warning);
    return (
      normalized.includes("blocked") ||
      normalized.includes("failed") ||
      normalized.includes("failure") ||
      normalized.includes("error")
    );
  });

  const tick = buildTickEvidence(status.lastTickAt || order?.lastTickAt, runtimeState, nowMs);
  const stream = buildStreamEvidence(status, runtimeState);
  const balance = buildBalanceEvidence(status, runtimeState);
  const executorHealth = normalizeToken(status.executorHealth);
  const executorRisk =
    executorHealth === "stale" || executorHealth === "gone"
      ? [`Executor health is ${executorHealth}.`]
      : [];
  const missingArrayRisks = expectsRuntime
    ? [
        !hasOpenOrders ? "Open-order diagnostics were not returned for this running order." : "",
        !hasIntents ? "Recent-intent diagnostics were not returned for this running order." : "",
        !hasRecentErrors ? "Recent-error diagnostics were not returned for this running order." : "",
      ].filter(Boolean)
    : [];
  const staleRisks = [
    ...(status.stale ? ["The status endpoint marked this order as stale."] : []),
    ...(tick.risk ? [tick.risk] : []),
    ...stream.risks,
    ...balance.risks,
    ...executorRisk,
    ...missingArrayRisks,
  ];
  const errorEvidence: DirectOrderDiagnosisEvidence = firstError
    ? {
        label: "Recent errors",
        value: firstError,
        tone: "error",
      }
    : !hasRecentErrors
      ? {
          label: "Recent errors",
          value: "Recent error diagnostics were not returned; absence of blocking errors is unknown.",
          tone: "warning",
        }
    : {
        label: "Recent errors",
        value: "No recent blocking errors were returned.",
        tone: "success",
      };

  const openOrdersEvidence: DirectOrderDiagnosisEvidence = !hasOpenOrders
    ? {
        label: "Open orders",
        value: "Open-order diagnostics were not returned; current exchange exposure is unknown.",
        tone: "warning",
      }
    : {
        label: "Open orders",
        value:
          openOrders.length > 0
            ? `${openOrders.length} open exchange order${openOrders.length === 1 ? "" : "s"} returned as current exposure evidence.`
            : "No open exchange orders were returned.",
        tone: "info",
      };

  const intentsEvidence: DirectOrderDiagnosisEvidence = !hasIntents
    ? {
        label: "Recent intents",
        value: "Recent-intent diagnostics were not returned; current work and idle state are unknown.",
        tone: "warning",
      }
    : {
        label: "Recent intents",
        value:
          intents.length > 0
            ? `${intents.length} recent intent${intents.length === 1 ? "" : "s"} returned as current work evidence.`
            : "No recent intents were returned.",
        tone: "info",
      };

  const executorEvidence: DirectOrderDiagnosisEvidence = {
    label: "Executor health",
    value: executorHealth ? `Executor is ${executorHealth}.` : "Executor health is unavailable.",
    tone: executorRisk.length > 0 ? "warning" : executorHealth ? "success" : "info",
  };

  const baseEvidence: DirectOrderDiagnosisEvidence[] = [
    {
      label: "Lifecycle",
      value: runtimeState ? `Runtime state is ${runtimeState}.` : "Runtime state is unavailable.",
      tone: runtimeState ? "info" : "warning",
    },
    tick.evidence,
    executorEvidence,
    stream.evidence,
    balance.evidence,
    openOrdersEvidence,
    intentsEvidence,
    errorEvidence,
    {
      label: "Account/API key",
      value: "Linked exchange and API-key readiness evidence is shown in the account routing panel below.",
      tone: "info",
    },
  ];

  if (runtimeState === "stopped") {
    return {
      kind: "stopped",
      tone: "info",
      title: "Intentionally stopped",
      summary:
        "This direct market-making order is intentionally stopped. It is not being treated as a runtime failure; use resume when the operator wants it trading again.",
      evidence: baseEvidence,
      risks: [],
    };
  }

  if (runtimeState === "failed" || blockingWarning || firstError) {
    const reason = blockingWarning
      ? explainDirectOrderWarning(blockingWarning)
      : firstError || "The runtime reported a failed state.";
    return {
      kind: "blocked",
      tone: "error",
      title: "Failed or blocked",
      summary: `This order is failed or blocked and needs operator attention. Blocking reason: ${reason}`,
      evidence: baseEvidence,
      risks: [reason],
    };
  }

  if (
    runtimeState === "stale" ||
    runtimeState === "gone" ||
    executorHealth === "stale" ||
    executorHealth === "gone" ||
    staleRisks.length > 0
  ) {
    return {
      kind: "risky",
      tone: "warning",
      title: "Operational risk detected",
      summary: `This order is not failed, but stale or incomplete diagnostics create operational risk. Evidence: ${staleRisks[0] || "runtime state needs review."}`,
      evidence: baseEvidence,
      risks: staleRisks.length > 0 ? staleRisks : ["Runtime state needs review."],
    };
  }

  if (runtimeState === "running" || runtimeState === "active") {
    return {
      kind: "normal",
      tone: "success",
      title: "Running normally",
      summary:
        "This direct market-making order is running normally: lifecycle is active, tick evidence is fresh, streams and balances do not show stale risk, and no recent blocking errors were returned.",
      evidence: baseEvidence,
      risks: [],
    };
  }

  return {
    kind: "unknown",
    tone: "info",
    title: "Needs review",
    summary:
      "The order has partial or unfamiliar diagnostics. Review the evidence sections before assuming it is healthy.",
    evidence: baseEvidence,
    risks: ["Runtime state is not recognized as healthy, stopped, failed, or stale."],
  };
}
