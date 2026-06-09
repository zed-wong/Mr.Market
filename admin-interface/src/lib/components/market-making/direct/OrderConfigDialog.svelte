<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import {
        formatDirectSpread,
        formatEfficientMode,
    } from "$lib/helpers/market-making/direct/helpers";
    import type { DirectOrderStatus } from "$lib/types/hufi/admin-direct-market-making";

    export let data: DirectOrderStatus | null = null;
    export let isDualAccountStrategy = false;
    export let isBestCapacityStrategy = false;
    export let isKnownStrategy = false;
    export let onBack: () => void;
    export let onClose: () => void;
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_order_config")}
    {onBack}
    {onClose}
>
    <div class="mb-3 flex justify-end">
        <span class="text-[10px] text-base-content/40 font-semibold"
            >{$_("admin_direct_mm_order_config_hint")}</span
        >
    </div>

    {#if isDualAccountStrategy}
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="border border-base-300 rounded-xl p-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] text-base-content/40 font-semibold"
                        >{$_(
                            isBestCapacityStrategy
                                ? "admin_direct_mm_max_order_amount"
                                : "admin_direct_mm_order_amount",
                        )}</span
                    >
                </div>
                <span class="text-lg font-bold text-base-content block"
                    >{data?.orderConfig?.orderAmount}</span
                >
                <span class="text-[10px] text-base-content/40">
                    {$_("admin_direct_mm_order_amount_small_hint")}
                </span>
            </div>
            <div class="border border-base-300 rounded-xl p-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] text-base-content/40 font-semibold"
                        >{$_("admin_direct_mm_cycle_progress")}</span
                    >
                </div>
                <span class="text-lg font-bold text-base-content block"
                    >{data?.orderConfig.publishedCycles}</span
                >
                <span class="text-[10px] text-base-content/40"
                    >{$_("admin_direct_mm_published_cycles")}</span
                >
            </div>
        </div>

        <div class="border border-base-300 rounded-xl p-4 mb-3">
            {#if data?.orderConfig?.mode}
                <div class="flex items-center justify-between h-6 mb-1">
                    <span class="text-xs text-base-content/60">Efficient mode</span>
                    <span class="text-xs font-semibold text-base-content"
                        >{formatEfficientMode(data?.orderConfig?.mode)}</span
                    >
                </div>
            {/if}
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_(
                        isBestCapacityStrategy
                            ? "admin_direct_mm_daily_volume_target_config"
                            : "admin_direct_mm_base_increment_percentage",
                    )}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{isBestCapacityStrategy
                        ? data?.orderConfig?.targetQuoteVolume ||
                          $_("admin_direct_mm_na")
                        : data?.orderConfig?.baseIncrementPercentage ||
                          $_("admin_direct_mm_na")}</span
                >
            </div>
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_realized_pnl_quote")}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{data?.orderConfig?.realizedPnlQuote ||
                        $_("admin_direct_mm_na")}</span
                >
            </div>
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_(
                        isBestCapacityStrategy
                            ? "admin_direct_mm_interval_optional"
                            : "admin_direct_mm_interval_time",
                    )}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{data?.orderConfig?.baseIntervalTime ??
                        $_("admin_direct_mm_na")}</span
                >
            </div>
            {#if !isBestCapacityStrategy}
                <div class="flex items-center justify-between h-6 mb-1">
                    <span class="text-xs text-base-content/60"
                        >{$_("admin_direct_mm_num_trades")}</span
                    >
                    <span class="text-xs font-semibold text-base-content"
                        >{data?.orderConfig?.numTrades ??
                            $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="flex items-center justify-between h-6 mb-1">
                    <span class="text-xs text-base-content/60"
                        >{$_("admin_direct_mm_price_push_rate")}</span
                    >
                    <span class="text-xs font-semibold text-base-content"
                        >{data?.orderConfig?.pricePushRate ||
                            $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="flex items-center justify-between h-6 mb-1">
                    <span class="text-xs text-base-content/60"
                        >{$_("admin_direct_mm_post_only_side")}</span
                    >
                    <span
                        class="text-xs font-semibold text-base-content capitalize"
                        >{data?.orderConfig?.postOnlySide ||
                            $_("admin_direct_mm_na")}</span
                    >
                </div>
            {/if}
        </div>
    {:else if isKnownStrategy}
        <div class="border border-base-300 rounded-xl p-4">
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_order_amount")}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{data?.orderConfig?.orderAmount ||
                        $_("admin_direct_mm_na")}</span
                >
            </div>
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_layers")}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{data?.orderConfig?.numberOfLayers ||
                        $_("admin_direct_mm_na")}</span
                >
            </div>
            <div class="flex items-center justify-between h-6 mb-1">
                <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_bid_spread")}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{formatDirectSpread(data?.orderConfig?.bidSpread)}</span
                >
            </div>
            <div class="flex items-center justify-between h-6">
                <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_ask_spread")}</span
                >
                <span class="text-xs font-semibold text-base-content"
                    >{formatDirectSpread(data?.orderConfig?.askSpread)}</span
                >
            </div>
        </div>
    {:else}
        <div class="border border-base-300 rounded-xl p-4">
            {#each Object.entries(data?.orderConfig || {}) as [key, value]}
                {#if value !== null && value !== undefined && value !== "" && key !== "realizedPnlQuote" && key !== "publishedCycles" && key !== "completedCycles" && key !== "tradedQuoteVolume"}
                    <div class="flex items-center justify-between h-6 mb-1">
                        <span class="text-xs text-base-content/60">{key}</span>
                        <span class="text-xs font-semibold text-base-content"
                            >{typeof value === "number"
                                ? value
                                : String(value)}</span
                        >
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
</OrderDetailSubShell>
