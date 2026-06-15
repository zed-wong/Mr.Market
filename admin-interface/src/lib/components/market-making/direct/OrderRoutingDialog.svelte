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
    export let data: DirectOrderStatus;
    export let isDualAccountStrategy = false;
    export let onBack: () => void;
    export let onClose: () => void;

    type InventoryBalance = DirectOrderStatus["inventoryBalances"][number];

    const normalizeLabel = (value?: string | null) =>
        String(value || "")
            .trim()
            .toLowerCase();

    function resolveDualAccountBalanceGroups(
        balances: InventoryBalance[],
    ): { maker: InventoryBalance[]; taker: InventoryBalance[] } {
        const makerLabels = new Set(
            [
                "maker",
                data.makerAccountLabel,
                order.makerAccountLabel,
                data.makerAccountName,
                order.makerAccountName,
            ].map(normalizeLabel).filter(Boolean),
        );
        const takerLabels = new Set(
            [
                "taker",
                data.takerAccountLabel,
                order.takerAccountLabel,
                data.takerAccountName,
                order.takerAccountName,
            ].map(normalizeLabel).filter(Boolean),
        );
        const maker = balances.filter((balance) =>
            makerLabels.has(normalizeLabel(balance.accountLabel)),
        );
        const taker = balances.filter((balance) =>
            takerLabels.has(normalizeLabel(balance.accountLabel)),
        );

        if (maker.length > 0 || taker.length > 0) {
            return { maker, taker };
        }

        const midpoint = Math.ceil(balances.length / 2);
        return {
            maker: balances.slice(0, midpoint),
            taker: balances.slice(midpoint),
        };
    }

    $: dualAccountBalances = resolveDualAccountBalanceGroups(
        data.inventoryBalances,
    );
    $: makerBalances = dualAccountBalances.maker;
    $: takerBalances = dualAccountBalances.taker;
    $: skewBalances = isDualAccountStrategy
        ? aggregateBalancesByAsset(data.inventoryBalances)
        : data.inventoryBalances;
    $: inventorySkew = resolveInventorySkewAllocation(
        skewBalances,
        order.pair,
        data.spread?.bid,
        data.spread?.ask,
    );
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_account_balance")}
    {onBack}
    {onClose}
>
    <div class="flex flex-col gap-4">
        {#if isDualAccountStrategy}
            <div class="flex items-center gap-2">
                <div class="flex-1 border border-base-300 rounded-xl p-3 text-center">
                    <span
                        class="text-[10px] text-base-content/40 font-semibold block mb-1"
                        >{$_("admin_direct_mm_maker_account")}</span
                    >
                    <span class="text-sm font-bold text-base-content block truncate"
                        >{data.makerAccountName || $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="flex flex-col items-center gap-0.5 shrink-0">
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
                <div class="flex-1 border border-base-300 rounded-xl p-3 text-center">
                    <span
                        class="text-[10px] text-base-content/40 font-semibold block mb-1"
                        >{$_("admin_direct_mm_taker_account")}</span
                    >
                    <span class="text-sm font-bold text-base-content block truncate"
                        >{data.takerAccountName || $_("admin_direct_mm_na")}</span
                    >
                </div>
            </div>
            {#if data.orderConfig?.dynamicRoleSwitching}
                <div class="flex items-center gap-1.5 px-1">
                    <span
                        class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                    ></span>
                    <span class="text-[10px] text-base-content/50"
                        >{$_("admin_direct_mm_dynamic_role_switching")}</span
                    >
                </div>
            {/if}
        {:else}
            <div class="grid grid-cols-2 gap-3">
                <div class="border border-base-300 rounded-xl p-3">
                    <span
                        class="text-[10px] text-base-content/40 font-semibold block mb-1"
                        >{$_("admin_direct_mm_account_label")}</span
                    >
                    <span class="text-sm font-bold text-base-content block"
                        >{data.accountLabel || $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="border border-base-300 rounded-xl p-3">
                    <span
                        class="text-[10px] text-base-content/40 font-semibold block mb-1"
                        >{$_("admin_direct_mm_exchange_access")}</span
                    >
                    <span class="text-sm font-bold text-base-content block"
                        >{$_("read_trade")}</span
                    >
                    {#if data.apiKeyId}
                        <span
                            class="mt-1 block truncate font-mono text-[10px] text-base-content/40"
                            title={data.apiKeyId}
                            >{$_("admin_direct_mm_api_key_ref", {
                                values: { id: data.apiKeyId },
                            })}</span
                        >
                    {/if}
                </div>
            </div>
        {/if}

        {#if isDualAccountStrategy && (makerBalances.length > 0 || takerBalances.length > 0)}
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
                        {#if data.inventoryBalances.length > 0}
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
            <div>
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
    </div>
</OrderDetailSubShell>
