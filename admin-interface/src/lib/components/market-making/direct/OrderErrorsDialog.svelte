<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import type { DirectOrderStatus } from "$lib/types/hufi/admin-direct-market-making";

    export let recentErrors: DirectOrderStatus["recentErrors"] = [];
    export let onBack: () => void;
    export let onClose: () => void;

    $: errors = recentErrors ?? [];
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_recent_errors")}
    {onBack}
    {onClose}
>
    {#if errors.length > 0}
        <div class="flex flex-col gap-1.5">
            {#each errors as err}
                <div
                    class="flex items-center justify-between bg-base-200/50 rounded-lg px-3 py-2"
                >
                    <span class="text-xs text-base-content/70">{err.message}</span>
                    <span class="text-[10px] text-base-content/40 shrink-0 ml-2"
                        >{err.ts.replace("T", " ").slice(11, 19)}</span
                    >
                </div>
            {/each}
        </div>
    {:else}
        <div class="py-6 text-center">
            <span class="text-xs text-base-content/40"
                >{$_("admin_direct_mm_no_recent_errors")}</span
            >
        </div>
    {/if}
</OrderDetailSubShell>
