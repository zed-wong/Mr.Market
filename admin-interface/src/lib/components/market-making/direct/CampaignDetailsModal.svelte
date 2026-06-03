<script lang="ts">
    import BigNumber from "bignumber.js";
    import { onDestroy } from "svelte";
    import { _ } from "svelte-i18n";
    import { getCampaignLeaderboard } from "$lib/helpers/mrm/admin/direct-market-making";
    import type {
        AdminCampaign,
        CampaignLeaderboard,
        LeaderboardEntry,
    } from "$lib/types/hufi/admin-direct-market-making";

    export let show = false;
    export let campaign: AdminCampaign | null = null;
    export let token = "";
    export let serverAddress = "";
    export let onClose: () => void;

    const REFRESH_INTERVAL_MS = 30000;

    let leaderboard: CampaignLeaderboard | null = null;
    let loading = false;
    let refreshing = false;
    let error = "";
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let activeCampaignKey = "";

    type UnknownRecord = Record<string, unknown>;

    $: campaignAddress = String(
        campaign?.campaignAddress ||
            campaign?.escrow_address ||
            campaign?.address ||
            "",
    );
    $: chainId = Number(campaign?.chain_id || campaign?.chainId || 137);
    $: campaignKey = show && campaign ? `${chainId}:${campaignAddress}` : "";
    $: campaignName = String(campaign?.symbol || campaign?.name || "—");
    $: leaderboardRows = normalizeLeaderboardRows(leaderboard);
    $: updatedAt = formatTimestamp(String(leaderboard?.updated_at || ""));

    $: if (campaignKey && campaignKey !== activeCampaignKey) {
        activeCampaignKey = campaignKey;
        leaderboard = null;
        error = "";
        void loadDetails();
        startPolling();
    }

    $: if (!campaignKey && activeCampaignKey) {
        activeCampaignKey = "";
        stopPolling();
    }

    function stopPolling() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function startPolling() {
        stopPolling();
        refreshTimer = setInterval(() => {
            if (show && campaignAddress && token) {
                void loadDetails({ silent: true });
            }
        }, REFRESH_INTERVAL_MS);
    }

    async function loadDetails(options: { silent?: boolean } = {}) {
        if (!campaignAddress || !chainId || !token || loading || refreshing) {
            return;
        }

        if (options.silent) {
            refreshing = true;
        } else {
            loading = true;
        }

        try {
            leaderboard = await getCampaignLeaderboard(
                chainId,
                campaignAddress,
                token,
            );
            error = "";
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : $_("admin_direct_mm_campaign_details_error");
        } finally {
            loading = false;
            refreshing = false;
        }
    }

    function isRecord(value: unknown): value is UnknownRecord {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function normalizeLeaderboardRows(
        value: CampaignLeaderboard | null,
    ): LeaderboardEntry[] {
        if (!value) return [];
        if (Array.isArray(value.data)) return value.data;
        const results = value.results;
        return Array.isArray(results) ? (results as LeaderboardEntry[]) : [];
    }

    function formatNumber(value: unknown, decimals = 4): string {
        if (value === null || value === undefined || value === "") {
            return $_("admin_direct_mm_na");
        }
        const parsed = new BigNumber(String(value));
        if (!parsed.isFinite()) return String(value);
        return parsed.decimalPlaces(decimals).toFormat();
    }

    function formatTimestamp(value: string): string {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    function shortAddress(address: string): string {
        if (address.length <= 12) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    function isServerAddress(address: string): boolean {
        return Boolean(
            serverAddress &&
                address &&
                serverAddress.toLowerCase() === address.toLowerCase(),
        );
    }

    onDestroy(stopPolling);
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show && campaign}
    <div class="modal modal-open bg-base-content/20 backdrop-blur-[2px]">
        <div
            class="modal-box bg-base-100 p-0 rounded-2xl max-w-120 shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto"
        >
            <div class="px-7 pt-6 pb-4">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-xs text-base-content/50 font-semibold">
                            {$_("admin_direct_mm_campaign_details_title")}
                        </span>
                        <span class="text-lg font-bold text-base-content">
                            {campaignName}
                        </span>
                        <span class="text-xs text-base-content/50 font-mono">
                            {chainId}:{shortAddress(campaignAddress)}
                        </span>
                    </div>
                    <button
                        class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
                        on:click={onClose}
                        aria-label={$_("admin_direct_mm_close")}
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

            <div class="px-7 pb-7 flex flex-col gap-5">
                {#if loading && !leaderboard}
                    <div class="flex flex-col gap-3 py-8">
                        <div class="skeleton h-48 w-full rounded-xl"></div>
                    </div>
                {:else if error && !leaderboard}
                    <div
                        class="bg-error/10 border border-error/20 rounded-xl p-4 flex flex-col gap-3"
                    >
                        <span class="text-sm font-semibold text-error">
                            {$_("admin_direct_mm_campaign_details_error")}
                        </span>
                        <span class="text-xs text-base-content/60">{error}</span>
                        <button
                            class="btn btn-sm btn-primary self-start"
                            disabled={loading || refreshing}
                            on:click={() => loadDetails()}
                        >
                            {$_("admin_retry")}
                        </button>
                    </div>
                {:else}
                    {#if error}
                        <div
                            class="bg-warning/10 border border-warning/20 rounded-xl p-3 flex flex-col gap-1"
                        >
                            <span class="text-sm font-semibold text-warning">
                                {$_("admin_direct_mm_campaign_details_partial_error")}
                            </span>
                            <span class="text-xs text-base-content/60">{error}</span>
                        </div>
                    {/if}

                    <div class="flex flex-col gap-3">
                        <div class="flex items-center justify-between gap-3">
                            <span class="text-sm font-bold text-base-content">
                                {$_("admin_direct_mm_campaign_leaderboard")}
                            </span>
                            <div class="flex items-center gap-3">
                                {#if updatedAt}
                                    <span class="text-xs text-base-content/50">
                                        {$_("admin_direct_mm_campaign_updated_at", {
                                            values: { time: updatedAt },
                                        })}
                                    </span>
                                {/if}
                                <button
                                    class="btn btn-xs btn-ghost text-base-content/60"
                                    disabled={loading || refreshing}
                                    on:click={() => loadDetails()}
                                >
                                    {refreshing
                                        ? $_("admin_direct_mm_refreshing")
                                        : $_("admin_direct_mm_refresh")}
                                </button>
                            </div>
                        </div>

                        {#if leaderboardRows.length > 0}
                            <div class="overflow-x-auto rounded-xl border border-base-300">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>{$_("admin_direct_mm_rank")}</th>
                                            <th>{$_("admin_direct_mm_wallet")}</th>
                                            <th>{$_("admin_direct_mm_score")}</th>
                                            <th>{$_("admin_direct_mm_estimated_reward")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each leaderboardRows as row, index}
                                            {@const address = String(row.address || "")}
                                            <tr
                                                class={isServerAddress(address)
                                                    ? "bg-primary/10"
                                                    : ""}
                                            >
                                                <td>{index + 1}</td>
                                                <td class="font-mono">
                                                    {shortAddress(address)}
                                                    {#if isServerAddress(address)}
                                                        <span
                                                            class="badge badge-primary badge-outline badge-xs ml-2"
                                                            >{$_(
                                                                "admin_direct_mm_current_server",
                                                            )}</span
                                                        >
                                                    {/if}
                                                </td>
                                                <td>{formatNumber(row.score)}</td>
                                                <td>{formatNumber(row.estimated_reward)}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else}
                            <div
                                class="rounded-xl border border-base-300 p-6 text-center text-sm text-base-content/50"
                            >
                                {$_("admin_direct_mm_campaign_leaderboard_empty")}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
