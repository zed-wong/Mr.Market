<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import RuntimeCyclePanel from "$lib/components/market-making/direct/RuntimeCyclePanel.svelte";
    import type {
        DirectOrderSummary,
        DirectOrderStatus,
    } from "$lib/types/hufi/admin-direct-market-making";

    export let order: DirectOrderSummary;
    export let data: DirectOrderStatus;
    export let isDualAccountStrategy = false;
    export let isEfficientDualAccountStrategy = false;
    export let onBack: () => void;
    export let onClose: () => void;
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_account_routing")}
    {onBack}
    {onClose}
>
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
            <div class="flex items-center gap-1.5 mt-2 px-1">
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

    {#if isEfficientDualAccountStrategy}
        <div class="mt-4">
            <RuntimeCyclePanel {data} warnings={order.warnings || []} />
        </div>
    {/if}
</OrderDetailSubShell>
