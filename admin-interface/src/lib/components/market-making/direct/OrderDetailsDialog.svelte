<script lang="ts">
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import AdminStatePanel from "$lib/components/admin/shared/AdminStatePanel.svelte";
    import OrderPerformanceDialog from "$lib/components/market-making/direct/OrderPerformanceDialog.svelte";
    import OrderConfigDialog from "$lib/components/market-making/direct/OrderConfigDialog.svelte";
    import OrderRoutingDialog from "$lib/components/market-making/direct/OrderRoutingDialog.svelte";
    import OrderExchangeOrdersDialog from "$lib/components/market-making/direct/OrderExchangeOrdersDialog.svelte";
    import OrderErrorsDialog from "$lib/components/market-making/direct/OrderErrorsDialog.svelte";
    import type { AdminErrorState } from "$lib/helpers/admin/common-states";
    import type {
        DirectOrderSummary,
        DirectOrderStatus,
    } from "$lib/types/hufi/admin-direct-market-making";
    import type { OrderPerformance } from "$lib/types/hufi/order-performance";
    import {
        formatTimestamp,
        formatDirectDecimal,
        isBestCapacityDirectOrderControllerType,
        isDualAccountOrder,
        isKnownDirectStrategyControllerType,
        getStateLabel,
        explainDirectOrderWarning,
        isActionableDirectOrderWarning,
        getDirectOrderActionAvailability,
        getDirectOrderDisplayState,
    } from "$lib/helpers/market-making/direct/helpers";

    export let show = false;
    export let order: DirectOrderSummary | null = null;
    export let data: DirectOrderStatus | null = null;
    export let performance: OrderPerformance | null = null;
    export let loading = false;
    export let refreshing = false;
    export let error: AdminErrorState | null = null;
    export let onClose: () => void;
    export let onRefresh: () => void;
    export let onStartOrder: () => void;
    export let onStopOrder: () => void;
    export let onRemoveOrder: () => void;

    type DetailView =
        | "overview"
        | "performance"
        | "config"
        | "routing"
        | "exchangeOrders"
        | "errors";

    let activeView: DetailView = "overview";
    let trackedOrderId: string | null = null;

    $: if (!show) {
        activeView = "overview";
    }

    $: if (order && order.orderId !== trackedOrderId) {
        trackedOrderId = order.orderId;
        activeView = "overview";
    }

    function copyOrderId() {
        if (!order) return;
        navigator.clipboard.writeText(order.orderId);
        toast.success($_("admin_direct_mm_order_id_copied"));
    }

    function handleEscape() {
        if (activeView !== "overview") {
            activeView = "overview";
            return;
        }
        onClose();
    }

    function isRunningState(state: string): boolean {
        return state === "running";
    }

    function getHealthDot(health: string): string {
        if (health === "active") return "bg-success";
        if (health === "gone") return "bg-error";
        return "bg-warning";
    }

    function getHealthLabel(health: string, runtimeState = ""): string {
        if (!isRunningState(runtimeState))
            return $_("admin_direct_mm_not_running");
        if (health === "active") return $_("admin_direct_mm_runtime_signal_healthy");
        if (health === "gone") return $_("admin_direct_mm_runtime_signal_unavailable");
        return $_("admin_direct_mm_runtime_signal_attention");
    }

    function getHealthColor(health: string, runtimeState = ""): string {
        if (!isRunningState(runtimeState)) return "text-base-content/55";
        if (health === "active") return "text-success";
        return "text-warning";
    }

    function getContextualHealthDot(health: string, runtimeState = ""): string {
        if (!isRunningState(runtimeState)) return "bg-base-content/30";
        return getHealthDot(health);
    }

    function getConnectivity(d: DirectOrderStatus): string {
        if (!d.privateStreamEventAt)
            return $_("admin_direct_mm_connectivity_inactive");
        return $_("admin_direct_mm_connectivity_active");
    }

    $: currentDisplayState = getDirectOrderDisplayState(data || order);
    $: stateLabel =
        currentDisplayState !== "unknown" ? getStateLabel(currentDisplayState) : "";
    $: isOrderRunning = isRunningState(currentDisplayState);

    $: lastUpdated = data?.lastUpdatedAt
        ? data.lastUpdatedAt.replace("T", " ").slice(0, 19)
        : "";
    $: actionAvailability = getDirectOrderActionAvailability(data || order);
    $: resolvedControllerType = data?.controllerType || order?.controllerType;
    $: isDualAccountStrategy = isDualAccountOrder({
        directExecutionMode: data?.directExecutionMode,
        controllerType: resolvedControllerType,
        makerAccountLabel: data?.makerAccountLabel,
        takerAccountLabel: data?.takerAccountLabel,
    });
    $: isBestCapacityStrategy =
        isBestCapacityDirectOrderControllerType(resolvedControllerType);
    $: isKnownStrategy =
        isKnownDirectStrategyControllerType(resolvedControllerType);
    $: fills = performance?.summary.fillCount ?? 0;
    $: recentErrors = data?.recentErrors ?? [];
    $: visibleWarnings = (order?.warnings ?? []).filter(
        isActionableDirectOrderWarning,
    );
    $: quoteAsset =
        order?.pair
            ?.split("/")
            .map((part) => part.trim())
            .filter(Boolean)[1] || "";

    $: detailEntries = (
        [
            {
                key: "performance",
                label: $_("admin_direct_mm_performance"),
                show: true,
            },
            {
                key: "config",
                label: $_("admin_direct_mm_order_config"),
                show: Boolean(data),
            },
            {
                key: "routing",
                label: $_("admin_direct_mm_account_balance"),
                show: Boolean(data),
            },
            {
                key: "exchangeOrders",
                label: $_("admin_direct_mm_exchange_orders"),
                show: Boolean(data),
            },
            {
                key: "errors",
                label: $_("admin_direct_mm_recent_errors"),
                show: recentErrors.length > 0,
            },
        ] as { key: DetailView; label: string; show: boolean }[]
    ).filter((entry) => entry.show);

    function openView(view: DetailView) {
        activeView = view;
    }

    function backToOverview() {
        activeView = "overview";
    }

    function formatQuoteMetric(
        value: string | null | undefined,
        decimals = 4,
    ): string {
        const formatted = formatDirectDecimal(value, decimals);

        return value !== null && value !== undefined && value !== "" && quoteAsset
            ? `${formatted} ${quoteAsset}`
            : formatted;
    }
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && handleEscape()} />

{#if show && order}
    <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
        {#if activeView === "performance"}
            <OrderPerformanceDialog
                {order}
                {performance}
                onBack={backToOverview}
                {onClose}
            />
        {:else if activeView === "config" && data}
            <OrderConfigDialog
                {data}
                {isDualAccountStrategy}
                {isBestCapacityStrategy}
                {isKnownStrategy}
                onBack={backToOverview}
                {onClose}
            />
        {:else if activeView === "routing" && data}
            <OrderRoutingDialog
                {order}
                {data}
                {isDualAccountStrategy}
                onBack={backToOverview}
                {onClose}
            />
        {:else if activeView === "exchangeOrders"}
            <OrderExchangeOrdersDialog
                strategyKey={data?.strategyKey}
                pair={order.pair}
                {isDualAccountStrategy}
                onBack={backToOverview}
                {onClose}
            />
        {:else if activeView === "errors"}
            <OrderErrorsDialog
                {recentErrors}
                onBack={backToOverview}
                {onClose}
            />
        {:else}
            <div
                class="modal-box bg-base-100 p-0 rounded-2xl max-w-140 shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto"
            >
                <!-- Header -->
                <div class="px-7 pt-6 pb-4">
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    class="w-5 h-5 text-primary"
                                >
                                    <path
                                        d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V8.625L14.25 1.5H5.625ZM14.25 3.75v3.375c0 .621.504 1.125 1.125 1.125h3.375"
                                    />
                                    <path d="M8.25 13.5h7.5M8.25 16.5h4.5" />
                                </svg>
                            </div>
                            <div class="flex min-w-0 flex-col gap-0.5">
                                <span
                                    class="text-xs text-base-content/50 font-semibold"
                                    >{$_("admin_direct_mm_order_details_title")}</span
                                >
                                <div
                                    class="flex max-w-[360px] items-center gap-1.5 text-base-content/35"
                                >
                                    <span
                                        class="truncate font-mono text-[11px]"
                                        title={order.orderId}>{order.orderId}</span
                                    >
                                    <button
                                        class="shrink-0 text-base-content/25 transition-colors hover:text-base-content/60"
                                        on:click={copyOrderId}
                                        aria-label={$_("copy_order_id")}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-3.5 h-3.5"
                                        >
                                            <path
                                                d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z"
                                            />
                                            <path
                                                d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button
                            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
                            on:click={onClose}
                            aria-label={$_("admin_direct_mm_close")}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                class="w-5 h-5"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                {#if loading && !data && !error}
                    <div
                        class="px-7 pb-7 flex flex-col gap-5"
                        data-testid="direct-mm-detail-loading"
                        aria-busy="true"
                    >
                        <div
                            class="rounded-2xl border border-base-300 bg-base-100 p-4"
                        >
                            <div
                                class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                                <div class="min-w-0 space-y-2">
                                    <div class="skeleton h-7 w-36 rounded-lg"></div>
                                    <div
                                        class="flex flex-wrap items-center gap-1.5"
                                    >
                                        <div
                                            class="skeleton h-5 w-20 rounded-full"
                                        ></div>
                                        <div
                                            class="skeleton h-5 w-16 rounded-full"
                                        ></div>
                                        <div
                                            class="skeleton h-5 w-28 rounded-full"
                                        ></div>
                                    </div>
                                </div>

                                <div class="flex shrink-0 items-center gap-2">
                                    <div class="skeleton h-4 w-20 rounded"></div>
                                    <div class="skeleton h-4 w-28 rounded"></div>
                                    <div class="skeleton h-6 w-6 rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-3">
                            <div class="skeleton h-20 rounded-xl"></div>
                            <div class="skeleton h-20 rounded-xl"></div>
                            <div class="skeleton h-20 rounded-xl"></div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="skeleton h-36 rounded-xl"></div>
                            <div class="skeleton h-36 rounded-xl"></div>
                        </div>

                        <div class="skeleton h-44 w-full rounded-xl"></div>
                    </div>
                {:else if error}
                    <div class="px-7 pb-16 py-12">
                        <AdminStatePanel
                            kind={error.kind}
                            context={$_("admin_direct_mm_order_diagnosis_context")}
                            title={error.title}
                            message={error.message}
                            actionLabel={error.kind === "session"
                                ? $_("admin_sign_in_again")
                                : $_("admin_direct_mm_retry_diagnosis")}
                            actionHref={error.kind === "session" ? "/login" : ""}
                            onAction={error.kind === "session"
                                ? undefined
                                : onRefresh}
                            disabled={loading || refreshing}
                            testId="direct-mm-detail-error"
                        />
                    </div>
                {:else}
                    <div class="px-7 pb-7 flex flex-col gap-5">
                        <!-- Market Info Bar -->
                        <div
                            class="rounded-2xl border border-base-300 bg-base-100 p-4"
                        >
                            <div
                                class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                                <div class="min-w-0">
                                    <div class="flex min-w-0 items-center gap-2">
                                        <span
                                            class="truncate text-xl font-bold tracking-tight text-base-content"
                                        >
                                            {order.pair}
                                        </span>
                                    </div>
                                    <div
                                        class="mt-2 flex min-w-0 flex-wrap items-center gap-1.5"
                                    >
                                        <span
                                            class="rounded-full border border-base-300 bg-base-200 px-2 py-0.5 text-[10px] font-semibold capitalize text-base-content/70"
                                        >
                                            {order.exchangeName}
                                        </span>
                                        {#if stateLabel}
                                            <span
                                                class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-success"
                                            >
                                                {stateLabel}
                                            </span>
                                        {/if}
                                        <span
                                            class="max-w-[220px] truncate rounded-full bg-base-200 px-2 py-0.5 text-[10px] font-medium text-base-content/55"
                                            title={order.strategyName}
                                        >
                                            {order.strategyName}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    class="flex shrink-0 items-center justify-between gap-2 sm:justify-end"
                                >
                                    <div
                                        class="flex items-center gap-1.5 text-base-content/55"
                                    >
                                        <span
                                            class="text-[10px] uppercase tracking-wide text-base-content/35"
                                        >
                                            {$_("admin_direct_mm_last_updated_label")}
                                        </span>
                                        <span class="font-mono text-[10px]">
                                            {lastUpdated || $_("admin_direct_mm_na")}
                                        </span>
                                        <button
                                            type="button"
                                            class="btn btn-ghost btn-xs h-6 min-h-6 w-6 rounded-full p-0 text-base-content/55 hover:text-base-content"
                                            on:click={onRefresh}
                                            disabled={loading || refreshing}
                                            aria-label={$_(
                                                "admin_direct_mm_refresh_order_diagnosis",
                                            )}
                                            title={$_("admin_direct_mm_refresh")}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="13"
                                                height="13"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                class={refreshing
                                                    ? "animate-spin"
                                                    : ""}
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
                                                />
                                                <path d="M21 3v5h-5" />
                                            </svg>
                                            <span class="sr-only">
                                                {refreshing
                                                    ? $_(
                                                          "admin_direct_mm_refreshing_diagnosis",
                                                      )
                                                    : $_("admin_direct_mm_refresh")}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Warnings Banner -->
                        {#if visibleWarnings.length > 0}
                            <div class="flex flex-col gap-1.5">
                                {#each visibleWarnings as warning}
                                    <div
                                        class="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-3.5 h-3.5 text-warning shrink-0"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <span class="text-xs text-warning"
                                            >{explainDirectOrderWarning(warning)}</span
                                        >
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- Key Metrics Row -->
                        <div class="grid grid-cols-3 gap-3">
                            <div
                                class="border border-base-300 rounded-xl p-3 text-center"
                            >
                                <span
                                    class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                    >{$_("admin_direct_mm_final_net_pnl")}</span
                                >
                                <span
                                    class="text-sm font-bold text-base-content block"
                                    >{formatQuoteMetric(
                                        performance?.summary.netPnlQuote,
                                    )}</span
                                >
                            </div>

                            <div
                                class="border border-base-300 rounded-xl p-3 text-center"
                            >
                                <span
                                    class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                    >{$_("admin_direct_mm_volume")}</span
                                >
                                <span
                                    class="text-sm font-bold text-base-content block"
                                    >{formatQuoteMetric(
                                        performance?.summary.tradedQuoteVolume,
                                        2,
                                    )}</span
                                >
                            </div>

                            <div
                                class="border border-base-300 rounded-xl p-3 text-center"
                            >
                                <span
                                    class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                    >{$_("admin_direct_mm_fills")}</span
                                >
                                <span
                                    class="text-sm font-bold text-base-content block"
                                    >{fills}</span
                                >
                            </div>
                        </div>

                        <!-- Status Cards Row -->
                        <div class="grid grid-cols-2 gap-4">
                            <!-- General Status -->
                            <div class="border border-base-300 rounded-xl p-4">
                                <div class="flex items-center gap-1.5 mb-3 h-5">
                                    <div
                                        class="w-3.5 h-3.5 flex items-center justify-center"
                                    >
                                        <span
                                            class="text-primary text-[10px] font-bold leading-none"
                                            >{"<>"}</span
                                        >
                                    </div>
                                    <span class="text-xs font-bold text-base-content"
                                        >{$_("admin_direct_mm_general_status")}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-2"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_("admin_direct_mm_order_state")}</span
                                    >
                                    <span
                                        class="text-xs font-semibold bg-base-200 px-2 py-0.5 rounded capitalize"
                                        >{stateLabel}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-2"
                                >
                                    <span
                                        class="text-xs text-base-content/60 tracking-wider capitalize"
                                        >{$_(
                                            "admin_direct_mm_last_updated_label",
                                        )}</span
                                    >
                                    <span class="text-[10px] text-base-content/50"
                                        >{lastUpdated ||
                                            $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                {#if order.createdAt}
                                    <div
                                        class="flex items-center justify-between h-6"
                                    >
                                        <span class="text-xs text-base-content/60">
                                            {$_("admin_direct_mm_created_at")}
                                        </span>
                                        <span class="text-[10px] text-base-content/50">
                                            {formatTimestamp(order.createdAt)}
                                        </span>
                                    </div>
                                {/if}
                            </div>

                            <!-- Health Metrics -->
                            <div class="border border-base-300 rounded-xl p-4">
                                <div class="flex items-center gap-1.5 mb-3 h-5">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        class="w-3.5 h-3.5 text-primary"
                                    >
                                        <path
                                            fill-rule="evenodd"
                                            d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    <span class="text-xs font-bold text-base-content"
                                        >{$_("admin_direct_mm_health_metrics")}</span
                                    >
                                </div>
                                {#if data}
                                    <div
                                        class="flex items-center justify-between h-6 mb-2"
                                    >
                                        <span class="text-xs text-base-content/60"
                                            >{$_(
                                                "admin_direct_mm_executor_health",
                                            )}</span
                                        >
                                        <div
                                            class="flex items-center gap-1.5 tooltip tooltip-left"
                                            data-tip={data.executorHealth ===
                                            "stale"
                                                ? $_("admin_direct_mm_stale_tooltip")
                                                : ""}
                                        >
                                            <span
                                                class="w-2 h-2 rounded-full {getContextualHealthDot(
                                                    data.executorHealth,
                                                    currentDisplayState,
                                                )}"
                                            ></span>
                                            <span
                                                class="text-xs font-semibold {getHealthColor(
                                                    data.executorHealth,
                                                    currentDisplayState,
                                                )}"
                                                >{getHealthLabel(
                                                    data.executorHealth,
                                                    currentDisplayState,
                                                )}</span
                                            >
                                        </div>
                                    </div>

                                    <div
                                        class="flex items-center justify-between h-6"
                                    >
                                        <span class="text-xs text-base-content/60"
                                            >{$_(
                                                "admin_direct_mm_connectivity",
                                            )}</span
                                        >
                                        <span
                                            class="text-xs font-semibold text-base-content/70"
                                            >{getConnectivity(data)}</span
                                        >
                                    </div>
                                {:else}
                                    <div class="h-14 flex items-center">
                                        <span class="text-xs text-base-content/40"
                                            >{$_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Detail Drill-down Entries -->
                        {#if detailEntries.length > 0}
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {#each detailEntries as entry}
                                    <button
                                        type="button"
                                        class="flex items-center justify-between border border-base-300 rounded-xl px-4 h-12 hover:bg-base-200/60 transition-colors"
                                        on:click={() => openView(entry.key)}
                                    >
                                        <span
                                            class="text-xs font-semibold text-base-content capitalize"
                                            >{entry.label}</span
                                        >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class="text-base-content/40"
                                        >
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </button>
                                {/each}
                            </div>
                        {/if}

                        <!-- Actions -->
                        <div class="flex gap-3 mt-2">
                            <button
                                class="btn bg-violet-50 hover:bg-violet-100 border-none text-slate-700 w-[120px] h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-none"
                                on:click={onClose}
                            >
                                {$_("close")}
                            </button>
                            {#if actionAvailability.canStop}
                                <button
                                    class="btn flex-1 bg-red-600 hover:bg-red-700 border-none text-white h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14.5px] shadow-[0_10px_24px_-12px_rgba(220,38,38,0.9)] flex items-center justify-center gap-1.5"
                                    on:click={onStopOrder}
                                >
                                    {$_("admin_direct_mm_confirm_stop")}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        class="ml-1"
                                    >
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                    </svg>
                                </button>
                                {#if actionAvailability.canRemove}
                                    <button
                                        class="btn bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-none"
                                        on:click={onRemoveOrder}
                                    >
                                        {$_("admin_direct_mm_remove")}
                                    </button>
                                {/if}
                            {:else}
                                {#if actionAvailability.canResume}
                                    <button
                                        class="btn flex-1 bg-indigo-600 hover:bg-indigo-700 border-none text-white h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14.5px] shadow-[0_10px_24px_-12px_rgba(79,70,229,0.9)] flex items-center justify-center gap-1.5"
                                        on:click={onStartOrder}
                                    >
                                        {$_("admin_direct_mm_resume_order")}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </button>
                                {/if}
                                {#if actionAvailability.canRemove}
                                    <button
                                        class="btn bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 {actionAvailability.canResume
                                            ? ''
                                            : 'flex-1'} h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-none"
                                        on:click={onRemoveOrder}
                                    >
                                        {$_("admin_direct_mm_remove")}
                                    </button>
                                {/if}
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}
