<script lang="ts">
    import type {
        DirectOrderStatus,
        DirectRuntimeCycle,
        DirectRuntimeCycleLeg,
    } from "$lib/types/hufi/admin-direct-market-making";
    import {
        getDirectRuntimeLifecycleView,
        getLatestDirectRuntimeCycle,
        normalizeDirectRuntimeCycles,
    } from "$lib/helpers/market-making/direct/helpers";

    export let data: DirectOrderStatus;
    export let warnings: string[] = [];

    function formatEfficientMode(value?: string | null): string {
        if (value === "cheapest_capital") return "Cheapest capital";
        if (value === "fastest_volume") return "Fastest volume";
        if (value === "balanced") return "Balanced";
        return value || "Not provided";
    }

    function lifecycleBadgeClass(tone: string): string {
        if (tone === "success") return "bg-success/10 text-success border-success/20";
        if (tone === "warning") return "bg-warning/10 text-warning border-warning/20";
        if (tone === "error") return "bg-error/10 text-error border-error/20";
        return "bg-base-content/5 text-base-content/70 border-base-300";
    }

    function statusBadgeClass(status: string): string {
        const normalized = status.toLowerCase();
        if (["completed", "filled", "done"].includes(normalized)) {
            return "bg-success/10 text-success border-success/20";
        }
        if (["failed", "cancelled"].includes(normalized)) {
            return "bg-error/10 text-error border-error/20";
        }
        if (["partial", "partially_filled", "open", "pending"].includes(normalized)) {
            return "bg-warning/10 text-warning border-warning/20";
        }
        return "bg-base-content/5 text-base-content/70 border-base-300";
    }

    function cycleHasFailure(cycle: DirectRuntimeCycle | null): boolean {
        return Boolean(
            cycle?.aggregateStatus?.toLowerCase() === "failed" ||
                cycle?.failureReason ||
                cycle?.legs?.some(
                    (leg) =>
                        leg.failureReason ||
                        leg.status?.toLowerCase() === "failed",
                ),
        );
    }

    function compactCycleId(cycleId: string): string {
        const parts = cycleId.split(":cycle:");

        if (parts.length === 2) {
            const [counter, ...rest] = parts[1].split(":");
            const timestamp = rest.join(":");
            const time = timestamp ? Date.parse(timestamp) : Number.NaN;

            if (Number.isFinite(time)) {
                return `cycle ${counter} · ${new Date(time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                })}`;
            }

            return `cycle ${counter || parts[1]}`;
        }

        return cycleId;
    }

    function latestCycleLabel(cycle: DirectRuntimeCycle | null): string {
        if (!cycle) return "No cycle metadata yet";

        return `${compactCycleId(cycle.cycleId)} · ${cycle.aggregateStatus}`;
    }

    function roleBadgeClass(role: DirectRuntimeCycleLeg["cycleRole"]): string {
        return role === "maker"
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-secondary/10 text-secondary border-secondary/20";
    }

    function cycleHeading(cycle: DirectRuntimeCycle): string {
        return compactCycleId(cycle.cycleId);
    }

    function legAccountLabel(leg: DirectRuntimeCycleLeg): string {
        if (!leg.accountLabel) return "account unavailable";
        if (
            data?.makerAccountLabel &&
            leg.accountLabel === data.makerAccountLabel
        ) {
            return data.makerAccountName || leg.accountLabel;
        }
        if (
            data?.takerAccountLabel &&
            leg.accountLabel === data.takerAccountLabel
        ) {
            return data.takerAccountName || leg.accountLabel;
        }

        return leg.accountLabel;
    }

    $: cycles = normalizeDirectRuntimeCycles(data?.cycles ?? []);
    $: latestCycle = getLatestDirectRuntimeCycle(cycles);
    $: newestFirstCycles = [...cycles].reverse();
    $: lifecycle = getDirectRuntimeLifecycleView({
        state: data?.state,
        runtimeState: data?.runtimeState,
        readiness: null,
        warnings,
    });
    $: effectiveLifecycle = cycleHasFailure(latestCycle)
        ? {
              label: "Cycle failed",
              tone: "error",
              summary:
                  latestCycle?.failureReason ||
                  latestCycle?.legs?.find((leg) => leg.failureReason)
                      ?.failureReason ||
                  "The latest efficient volume cycle failed and needs operator attention.",
          }
        : lifecycle;
    $: cycleSizeLabel = data?.orderConfig?.orderAmount || "Not provided";
    $: failedCycleCount = cycles.filter(cycleHasFailure).length;
</script>

<div
    class="border border-base-300 rounded-xl p-4 bg-base-100"
    data-testid="efficient-runtime-panel"
>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
            <span class="text-xs font-bold text-base-content block">
                Efficient Volume runtime cycles
            </span>
            <span class="text-[11px] text-base-content/55">
                Maker and inline taker IOC activity is grouped by cycle id.
            </span>
        </div>
        <span
            class="w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize {lifecycleBadgeClass(effectiveLifecycle.tone)}"
            data-testid="efficient-runtime-lifecycle"
        >
            {effectiveLifecycle.label}
        </span>
    </div>

    <div class="mt-3 rounded-lg bg-base-200/40 p-3">
        <span class="text-xs font-semibold text-base-content block">
            {effectiveLifecycle.summary}
        </span>
    </div>

    <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div class="rounded-lg border border-base-300 p-3">
            <span class="text-[10px] font-semibold text-base-content/45 block">
                Current mode
            </span>
            <span class="mt-1 text-sm font-bold text-base-content block" data-testid="efficient-runtime-mode">
                {formatEfficientMode(data?.orderConfig?.mode)}
            </span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
            <span class="text-[10px] font-semibold text-base-content/45 block">
                Cycle size
            </span>
            <span class="mt-1 text-sm font-bold text-base-content block" data-testid="efficient-runtime-cycle-size">
                {cycleSizeLabel}
            </span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
            <span class="text-[10px] font-semibold text-base-content/45 block">
                Latest cycle
            </span>
            <span
                class="mt-1 block max-w-full whitespace-normal break-words text-sm font-bold leading-tight text-base-content"
                title={latestCycle?.cycleId || ""}
                data-testid="efficient-runtime-latest-cycle"
            >
                {latestCycleLabel(latestCycle)}
            </span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
            <span class="text-[10px] font-semibold text-base-content/45 block">
                Failed cycles
            </span>
            <span class="mt-1 text-sm font-bold text-base-content block" data-testid="efficient-runtime-failed-cycles">
                {failedCycleCount}
            </span>
        </div>
    </div>

    <div class="mt-4 flex flex-col gap-3" data-testid="efficient-runtime-cycles">
        {#if cycles.length === 0}
            <div class="rounded-lg border border-base-300 p-4 text-center">
                <span class="text-xs text-base-content/50">
                    No runtime cycle metadata has been published yet.
                </span>
            </div>
        {:else}
            {#each newestFirstCycles as cycle}
                <div
                    class="rounded-xl border border-base-300 p-3"
                    data-testid={`efficient-runtime-cycle-${cycle.cycleId}`}
                >
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0">
                            <span
                                class="truncate font-mono text-[11px] font-semibold text-base-content block"
                                title={cycle.cycleId}
                            >
                                {cycleHeading(cycle)}
                            </span>
                            {#if cycle.failureReason}
                                <span class="mt-1 text-[11px] text-error block">
                                    {cycle.failureReason}
                                </span>
                            {/if}
                        </div>
                        <span class="w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize {statusBadgeClass(cycle.aggregateStatus)}">
                            {cycle.aggregateStatus}
                        </span>
                    </div>

                    <div class="mt-3 grid gap-2 lg:grid-cols-2">
                        {#each cycle.legs as leg}
                            <div
                                class="rounded-lg border border-base-300 bg-base-200/30 p-3"
                                data-testid={`efficient-runtime-leg-${cycle.cycleId}-${leg.cycleRole}`}
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize {roleBadgeClass(leg.cycleRole)}">
                                        {leg.cycleRole}
                                    </span>
                                    <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize {statusBadgeClass(leg.status)}">
                                        {leg.status}
                                    </span>
                                </div>
                                <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                    <span class="text-base-content/45">Account</span>
                                    <span class="font-semibold text-base-content text-right">
                                        {legAccountLabel(leg)}
                                    </span>
                                    <span class="text-base-content/45">Side</span>
                                    <span class="font-semibold capitalize text-base-content text-right">
                                        {leg.side}
                                    </span>
                                    <span class="text-base-content/45">Planned qty</span>
                                    <span class="font-semibold text-base-content text-right">
                                        {leg.plannedQty || "—"}
                                    </span>
                                    <span class="text-base-content/45">Planned price</span>
                                    <span class="font-semibold text-base-content text-right">
                                        {leg.plannedPrice || "—"}
                                    </span>
                                    <span class="text-base-content/45">Filled qty</span>
                                    <span class="font-semibold text-base-content text-right">
                                        {leg.filledQty || "0"}
                                    </span>
                                    <span class="text-base-content/45">Notional</span>
                                    <span class="font-semibold text-base-content text-right">
                                        {leg.notional || "—"}
                                    </span>
                                </div>
                                {#if leg.failureReason}
                                    <span class="mt-2 block text-[11px] text-error">
                                        {leg.failureReason}
                                    </span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>
