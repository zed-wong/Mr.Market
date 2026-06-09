<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import {
        aggregateBalancesByAsset,
        resolveInventorySkewAllocation,
    } from "$lib/helpers/market-making/direct/helpers";
    import type {
        DirectOrderSummary,
        DirectOrderStatus,
    } from "$lib/types/hufi/admin-direct-market-making";

    export let order: DirectOrderSummary;
    export let data: DirectOrderStatus | null = null;
    export let isDualAccountStrategy = false;
    export let onBack: () => void;
    export let onClose: () => void;

    $: makerBalances =
        data?.inventoryBalances.filter((b) => b.accountLabel === "maker") ?? [];
    $: takerBalances =
        data?.inventoryBalances.filter((b) => b.accountLabel === "taker") ?? [];
    $: skewBalances = data
        ? isDualAccountStrategy
            ? aggregateBalancesByAsset(data.inventoryBalances)
            : data.inventoryBalances
        : [];
    $: inventorySkew = data
        ? resolveInventorySkewAllocation(
              skewBalances,
              order.pair,
              data.spread?.bid,
              data.spread?.ask,
          )
        : null;
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_inventory_balances")}
    {onBack}
    {onClose}
>
    {#if isDualAccountStrategy && makerBalances.length > 0}
        <div class="grid grid-cols-2 gap-3">
            {#each [{ label: $_("admin_direct_mm_maker_balances"), balances: makerBalances }, { label: $_("admin_direct_mm_taker_balances"), balances: takerBalances }] as group}
                <div class="border border-base-300 rounded-xl overflow-hidden">
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
                                <div class="flex items-center gap-1.5">
                                    <div
                                        class="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center"
                                    >
                                        <span
                                            class="text-[7px] font-bold text-primary"
                                            >{balance.asset.slice(0, 3)}</span
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
                            <span class="text-xs text-base-content/40"
                                >{$_("admin_direct_mm_no_balances")}</span
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
                            >{$_("admin_direct_mm_asset")}</th
                        >
                        <th
                            class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                            >{$_("admin_direct_mm_free_balance")}</th
                        >
                        <th
                            class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                            >{$_("admin_direct_mm_used_balance")}</th
                        >
                        <th
                            class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize text-right border-b border-base-300"
                            >{$_("admin_direct_mm_total")}</th
                        >
                    </tr>
                </thead>
                <tbody>
                    {#if data && data.inventoryBalances.length > 0}
                        {#each data.inventoryBalances as balance}
                            <tr class="border-b border-base-300/50 last:border-0">
                                <td class="py-3 px-3">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"
                                        >
                                            <span
                                                class="text-[8px] font-bold text-primary"
                                                >{balance.asset.slice(0, 4)}</span
                                            >
                                        </div>
                                        <span
                                            class="text-sm font-semibold text-base-content"
                                            >{balance.asset}</span
                                        >
                                    </div>
                                </td>
                                <td class="py-3 px-3 text-sm text-base-content/70"
                                    >{balance.free}</td
                                >
                                <td class="py-3 px-3 text-sm text-base-content/70"
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
                                >{$_("admin_direct_mm_no_balances")}</td
                            >
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    {/if}

    {#if inventorySkew !== null}
        <div class="mt-3">
            <div class="flex items-center justify-between mb-1">
                <span class="text-[10px] text-base-content/40 font-semibold"
                    >{$_("admin_direct_mm_inventory_skew")}</span
                >
                <span class="text-[10px] text-base-content/50"
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
</OrderDetailSubShell>
