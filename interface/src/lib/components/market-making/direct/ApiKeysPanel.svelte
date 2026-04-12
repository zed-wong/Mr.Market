<script lang="ts">
    import { _ } from "svelte-i18n";
    import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

    export let apiKeys: AdminSingleKey[] = [];
    export let orders: DirectOrderSummary[] = [];

    function isConnected(apiKey: AdminSingleKey): boolean {
        return (apiKey.state || "").toLowerCase() === "alive";
    }

    function isPending(apiKey: AdminSingleKey): boolean {
        return (apiKey.state || "").toLowerCase() === "pending";
    }

    function getActivePairsCount(apiKey: AdminSingleKey): number {
        return orders.filter(
            (order) =>
                order.apiKeyId === apiKey.key_id &&
                (order.runtimeState === "running" ||
                    order.runtimeState === "active"),
        ).length;
    }

    function formatRelativeTime(value?: string): string {
        if (!value) return $_("admin_direct_mm_na");

        const timestamp = new Date(value);
        if (Number.isNaN(timestamp.getTime())) return $_("admin_direct_mm_na");

        const diffMs = timestamp.getTime() - Date.now();
        const diffMinutes = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);
        const formatter = new Intl.RelativeTimeFormat(undefined, {
            numeric: "auto",
        });

        if (Math.abs(diffMinutes) < 60) {
            return formatter.format(diffMinutes, "minute");
        }

        if (Math.abs(diffHours) < 24) {
            return formatter.format(diffHours, "hour");
        }

        return formatter.format(diffDays, "day");
    }

    function getStatusText(apiKey: AdminSingleKey): string {
        const activePairsCount = getActivePairsCount(apiKey);

        if (activePairsCount > 0) {
            return $_("admin_direct_mm_api_key_status_active_pairs", {
                values: { count: activePairsCount },
            });
        }

        if (apiKey.last_update) {
            return $_("admin_direct_mm_api_key_status_last_sync", {
                values: { value: formatRelativeTime(apiKey.last_update) },
            });
        }

        if (isPending(apiKey)) {
            return $_("admin_direct_mm_api_key_status_pending");
        }

        if (!isConnected(apiKey)) {
            return $_("admin_direct_mm_api_key_status_expired");
        }

        return $_("admin_direct_mm_api_key_status_idle");
    }
</script>

<div
    class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full"
>
    <div class="flex items-center justify-between mb-2">
        <span class="text-[1.1rem] text-base-content">
            {$_("admin_direct_mm_api_keys_title")}
        </span>
    </div>

    <div class="flex flex-col gap-3 grow mt-2 overflow-y-auto max-h-100">
        {#each apiKeys as apiKey}
            <div
                class="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 shrink-0"
            >
                <div class="flex items-center gap-4">
                    <div
                        class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-100"
                    >
                        <ExchangeIcon
                            exchangeName={apiKey.exchange}
                            clazz="w-5 h-5"
                        />
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-sm text-base-content"
                            >{apiKey.name}</span
                        >
                        <span class="text-xs text-base-content/50 capitalize">
                            {apiKey.exchange} • {getStatusText(apiKey)}
                        </span>
                    </div>
                </div>
                <div>
                    {#if isPending(apiKey)}
                        <div
                            class="bg-warning/10 text-warning text-[10px] font-bold px-3 py-1 rounded border border-warning/20 tracking-wide capitalize"
                        >
                            {$_("admin_direct_mm_api_key_pending")}
                        </div>
                    {:else if !isConnected(apiKey)}
                        <div
                            class="bg-red-50 text-red-600 text-[10px] font-bold px-3 py-1 rounded border border-red-100 tracking-wide capitalize"
                        >
                            {$_("admin_direct_mm_api_key_disconnected")}
                        </div>
                    {:else}
                        <div
                            class="bg-success/10 text-success text-[10px] font-bold px-3 py-1 rounded border border-success/20 tracking-wide capitalize"
                        >
                            {$_("admin_direct_mm_api_key_connected")}
                        </div>
                    {/if}
                </div>
            </div>
        {/each}
        {#if apiKeys.length === 0}
            <div class="text-center text-sm text-base-content/50 my-auto">
                {$_("admin_direct_mm_api_keys_empty")}
            </div>
        {/if}
    </div>

    <button
        class="w-full mt-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors border-none"
        on:click={() => window.open("/manage/settings/api-keys", "_blank")}
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M5 12h14" /><path d="M12 5v14" /></svg
        >
        {$_("admin_direct_mm_manage_api_connections")}
    </button>
</div>
