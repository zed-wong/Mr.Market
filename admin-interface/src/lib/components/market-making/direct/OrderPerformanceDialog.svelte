<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import PnlChart from "$lib/components/market-making/direct/PnlChart.svelte";
    import { formatDirectDecimal, formatDirectBps } from "$lib/helpers/market-making/direct/helpers";
    import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";
    import type { OrderPerformance } from "$lib/types/hufi/order-performance";

    export let order: DirectOrderSummary | null = null;
    export let performance: OrderPerformance | null = null;
    export let onBack: () => void;
    export let onClose: () => void;

    $: quoteAsset =
        order?.pair
            ?.split("/")
            .map((part) => part.trim())
            .filter(Boolean)[1] || "";

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

<OrderDetailSubShell
    title={$_("admin_direct_mm_performance")}
    {onBack}
    {onClose}
>
    {#if performance?.reconciliation && !performance.reconciliation.realizedPnlMatchesStored}
        <div class="mb-3 flex justify-end">
            <span class="text-[10px] text-warning font-semibold">
                {$_("admin_direct_mm_pnl_reconciliation_mismatch")}
            </span>
        </div>
    {/if}

    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div class="border border-base-300 rounded-xl p-3">
            <span class="text-[10px] text-base-content/40 font-semibold block mb-1">
                {$_("admin_direct_mm_realized")}
            </span>
            <span class="text-sm font-bold text-base-content block">
                {formatQuoteMetric(performance?.summary.realizedPnlQuote)}
            </span>
        </div>
        <div class="border border-base-300 rounded-xl p-3">
            <span class="text-[10px] text-base-content/40 font-semibold block mb-1">
                {$_("admin_direct_mm_fees")}
            </span>
            <span class="text-sm font-bold text-base-content block">
                {formatQuoteMetric(performance?.summary.feesQuote)}
            </span>
        </div>
        <div class="border border-base-300 rounded-xl p-3">
            <span class="text-[10px] text-base-content/40 font-semibold block mb-1">
                {$_("admin_direct_mm_net")}
            </span>
            <span class="text-sm font-bold text-base-content block">
                {formatQuoteMetric(performance?.summary.netPnlQuote)}
            </span>
        </div>
        <div class="border border-base-300 rounded-xl p-3">
            <span class="text-[10px] text-base-content/40 font-semibold block mb-1">
                {$_("admin_direct_mm_volume")}
            </span>
            <span class="text-sm font-bold text-base-content block">
                {formatQuoteMetric(performance?.summary.tradedQuoteVolume, 2)}
            </span>
        </div>
        <div class="border border-base-300 rounded-xl p-3">
            <span class="text-[10px] text-base-content/40 font-semibold block mb-1">
                {$_("admin_direct_mm_effective_spread")}
            </span>
            <span class="text-sm font-bold text-base-content block">
                {formatDirectBps(performance?.summary.effectiveSpreadBps)}
            </span>
        </div>
    </div>

    <PnlChart series={performance?.series || []} />
</OrderDetailSubShell>
