<script lang="ts">
    import BigNumber from "bignumber.js";
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import type {
        DirectOrderSummary,
        DirectOrderStatus,
    } from "$lib/types/hufi/admin-direct-market-making";
    import {
        formatTimestamp,
        resolveInventorySkewAllocation,
        aggregateBalancesByAsset,
        isBestCapacityDirectOrderControllerType,
        isDualDirectOrderControllerType,
    } from "$lib/helpers/market-making/direct/helpers";

    export let show = false;
    export let order: DirectOrderSummary | null = null;
    export let data: DirectOrderStatus | null = null;
    export let loading = false;
    export let onClose: () => void;
    export let onStartOrder: () => void;
    export let onStopOrder: () => void;
    export let onRemoveOrder: () => void;

    function copyOrderId() {
        if (!order) return;
        navigator.clipboard.writeText(order.orderId);
        toast.success($_("admin_direct_mm_order_id_copied"));
    }

    function getHealthDot(health: string): string {
        if (health === "active") return "bg-success";
        if (health === "gone") return "bg-error";
        return "bg-warning";
    }

    function getHealthLabel(health: string): string {
        return health.charAt(0).toUpperCase() + health.slice(1);
    }

    function getHealthColor(health: string): string {
        if (health === "active") return "text-success";
        if (health === "gone") return "text-error";
        return "text-warning";
    }

    function getConnectivity(d: DirectOrderStatus): string {
        if (!d.privateStreamEventAt)
            return $_("admin_direct_mm_connectivity_inactive");
        return $_("admin_direct_mm_connectivity_active");
    }

    function formatTimeAgo(iso: string | null): string {
        if (!iso) return $_("admin_direct_mm_na");
        const diffMs = Date.now() - Date.parse(iso);
        if (diffMs < 0) return $_("admin_direct_mm_just_now");
        const seconds = Math.floor(diffMs / 1000);
        if (seconds < 60)
            return $_("admin_direct_mm_seconds_ago", { values: { seconds } });
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60)
            return $_("admin_direct_mm_minutes_ago", {
                values: { m: minutes },
            });
        const hours = Math.floor(minutes / 60);
        return $_("admin_direct_mm_hours_ago", { values: { h: hours } });
    }

    function formatSpread(val: string | null | undefined): string {
        if (val === null || val === undefined || val === "")
            return $_("admin_direct_mm_na");
        return new BigNumber(val).multipliedBy(100).toString() + "%";
    }

    $: stateLabel = data
        ? data.runtimeState.charAt(0).toUpperCase() + data.runtimeState.slice(1)
        : order?.runtimeState
          ? order.runtimeState.charAt(0).toUpperCase() +
            order.runtimeState.slice(1)
          : "";

    $: lastUpdated = data?.lastUpdatedAt
        ? data.lastUpdatedAt.replace("T", " ").slice(0, 19)
        : "";
    $: runtimeState = order?.runtimeState;
    $: isRunning = runtimeState === "running" || runtimeState === "active";
    $: isStale = runtimeState === "stale";
    $: isResumable = runtimeState === "stopped" || runtimeState === "created";
    $: resolvedControllerType = data?.controllerType || order?.controllerType;
    $: isDualAccountStrategy =
        isDualDirectOrderControllerType(resolvedControllerType);
    $: isBestCapacityStrategy =
        isBestCapacityDirectOrderControllerType(resolvedControllerType);
    $: skewBalances = data
        ? isDualAccountStrategy
            ? aggregateBalancesByAsset(data.inventoryBalances)
            : data.inventoryBalances
        : [];
    $: inventorySkew =
        data && order
            ? resolveInventorySkewAllocation(
                  skewBalances,
                  order.pair,
                  data.spread?.bid,
                  data.spread?.ask,
              )
            : null;
    $: fills1h = data?.fillCount1h ?? 0;

    $: makerBalances =
        data?.inventoryBalances.filter((b) => b.accountLabel === "maker") ?? [];
    $: takerBalances =
        data?.inventoryBalances.filter((b) => b.accountLabel === "taker") ?? [];
    $: recentErrors = data?.recentErrors ?? [];
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show && order}
    <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
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
                        <div class="flex flex-col">
                            <span
                                class="text-xs text-base-content/50 font-semibold"
                                >{$_(
                                    "admin_direct_mm_order_details_title",
                                )}</span
                            >
                            <div class="flex items-center gap-1.5">
                                <span
                                    class="text-sm font-bold text-base-content font-mono"
                                    >{order.orderId}</span
                                >
                                <button
                                    class="text-base-content/30 hover:text-base-content/60 transition-colors"
                                    on:click={copyOrderId}
                                    aria-label="Copy order ID"
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

            {#if loading && !data}
                <div class="px-7 pb-16 flex items-center justify-center py-12">
                    <span
                        class="loading loading-spinner loading-md text-primary"
                    ></span>
                </div>
            {:else}
                <div class="px-7 pb-7 flex flex-col gap-5">
                    <!-- Market Info Bar -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <span
                            class="text-xs font-bold bg-base-200 px-2.5 py-1 rounded capitalize"
                            >{order.exchangeName}</span
                        >
                        <span
                            class="text-xs font-bold bg-base-200 px-2.5 py-1 rounded"
                            >{order.pair}</span
                        >
                        <span
                            class="text-xs text-base-content/50 px-2.5 py-1 rounded bg-base-200"
                            >{$_("admin_direct_mm_strategy_label")}: {order.strategyName}</span
                        >
                        {#if order.createdAt}
                            <span
                                class="text-[10px] text-base-content/40 ml-auto"
                                >{$_("admin_direct_mm_created_at")}: {formatTimestamp(
                                    order.createdAt,
                                )}</span
                            >
                        {/if}
                    </div>

                    <!-- Warnings Banner -->
                    {#if order.warnings && order.warnings.length > 0}
                        <div class="flex flex-col gap-1.5">
                            {#each order.warnings as warning}
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
                                        >{warning}</span
                                    >
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <!-- Key Metrics Row -->
                    <div class="grid grid-cols-3 gap-3">
                        <!-- Spread -->
                        <div
                            class="border border-base-300 rounded-xl p-3 text-center"
                        >
                            <span
                                class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                >{$_("admin_direct_mm_spread_label")}</span
                            >
                            {#if data?.spread}
                                <span
                                    class="text-sm font-bold text-base-content block"
                                    >{data.spread.absolute}</span
                                >
                                <span class="text-[10px] text-base-content/40"
                                    >{data.spread.bid} / {data.spread.ask}</span
                                >
                            {:else}
                                <span class="text-sm text-base-content/30"
                                    >{$_("admin_direct_mm_no_spread")}</span
                                >
                            {/if}
                        </div>

                        <!-- Last Tick Ago -->
                        <div
                            class="border border-base-300 rounded-xl p-3 text-center"
                        >
                            <span
                                class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                >{$_("admin_direct_mm_last_tick_ago")}</span
                            >
                            <span
                                class="text-sm font-bold text-base-content block"
                                >{formatTimeAgo(
                                    data?.lastTickAt ?? order.lastTickAt,
                                )}</span
                            >
                        </div>

                        <div
                            class="border border-base-300 rounded-xl p-3 text-center"
                        >
                            <span
                                class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                >{$_("admin_direct_mm_fills_1h")}</span
                            >
                            <span
                                class="text-sm font-bold text-base-content block"
                                >{fills1h}</span
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
                                <span
                                    class="text-xs font-bold text-base-content"
                                    >{$_(
                                        "admin_direct_mm_general_status",
                                    )}</span
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
                            <div class="flex items-center justify-between h-6">
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
                                <span
                                    class="text-xs font-bold text-base-content"
                                    >{$_(
                                        "admin_direct_mm_health_metrics",
                                    )}</span
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
                                            ? $_(
                                                  "admin_direct_mm_stale_tooltip",
                                              )
                                            : ""}
                                    >
                                        <span
                                            class="w-2 h-2 rounded-full {getHealthDot(
                                                data.executorHealth,
                                            )}"
                                        ></span>
                                        <span
                                            class="text-xs font-semibold {getHealthColor(
                                                data.executorHealth,
                                            )}"
                                            >{getHealthLabel(
                                                data.executorHealth,
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

                    {#if data}
                        <div>
                            <div
                                class="flex items-center justify-between mb-3 h-5"
                            >
                                <div class="flex items-center gap-1.5">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        class="w-3.5 h-3.5 text-primary"
                                    >
                                        <path
                                            d="M3 4.75A1.75 1.75 0 0 1 4.75 3h10.5A1.75 1.75 0 0 1 17 4.75v10.5A1.75 1.75 0 0 1 15.25 17H4.75A1.75 1.75 0 0 1 3 15.25V4.75Z"
                                        />
                                    </svg>
                                    <span
                                        class="text-xs font-bold text-base-content"
                                        >{$_(
                                            "admin_direct_mm_account_routing",
                                        )}</span
                                    >
                                </div>
                            </div>

                            {#if isDualAccountStrategy}
                                <div class="flex items-center gap-2">
                                    <div
                                        class="flex-1 border border-base-300 rounded-xl p-3 text-center"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                            >{$_(
                                                "admin_direct_mm_maker_account",
                                            )}</span
                                        >
                                        <span
                                            class="text-sm font-bold text-base-content block truncate"
                                            >{data.makerAccountName ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                    <div
                                        class="flex flex-col items-center gap-0.5 shrink-0"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-4 h-4 text-base-content/30"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-4 h-4 text-base-content/30 rotate-180"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div
                                        class="flex-1 border border-base-300 rounded-xl p-3 text-center"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                            >{$_(
                                                "admin_direct_mm_taker_account",
                                            )}</span
                                        >
                                        <span
                                            class="text-sm font-bold text-base-content block truncate"
                                            >{data.takerAccountName ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                </div>
                                {#if data.orderConfig?.dynamicRoleSwitching}
                                    <div
                                        class="flex items-center gap-1.5 mt-2 px-1"
                                    >
                                        <span
                                            class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                                        ></span>
                                        <span
                                            class="text-[10px] text-base-content/50"
                                            >{$_(
                                                "admin_direct_mm_dynamic_role_switching",
                                            )}</span
                                        >
                                    </div>
                                {/if}
                            {:else}
                                <div class="grid grid-cols-2 gap-3">
                                    <div
                                        class="border border-base-300 rounded-xl p-3"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                            >{$_(
                                                "admin_direct_mm_account_label",
                                            )}</span
                                        >
                                        <span
                                            class="text-sm font-bold text-base-content block"
                                            >{data.accountLabel ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                    <div
                                        class="border border-base-300 rounded-xl p-3"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold block mb-1"
                                            >{$_(
                                                "admin_direct_mm_api_key",
                                            )}</span
                                        >
                                        <span
                                            class="text-sm font-bold text-base-content block"
                                            >{data.apiKeyId ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- Order Config -->
                    <div>
                        <div class="flex items-center justify-between mb-3 h-5">
                            <div class="flex items-center gap-1.5">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    class="w-3.5 h-3.5 text-primary"
                                >
                                    <path
                                        d="M4.75 3A1.75 1.75 0 0 0 3 4.75v10.5C3 16.216 3.784 17 4.75 17h10.5A1.75 1.75 0 0 0 17 15.25V4.75A1.75 1.75 0 0 0 15.25 3H4.75ZM5.5 6.75A.75.75 0 0 1 6.25 6h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Z"
                                    />
                                </svg>
                                <span
                                    class="text-xs font-bold text-base-content"
                                    >{$_("admin_direct_mm_order_config")}</span
                                >
                            </div>
                            <span
                                class="text-[10px] text-base-content/40 font-semibold"
                                >{$_("admin_direct_mm_order_config_hint")}</span
                            >
                        </div>

                        {#if isDualAccountStrategy}
                            <!-- Volume & Cycle Progress -->
                            <div class="grid grid-cols-2 gap-3 mb-3">
                                <div
                                    class="border border-base-300 rounded-xl p-3"
                                >
                                    <div
                                        class="flex items-center justify-between mb-2"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold"
                                            >{$_(
                                                isBestCapacityStrategy
                                                    ? "admin_direct_mm_max_order_amount"
                                                    : "admin_direct_mm_order_amount",
                                            )}</span
                                        >
                                    </div>
                                    <span
                                        class="text-lg font-bold text-base-content block"
                                        >{data?.orderConfig?.orderAmount}</span
                                    >
                                    <span
                                        class="text-[10px] text-base-content/40"
                                    >
                                        {$_(
                                            "admin_direct_mm_order_amount_small_hint",
                                        )}
                                    </span>
                                </div>
                                <div
                                    class="border border-base-300 rounded-xl p-3"
                                >
                                    <div
                                        class="flex items-center justify-between mb-2"
                                    >
                                        <span
                                            class="text-[10px] text-base-content/40 font-semibold"
                                            >{$_(
                                                "admin_direct_mm_cycle_progress",
                                            )}</span
                                        >
                                    </div>
                                    <span
                                        class="text-lg font-bold text-base-content block"
                                        >{data?.orderConfig
                                            .publishedCycles}</span
                                    >
                                    <span
                                        class="text-[10px] text-base-content/40"
                                        >{$_(
                                            "admin_direct_mm_published_cycles",
                                        )}</span
                                    >
                                </div>
                            </div>

                            <!-- Dual Account Config -->
                            <div
                                class="border border-base-300 rounded-xl p-4 mb-3"
                            >
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            isBestCapacityStrategy
                                                ? "admin_direct_mm_daily_volume_target_config"
                                                : "admin_direct_mm_base_increment_percentage",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{isBestCapacityStrategy
                                            ? data?.orderConfig
                                                  ?.targetQuoteVolume ||
                                              $_("admin_direct_mm_na")
                                            : data?.orderConfig
                                                  ?.baseIncrementPercentage ||
                                              $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            "admin_direct_mm_realized_pnl_quote",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{data?.orderConfig?.realizedPnlQuote ||
                                            $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            isBestCapacityStrategy
                                                ? "admin_direct_mm_interval_optional"
                                                : "admin_direct_mm_interval_time",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{data?.orderConfig?.baseIntervalTime ??
                                            $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                {#if !isBestCapacityStrategy}
                                    <div
                                        class="flex items-center justify-between h-6 mb-1"
                                    >
                                        <span
                                            class="text-xs text-base-content/60"
                                            >{$_(
                                                "admin_direct_mm_num_trades",
                                            )}</span
                                        >
                                        <span
                                            class="text-xs font-semibold text-base-content"
                                            >{data?.orderConfig?.numTrades ??
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                    <div
                                        class="flex items-center justify-between h-6 mb-1"
                                    >
                                        <span
                                            class="text-xs text-base-content/60"
                                            >{$_(
                                                "admin_direct_mm_price_push_rate",
                                            )}</span
                                        >
                                        <span
                                            class="text-xs font-semibold text-base-content"
                                            >{data?.orderConfig?.pricePushRate ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                    <div
                                        class="flex items-center justify-between h-6 mb-1"
                                    >
                                        <span
                                            class="text-xs text-base-content/60"
                                            >{$_(
                                                "admin_direct_mm_post_only_side",
                                            )}</span
                                        >
                                        <span
                                            class="text-xs font-semibold text-base-content capitalize"
                                            >{data?.orderConfig?.postOnlySide ||
                                                $_("admin_direct_mm_na")}</span
                                        >
                                    </div>
                                {/if}
                            </div>
                        {:else}
                            <div class="border border-base-300 rounded-xl p-4">
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            "admin_direct_mm_order_amount",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{data?.orderConfig?.orderAmount ||
                                            $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_("admin_direct_mm_layers")}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{data?.orderConfig?.numberOfLayers ||
                                            $_("admin_direct_mm_na")}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6 mb-1"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            "admin_direct_mm_bid_spread",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{formatSpread(
                                            data?.orderConfig?.bidSpread,
                                        )}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center justify-between h-6"
                                >
                                    <span class="text-xs text-base-content/60"
                                        >{$_(
                                            "admin_direct_mm_ask_spread",
                                        )}</span
                                    >
                                    <span
                                        class="text-xs font-semibold text-base-content"
                                        >{formatSpread(
                                            data?.orderConfig?.askSpread,
                                        )}</span
                                    >
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Inventory Balances -->
                    <div>
                        <div class="flex items-center justify-between mb-3 h-5">
                            <div class="flex items-center gap-1.5">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    class="w-3.5 h-3.5 text-primary"
                                >
                                    <path
                                        d="M1 4.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 2H3.25A2.25 2.25 0 0 0 1 4.25ZM1 7.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 5H3.25A2.25 2.25 0 0 0 1 7.25ZM7 8a1 1 0 0 1 1 1 2 2 0 1 0 4 0 1 1 0 0 1 1-1h4.75A2.25 2.25 0 0 1 20 10.25v5.5A2.25 2.25 0 0 1 17.75 18H2.25A2.25 2.25 0 0 1 0 15.75v-5.5A2.25 2.25 0 0 1 2.25 8H7Z"
                                    />
                                </svg>
                                <span
                                    class="text-xs font-bold text-base-content"
                                    >{$_(
                                        "admin_direct_mm_inventory_balances",
                                    )}</span
                                >
                            </div>
                            <span
                                class="text-[10px] text-base-content/40 font-semibold"
                                >{$_(
                                    "admin_direct_mm_currency_allocation",
                                )}</span
                            >
                        </div>

                        {#if isDualAccountStrategy && makerBalances.length > 0}
                            <!-- Dual account: side-by-side tables -->
                            <div class="grid grid-cols-2 gap-3">
                                {#each [{ label: $_("admin_direct_mm_maker_balances"), balances: makerBalances }, { label: $_("admin_direct_mm_taker_balances"), balances: takerBalances }] as group}
                                    <div
                                        class="border border-base-300 rounded-xl overflow-hidden"
                                    >
                                        <div
                                            class="px-3 py-2 bg-base-200/50 border-b border-base-300"
                                        >
                                            <span
                                                class="text-[10px] font-bold text-base-content/50 capitalize"
                                                >{group.label}</span
                                            >
                                        </div>
                                        {#if group.balances.length > 0}
                                            {#each group.balances as balance}
                                                <div
                                                    class="flex items-center justify-between px-3 py-2.5 border-b border-base-300/50 last:border-0"
                                                >
                                                    <div
                                                        class="flex items-center gap-1.5"
                                                    >
                                                        <div
                                                            class="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center"
                                                        >
                                                            <span
                                                                class="text-[7px] font-bold text-primary"
                                                                >{balance.asset.slice(
                                                                    0,
                                                                    3,
                                                                )}</span
                                                            >
                                                        </div>
                                                        <span
                                                            class="text-xs font-semibold text-base-content"
                                                            >{balance.asset}</span
                                                        >
                                                    </div>
                                                    <span
                                                        class="text-xs font-bold text-base-content"
                                                        >{balance.total}</span
                                                    >
                                                </div>
                                            {/each}
                                        {:else}
                                            <div class="px-3 py-4 text-center">
                                                <span
                                                    class="text-xs text-base-content/40"
                                                    >{$_(
                                                        "admin_direct_mm_no_balances",
                                                    )}</span
                                                >
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead>
                                        <tr>
                                            <th
                                                class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                                                >{$_(
                                                    "admin_direct_mm_asset",
                                                )}</th
                                            >
                                            <th
                                                class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                                                >{$_(
                                                    "admin_direct_mm_free_balance",
                                                )}</th
                                            >
                                            <th
                                                class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                                                >{$_(
                                                    "admin_direct_mm_used_balance",
                                                )}</th
                                            >
                                            <th
                                                class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize text-right border-b border-base-300"
                                                >{$_(
                                                    "admin_direct_mm_total",
                                                )}</th
                                            >
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#if data && data.inventoryBalances.length > 0}
                                            {#each data.inventoryBalances as balance}
                                                <tr
                                                    class="border-b border-base-300/50 last:border-0"
                                                >
                                                    <td class="py-3 px-3">
                                                        <div
                                                            class="flex items-center gap-2"
                                                        >
                                                            <div
                                                                class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"
                                                            >
                                                                <span
                                                                    class="text-[8px] font-bold text-primary"
                                                                    >{balance.asset.slice(
                                                                        0,
                                                                        4,
                                                                    )}</span
                                                                >
                                                            </div>
                                                            <span
                                                                class="text-sm font-semibold text-base-content"
                                                                >{balance.asset}</span
                                                            >
                                                        </div>
                                                    </td>
                                                    <td
                                                        class="py-3 px-3 text-sm text-base-content/70"
                                                        >{balance.free}</td
                                                    >
                                                    <td
                                                        class="py-3 px-3 text-sm text-base-content/70"
                                                        >{balance.used}</td
                                                    >
                                                    <td
                                                        class="py-3 px-3 text-sm font-bold text-base-content text-right"
                                                        >{balance.total}</td
                                                    >
                                                </tr>
                                            {/each}
                                        {:else}
                                            <tr>
                                                <td
                                                    colspan="4"
                                                    class="py-6 text-center text-sm text-base-content/40"
                                                    >{$_(
                                                        "admin_direct_mm_no_balances",
                                                    )}</td
                                                >
                                            </tr>
                                        {/if}
                                    </tbody>
                                </table>
                            </div>
                        {/if}

                        <!-- Inventory Skew Bar (aggregated balances for dual, all for single) -->
                        {#if inventorySkew !== null}
                            <div class="mt-3">
                                <div
                                    class="flex items-center justify-between mb-1"
                                >
                                    <span
                                        class="text-[10px] text-base-content/40 font-semibold"
                                        >{$_(
                                            "admin_direct_mm_inventory_skew",
                                        )}</span
                                    >
                                    <span
                                        class="text-[10px] text-base-content/50"
                                        >{inventorySkew.baseAsset}
                                        {inventorySkew.basePercent}% / {inventorySkew.quoteAsset}
                                        {inventorySkew.quotePercent}%</span
                                    >
                                </div>
                                <div
                                    class="w-full h-2 rounded-full bg-base-200 overflow-hidden flex"
                                >
                                    <div
                                        class="h-full bg-primary/70 rounded-l-full transition-all"
                                        style="width: {inventorySkew.basePercent}%"
                                    ></div>
                                    <div
                                        class="h-full bg-secondary/50 rounded-r-full transition-all"
                                        style="width: {inventorySkew.quotePercent}%"
                                    ></div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if recentErrors.length > 0}
                        <div>
                            <div class="flex items-center gap-1.5 mb-3 h-5">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    class="w-3.5 h-3.5 text-error"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <span
                                    class="text-xs font-bold text-base-content"
                                    >{$_("admin_direct_mm_recent_errors")}</span
                                >
                            </div>
                            <div class="flex flex-col gap-1.5">
                                {#each recentErrors as err}
                                    <div
                                        class="flex items-center justify-between bg-base-200/50 rounded-lg px-3 py-2"
                                    >
                                        <span
                                            class="text-xs text-base-content/70"
                                            >{err.message}</span
                                        >
                                        <span
                                            class="text-[10px] text-base-content/40 shrink-0 ml-2"
                                            >{err.ts
                                                .replace("T", " ")
                                                .slice(11, 19)}</span
                                        >
                                    </div>
                                {/each}
                            </div>
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
                        {#if isRunning || isStale}
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
                            {#if isStale}
                                <button
                                    class="btn bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-none"
                                    on:click={onRemoveOrder}
                                >
                                    {$_("admin_direct_mm_remove")}
                                </button>
                            {/if}
                        {:else}
                            {#if isResumable}
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
                            <button
                                class="btn bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 {isResumable
                                    ? ''
                                    : 'flex-1'} h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-none"
                                on:click={onRemoveOrder}
                            >
                                {$_("admin_direct_mm_remove")}
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}
