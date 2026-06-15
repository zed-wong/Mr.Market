<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import {
        fetchAdminOrders,
        type AdminOrder,
    } from "$lib/helpers/api/trading";

    export let orderId: string;
    export let pair: string;
    export let isDualAccountStrategy = false;
    export let onBack: () => void;
    export let onClose: () => void;

    const REFRESH_INTERVAL_MS = 5000;

    const statusTone: Record<string, string> = {
        pending_create: "bg-warning/10 text-warning",
        open: "bg-info/10 text-info",
        partially_filled: "bg-warning/10 text-warning",
        pending_cancel: "bg-warning/10 text-warning",
        filled: "bg-success/10 text-success",
        cancelled: "bg-base-content/5 text-base-content/60",
        failed: "bg-error/10 text-error",
        external_missing: "bg-error/10 text-error",
        internal_missing: "bg-error/10 text-error",
    };

    let rows: AdminOrder[] = [];
    let loading = true;
    let error: string | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;

    const labelize = (value?: string | null) =>
        (value || $_("admin_direct_mm_na")).replaceAll("_", " ");

    const formatNumber = (value: string | number) => {
        const number = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(number)) {
            return String(value || "0");
        }
        return new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 8,
        }).format(number);
    };

    const formatTime = (value?: string | null) => {
        if (!value) {
            return $_("admin_direct_mm_na");
        }
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) {
            return value;
        }
        return date.toLocaleString(undefined, {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    const fillPercent = (order: AdminOrder) => {
        const value = Number(order.fillPercent);
        if (Number.isFinite(value)) {
            return Math.max(0, Math.min(100, value));
        }
        return 0;
    };

    async function load(options: { silent?: boolean } = {}) {
        if (inFlight) {
            return;
        }
        inFlight = true;
        if (!options.silent) {
            loading = true;
        }
        try {
            const response = await fetchAdminOrders({
                userOrderId: orderId,
                limit: 100,
            });
            rows = response.items;
            error = null;
        } catch (cause) {
            if (!options.silent) {
                error =
                    cause instanceof Error
                        ? cause.message
                        : $_("admin_exchange_orders_load_failed");
            }
        } finally {
            inFlight = false;
            loading = false;
        }
    }

    function autoRefresh() {
        if (
            inFlight ||
            typeof document === "undefined" ||
            document.visibilityState !== "visible"
        ) {
            return;
        }
        void load({ silent: true });
    }

    onMount(() => {
        void load();
        refreshTimer = setInterval(autoRefresh, REFRESH_INTERVAL_MS);
    });

    onDestroy(() => {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    });
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_exchange_orders")}
    {onBack}
    {onClose}
>
    <div class="mb-3 flex items-center justify-between">
        <span class="text-xs font-semibold text-base-content/60">{pair}</span>
        <span class="text-[10px] text-base-content/40">
            {$_("admin_direct_mm_exchange_orders_count", {
                values: { count: rows.length },
            })}
        </span>
    </div>

    {#if loading && rows.length === 0}
        <div
            class="flex items-center gap-3 rounded-xl border border-base-300 p-4"
            data-testid="direct-mm-exchange-orders-loading"
        >
            <span class="loading loading-spinner loading-sm text-base-content/60"
            ></span>
            <span class="text-xs text-base-content/60"
                >{$_("admin_exchange_orders_loading")}</span
            >
        </div>
    {:else if error && rows.length === 0}
        <div
            class="flex flex-col gap-3 rounded-xl border border-error/30 p-4"
            data-testid="direct-mm-exchange-orders-error"
        >
            <span class="text-xs text-base-content/60">{error}</span>
            <button
                type="button"
                class="btn btn-sm btn-primary self-start capitalize"
                on:click={() => void load()}>{$_("admin_retry")}</button
            >
        </div>
    {:else if rows.length === 0}
        <div
            class="flex flex-col items-center gap-1 rounded-xl border border-base-300 py-10 text-center"
            data-testid="direct-mm-exchange-orders-empty"
        >
            <span class="text-xs font-semibold text-base-content capitalize"
                >{$_("admin_direct_mm_exchange_orders_empty")}</span
            >
        </div>
    {:else}
        <div class="overflow-x-auto rounded-xl border border-base-300">
            <table class="table table-xs">
                <thead>
                    <tr
                        class="border-b border-base-300 text-[10px] uppercase tracking-wide text-base-content/50"
                    >
                        <th class="font-medium">{$_("time")}</th>
                        <th class="font-medium">{$_("side")}</th>
                        <th class="font-medium">{$_("type")}</th>
                        <th class="font-medium text-right">{$_("price")}</th>
                        <th class="font-medium text-right"
                            >{$_("admin_quantity")}</th
                        >
                        <th class="font-medium">{$_("admin_fill")}</th>
                        <th class="font-medium">{$_("status")}</th>
                        {#if isDualAccountStrategy}
                            <th class="font-medium"
                                >{$_("admin_direct_mm_account_label")}</th
                            >
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each rows as order (order.trackingKey)}
                        {@const percent = fillPercent(order)}
                        <tr class="border-b border-base-300 hover:bg-base-200/60">
                            <td class="font-mono text-[10px] text-base-content/70"
                                >{formatTime(
                                    order.updatedAt || order.createdAt,
                                )}</td
                            >
                            <td>
                                <span
                                    class="text-[11px] font-medium capitalize"
                                    class:text-success={order.side.toLowerCase() ===
                                        "buy"}
                                    class:text-error={order.side.toLowerCase() ===
                                        "sell"}>{order.side}</span
                                >
                            </td>
                            <td class="text-[10px] capitalize text-base-content/60">
                                {labelize(order.type || order.role)}
                            </td>
                            <td class="text-right font-mono text-[11px]"
                                >{formatNumber(order.price)}</td
                            >
                            <td class="text-right font-mono text-[11px]"
                                >{formatNumber(order.quantity)}</td
                            >
                            <td>
                                <div class="flex w-16 flex-col gap-1">
                                    <span
                                        class="font-mono text-[9px] text-base-content/50"
                                        >{percent.toFixed(0)}%</span
                                    >
                                    <div
                                        class="h-1 w-full overflow-hidden rounded-full bg-base-300"
                                    >
                                        <div
                                            class="h-full bg-base-content"
                                            style="width: {percent}%"
                                        ></div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span
                                    class="rounded-full px-2 py-0.5 text-[9px] font-medium capitalize tracking-wide {statusTone[
                                        order.status
                                    ] || 'bg-base-content/5 text-base-content/60'}"
                                    >{labelize(order.status)}</span
                                >
                            </td>
                            {#if isDualAccountStrategy}
                                <td
                                    class="text-[10px] capitalize text-base-content/60"
                                    >{labelize(order.accountLabel)}</td
                                >
                            {/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</OrderDetailSubShell>
