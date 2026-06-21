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
    const LEADERBOARD_PREVIEW_LIMIT = 10;
    const CHART_LEGEND_LIMIT = 3;

    let leaderboard: CampaignLeaderboard | null = null;
    let loading = false;
    let refreshing = false;
    let error = "";
    let showAllLeaderboardRows = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let activeCampaignKey = "";

    type UnknownRecord = Record<string, unknown>;
    type LeaderboardPieSlice = {
        label: string;
        value: string;
        percentage: string;
        path: string;
        color: string;
        isServer: boolean;
    };

    const PIE_CENTER = 70;
    const PIE_RADIUS = 58;

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
    $: visibleLeaderboardRows = showAllLeaderboardRows
        ? leaderboardRows
        : leaderboardRows.slice(0, LEADERBOARD_PREVIEW_LIMIT);
    $: hiddenLeaderboardCount = Math.max(
        leaderboardRows.length - LEADERBOARD_PREVIEW_LIMIT,
        0,
    );
    $: leaderboardPie = buildLeaderboardPie(leaderboardRows);
    $: chartLegendSlices = leaderboardPie.slices.slice(0, CHART_LEGEND_LIMIT);
    $: hiddenChartLegendCount = Math.max(
        leaderboardPie.slices.length - CHART_LEGEND_LIMIT,
        0,
    );
    $: leaderboardPieTotal = splitChartTotal(leaderboardPie.total);
    $: campaignRewardPool = getCampaignRewardPool();
    $: rewardProgress = getRewardProgress(
        leaderboardPie.totalReward,
        campaignRewardPool,
    );
    $: rewardToken = String(
        campaign?.fund_token_symbol || campaign?.rewardToken || "USDT",
    );
    $: updatedAt = formatTimestamp(String(leaderboard?.updated_at || ""));
    $: currentServerRow = leaderboardRows.find((row) =>
        isServerAddress(String(row.address || "")),
    );
    $: currentServerRank = currentServerRow
        ? leaderboardRows.findIndex((row) =>
              isServerAddress(String(row.address || "")),
          ) + 1
        : 0;
    $: campaignVenue = [
        campaignValue("exchange") || campaignValue("exchange_name"),
        chainId
            ? $_("admin_direct_mm_chain_id_value", {
                  values: { id: chainId },
              })
            : "",
    ]
        .filter(Boolean)
        .join(" · ");

    $: if (campaignKey && campaignKey !== activeCampaignKey) {
        activeCampaignKey = campaignKey;
        leaderboard = null;
        error = "";
        showAllLeaderboardRows = false;
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

    function formatReward(value: unknown): string {
        const formatted = formatNumber(value, 4);
        return formatted === $_("admin_direct_mm_na") ? formatted : `${formatted} USDT`;
    }

    function parsePositiveBigNumber(value: unknown): BigNumber {
        const parsed = new BigNumber(String(value ?? 0));
        return parsed.isFinite() && parsed.isGreaterThan(0) ? parsed : new BigNumber(0);
    }

    function buildLeaderboardPie(rows: LeaderboardEntry[]) {
        const rewardValues = rows.map((row) =>
            parsePositiveBigNumber(row.estimated_reward),
        );
        const rewardTotal = rewardValues.reduce(
            (total, value) => total.plus(value),
            new BigNumber(0),
        );
        const scoreValues = rows.map((row) => parsePositiveBigNumber(row.score));
        const scoreTotal = scoreValues.reduce(
            (total, value) => total.plus(value),
            new BigNumber(0),
        );
        const useReward = rewardTotal.isGreaterThan(0);
        const values = useReward ? rewardValues : scoreValues;
        const total = useReward ? rewardTotal : scoreTotal;

        if (!total.isGreaterThan(0)) {
            return {
                label: useReward
                    ? $_("admin_direct_mm_leaderboard_chart_reward_share")
                    : $_("admin_direct_mm_leaderboard_chart_score_share"),
                total: "",
                totalReward: rewardTotal,
                slices: [] as LeaderboardPieSlice[],
            };
        }

        let cursor = new BigNumber(0);
        const slices = rows
            .map((row, index) => {
                const value = values[index];
                if (!value.isGreaterThan(0)) return null;
                const start = cursor.dividedBy(total).multipliedBy(360).toNumber();
                cursor = cursor.plus(value);
                const end = cursor.dividedBy(total).multipliedBy(360).toNumber();
                const address = String(row.address || "");

                return {
                    label: shortChartAddress(address),
                    value: useReward ? formatReward(value) : formatNumber(value),
                    percentage: value
                        .dividedBy(total)
                        .multipliedBy(100)
                        .decimalPlaces(1)
                        .toFormat(),
                    path: describePieSlice(start, end),
                    color: brightColorForAddress(address, index),
                    isServer: isServerAddress(address),
                };
            })
            .filter((slice): slice is LeaderboardPieSlice => Boolean(slice));

        return {
            label: useReward
                ? $_("admin_direct_mm_leaderboard_chart_reward_share")
                : $_("admin_direct_mm_leaderboard_chart_score_share"),
            total: useReward ? formatReward(total) : formatNumber(total),
            totalReward: rewardTotal,
            slices,
        };
    }

    function describePieSlice(startAngle: number, endAngle: number): string {
        const start = polarToCartesian(startAngle);
        const end = polarToCartesian(endAngle);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;

        return [
            `M ${PIE_CENTER} ${PIE_CENTER}`,
            `L ${start.x} ${start.y}`,
            `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
            "Z",
        ].join(" ");
    }

    function polarToCartesian(angle: number): { x: string; y: string } {
        const radians = (angle - 90) * (Math.PI / 180);
        return {
            x: (PIE_CENTER + PIE_RADIUS * Math.cos(radians)).toFixed(3),
            y: (PIE_CENTER + PIE_RADIUS * Math.sin(radians)).toFixed(3),
        };
    }

    function brightColorForAddress(address: string, index: number): string {
        const seed = Array.from(address || String(index)).reduce(
            (hash, char) => (hash * 31 + char.charCodeAt(0)) % 360,
            index * 47,
        );
        return `hsl(${seed} 78% 74%)`;
    }

    function splitChartTotal(value: string): { amount: string; unit: string } {
        const [amount, unit = ""] = value.split(" ");
        return { amount, unit };
    }

    function getCampaignRewardPool(): BigNumber {
        const rawAmount =
            campaignValueFrom(
                campaign,
                "fund_amount",
                "fundAmount",
                "rewardPool",
                "reward_pool",
                "total_reward",
                "totalReward",
            ) ||
            campaignValueFrom(
                isRecord(campaign?.details) ? campaign.details : null,
                "fund_amount",
                "fundAmount",
                "rewardPool",
                "reward_pool",
                "total_reward",
                "totalReward",
            ) ||
            campaignValueFrom(
                leaderboard,
                "rewardPool",
                "reward_pool",
                "total_reward",
                "totalReward",
            );
        const decimals = Number(campaign?.fund_token_decimals || 0);
        const rewardPool = parseCampaignAmount(rawAmount, decimals);

        if (rewardPool.isGreaterThan(0)) return rewardPool;

        const leaderboardTotal = parseCampaignAmount(leaderboard?.total, 0);
        return leaderboardTotal.isGreaterThan(leaderboardPie.totalReward)
            ? leaderboardTotal
            : new BigNumber(0);
    }

    function getRewardProgress(totalReward: BigNumber, rewardPool: BigNumber): string {
        if (!rewardPool.isGreaterThan(0)) return "";
        return totalReward
            .dividedBy(rewardPool)
            .multipliedBy(100)
            .decimalPlaces(1)
            .toFormat()
            .replace(/\.0$/, "");
    }

    function campaignValueFrom(
        source: UnknownRecord | CampaignLeaderboard | AdminCampaign | null,
        ...keys: string[]
    ): unknown {
        if (!source) return "";
        for (const key of keys) {
            const value = source[key];
            if (value !== null && value !== undefined && value !== "") return value;
        }
        return "";
    }

    function parseCampaignAmount(value: unknown, decimals: number): BigNumber {
        if (value === null || value === undefined || value === "") {
            return new BigNumber(0);
        }
        const normalized = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/)?.[0];
        if (!normalized) return new BigNumber(0);
        const parsed = new BigNumber(normalized);
        if (!parsed.isFinite() || !parsed.isGreaterThan(0)) return new BigNumber(0);
        return decimals > 0 ? parsed.dividedBy(new BigNumber(10).pow(decimals)) : parsed;
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

    function shortChartAddress(address: string): string {
        if (address.length <= 6) return address;
        return address.slice(0, 6);
    }

    function rankLabel(rank: number): string {
        return `#${rank}`;
    }

    function isServerAddress(address: string): boolean {
        return Boolean(
            serverAddress &&
                address &&
                serverAddress.toLowerCase() === address.toLowerCase(),
        );
    }

    function campaignValue(key: string): string {
        const value = campaign?.[key];
        return typeof value === "string" || typeof value === "number"
            ? String(value)
            : "";
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
                        <span class="text-xs text-base-content/45 font-semibold">
                            {$_("admin_direct_mm_campaign_details_title")}
                        </span>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xl font-bold text-base-content">
                                {campaignName}
                            </span>
                            {#if campaign.joined}
                                <span class="badge badge-success badge-outline badge-sm">
                                    {$_("admin_direct_mm_joined")}
                                </span>
                            {/if}
                        </div>
                        <span class="text-xs text-base-content/50">
                            {campaignVenue || $_("admin_direct_mm_campaign")} ·
                            <span class="font-mono">{shortAddress(campaignAddress)}</span>
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

                    {#if currentServerRow}
                        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div class="rounded-xl border border-base-300 bg-base-200/40 p-3">
                                <span class="text-xs text-base-content/50">
                                    {$_("admin_direct_mm_this_server_rank")}
                                </span>
                                <div class="mt-1 font-mono text-lg font-semibold text-base-content">
                                    {rankLabel(currentServerRank)}
                                </div>
                            </div>
                            <div class="rounded-xl border border-base-300 bg-base-200/40 p-3">
                                <span class="text-xs text-base-content/50">
                                    {$_("admin_direct_mm_score")}
                                </span>
                                <div class="mt-1 font-mono text-lg font-semibold text-base-content">
                                    {formatNumber(currentServerRow.score)}
                                </div>
                            </div>
                            <div class="col-span-2 rounded-xl border border-base-300 bg-base-200/40 p-3 sm:col-span-1">
                                <span class="text-xs text-base-content/50">
                                    {$_("admin_direct_mm_estimated_reward")}
                                </span>
                                <div class="mt-1 font-mono text-lg font-semibold text-base-content">
                                    {formatReward(currentServerRow.estimated_reward)}
                                </div>
                            </div>
                        </div>
                    {/if}

                    <div class="flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex flex-col gap-1">
                                <span class="text-sm font-bold text-base-content">
                                    {$_("admin_direct_mm_campaign_leaderboard")}
                                </span>
                                {#if updatedAt}
                                    <span class="text-xs text-base-content/45">
                                        {$_("admin_direct_mm_campaign_updated_at", {
                                            values: { time: updatedAt },
                                        })}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-3">
                                <button
                                    class="btn btn-xs btn-outline h-7 min-h-7 rounded-full border-base-300 px-3 text-base-content/60"
                                    disabled={loading || refreshing}
                                    on:click={() => loadDetails()}
                                >
                                    {#if refreshing}
                                        <span class="loading loading-spinner loading-xs"></span>
                                    {/if}
                                    <span>{$_("admin_direct_mm_refresh")}</span>
                                </button>
                            </div>
                        </div>

                        {#if leaderboardRows.length > 0}
                            <div class="overflow-hidden rounded-xl border border-base-300 bg-base-100">
                                <div class="overflow-x-auto">
                                <table class="table table-sm">
                                    <thead class="bg-base-200/60">
                                        <tr class="text-xs text-base-content/55">
                                            <th class="w-16">{$_("admin_direct_mm_rank")}</th>
                                            <th>{$_("admin_direct_mm_wallet")}</th>
                                            <th>{$_("admin_direct_mm_score")}</th>
                                            <th>{$_("admin_direct_mm_reward")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each visibleLeaderboardRows as row, index}
                                            {@const address = String(row.address || "")}
                                            <tr
                                                class={isServerAddress(address)
                                                    ? "bg-primary/[0.08]"
                                                    : "hover:bg-base-200/35"}
                                            >
                                                <td class="w-16">
                                                    <span
                                                        class="inline-flex h-6 min-w-9 items-center justify-center rounded-full border border-base-300 bg-base-100 px-2 font-mono text-xs font-semibold text-base-content"
                                                    >
                                                        {rankLabel(index + 1)}
                                                    </span>
                                                </td>
                                                <td class="font-mono">
                                                    {shortAddress(address)}
                                                </td>
                                                <td class="font-mono">{formatNumber(row.score)}</td>
                                                <td class="font-mono">{formatReward(row.estimated_reward)}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                                </div>
                                {#if hiddenLeaderboardCount > 0}
                                    <button
                                        type="button"
                                        class="flex w-full items-center justify-center border-t border-base-300 px-4 py-2 text-xs font-semibold text-base-content/60 hover:bg-base-200/40"
                                        on:click={() =>
                                            (showAllLeaderboardRows = !showAllLeaderboardRows)}
                                    >
                                        {showAllLeaderboardRows
                                            ? $_("admin_direct_mm_show_less")
                                            : $_("admin_direct_mm_show_more", {
                                                  values: {
                                                      count: hiddenLeaderboardCount,
                                                  },
                                              })}
                                    </button>
                                {/if}
                            </div>
                        {:else}
                            <div
                                class="rounded-xl border border-base-300 p-6 text-center text-sm text-base-content/50"
                            >
                                {$_("admin_direct_mm_campaign_leaderboard_empty")}
                            </div>
                        {/if}

                        <div class="overflow-hidden rounded-xl border border-base-300 bg-base-100">
                            <div class="px-4 py-4">
                                {#if leaderboardPie.slices.length > 0}
                                    {#if rewardProgress}
                                        <div class="mb-4 rounded-lg bg-base-200/40 px-3 py-2">
                                            <div class="flex items-center justify-between gap-3 text-xs">
                                                <span class="text-base-content/55">
                                                    {$_("admin_direct_mm_reward_progress")}
                                                </span>
                                                <span class="font-mono font-semibold text-base-content">
                                                    {rewardProgress}%
                                                </span>
                                            </div>
                                            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-base-300">
                                                <div
                                                    class="h-full rounded-full bg-primary"
                                                    style={`width: ${Math.min(Number(rewardProgress), 100)}%`}
                                                ></div>
                                            </div>
                                            <div class="mt-1 flex justify-between gap-3 font-mono text-[11px] text-base-content/45">
                                                <span>{formatReward(leaderboardPie.totalReward)}</span>
                                                <span>{formatNumber(campaignRewardPool)} {rewardToken}</span>
                                            </div>
                                        </div>
                                    {/if}
                                    <div class="grid min-w-0 gap-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
                                        <div class="flex min-w-0 items-center justify-center">
                                            <svg
                                                viewBox="0 0 140 140"
                                                class="h-36 w-36 shrink-0"
                                                aria-label={leaderboardPie.label}
                                            >
                                                {#if leaderboardPie.slices.length === 1}
                                                    <circle
                                                        cx={PIE_CENTER}
                                                        cy={PIE_CENTER}
                                                        r={PIE_RADIUS}
                                                        fill={leaderboardPie.slices[0].color}
                                                    />
                                                {:else}
                                                    {#each leaderboardPie.slices as slice}
                                                        <path d={slice.path} fill={slice.color} />
                                                    {/each}
                                                {/if}
                                                <circle
                                                    cx={PIE_CENTER}
                                                    cy={PIE_CENTER}
                                                    r="32"
                                                    class="fill-base-100"
                                                />
                                                <text
                                                    x={PIE_CENTER}
                                                    y="61"
                                                    text-anchor="middle"
                                                    class="fill-base-content text-[10px] font-semibold"
                                                >
                                                    {$_("admin_direct_mm_total")}
                                                </text>
                                                <text
                                                    x={PIE_CENTER}
                                                    y="76"
                                                    text-anchor="middle"
                                                    class="fill-base-content/60 font-mono text-[9px]"
                                                >
                                                    {leaderboardPieTotal.amount}
                                                </text>
                                                {#if leaderboardPieTotal.unit}
                                                    <text
                                                        x={PIE_CENTER}
                                                        y="88"
                                                        text-anchor="middle"
                                                        class="fill-base-content/50 font-mono text-[8px]"
                                                    >
                                                        {leaderboardPieTotal.unit}
                                                    </text>
                                                {/if}
                                            </svg>
                                        </div>
                                        <div class="flex min-w-0 flex-col gap-2">
                                            {#each chartLegendSlices as slice}
                                                <div
                                                    class={slice.isServer
                                                        ? "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] items-center gap-2 rounded-lg bg-primary/[0.08] px-3 py-2"
                                                        : "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] items-center gap-2 rounded-lg bg-base-200/40 px-3 py-2"}
                                                >
                                                    <span class="flex min-w-0 items-start gap-2">
                                                        <span
                                                            class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                                            style={`background-color: ${slice.color}`}
                                                        ></span>
                                                        <span class="flex min-w-0 flex-col gap-1">
                                                            <span
                                                                class="min-w-0 truncate font-mono text-xs text-base-content"
                                                            >
                                                                {slice.label}
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span
                                                        class="min-w-0 truncate text-right font-mono text-xs text-base-content/70"
                                                    >
                                                        {slice.percentage}% · {slice.value}
                                                    </span>
                                                </div>
                                            {/each}
                                            {#if hiddenChartLegendCount > 0}
                                                <div
                                                    class="rounded-lg bg-base-200/25 px-3 py-2 text-xs text-base-content/45"
                                                >
                                                    {$_("admin_direct_mm_more_entries", {
                                                        values: {
                                                            count: hiddenChartLegendCount,
                                                        },
                                                    })}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {:else}
                                    <div class="py-4 text-center text-sm text-base-content/50">
                                        {$_("admin_direct_mm_leaderboard_chart_empty")}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
