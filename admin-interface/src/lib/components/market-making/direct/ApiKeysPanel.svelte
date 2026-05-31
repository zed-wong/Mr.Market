<script lang="ts">
    import { _ } from "svelte-i18n";
    import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";
    import {
        getApiKeyPermissionViews,
        getApiKeyReadiness,
    } from "$lib/helpers/admin/api-key-readiness";
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

    export let apiKeys: AdminSingleKey[] = [];
    export let orders: DirectOrderSummary[] = [];

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
        const readiness = getApiKeyReadiness(apiKey);

        if (activePairsCount > 0) {
            return $_("admin_direct_mm_api_key_status_active_pairs", {
                values: { count: activePairsCount },
            });
        }

        if (readiness.status !== "ready") {
            return readiness.title;
        }

        if (apiKey.last_update) {
            return $_("admin_direct_mm_api_key_status_last_sync", {
                values: { value: formatRelativeTime(apiKey.last_update) },
            });
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
            {@const readiness = getApiKeyReadiness(apiKey)}
            <div
                class="flex items-center justify-between gap-3 p-4 rounded-xl bg-base-200/60 border border-base-300 shrink-0"
            >
                <div class="flex items-center gap-4">
                    <div
                        class="w-10 h-10 bg-base-100 rounded-full shadow-sm flex items-center justify-center border border-base-300"
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
                        <div class="mt-1 flex flex-wrap gap-1">
                            {#each getApiKeyPermissionViews(apiKey) as permission (permission.capability)}
                                <span
                                    class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {permission.tone}"
                                    title={permission.description}
                                >
                                    {permission.label}
                                </span>
                            {/each}
                        </div>
                        {#if readiness.status === "validation_failed" && apiKey.validation_error}
                            <span class="mt-1 max-w-64 truncate text-xs text-error" title={apiKey.validation_error}>
                                {apiKey.validation_error}
                            </span>
                        {/if}
                    </div>
                </div>
                <div>
                    <div
                        class="text-[10px] font-bold px-3 py-1 rounded border border-base-300 tracking-wide capitalize {readiness.tone}"
                        title={readiness.description}
                    >
                        {readiness.label}
                    </div>
                </div>
            </div>
        {/each}
        {#if apiKeys.length === 0}
            <div class="text-center text-sm text-base-content/50 my-auto">
                {$_("admin_direct_mm_api_keys_empty")}
            </div>
        {/if}
    </div>

    <a
        href="/system/connectivity/api-keys"
        class="w-full mt-4 py-3 rounded-xl bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors border-none"
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
    </a>
</div>
