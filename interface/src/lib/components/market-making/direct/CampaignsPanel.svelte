<script lang="ts">
    import { _ } from "svelte-i18n";
    import { formatFundAmount, formatCampaignType } from "./helpers";
    import type { AdminCampaign } from "$lib/types/hufi/admin-direct-market-making";

    export let campaigns: AdminCampaign[] = [];
    export let onJoin: (campaign: AdminCampaign) => void;
    export let onViewAll: () => void = () => {};

    $: joinedCampaigns = campaigns.filter((campaign) => campaign.joined);
    $: hasJoined = joinedCampaigns.length > 0;

    function formatDate(d: unknown): string {
        if (!d) return "";
        const date = new Date(String(d));
        if (isNaN(date.getTime())) return String(d);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    function formatTargetValue(value: unknown): string {
        if (value === null || value === undefined || value === "") return "—";
        const num = Number(value);
        if (Number.isNaN(num)) return String(value);
        return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }

    function getTargetLabel(type: unknown): string {
        switch (String(type || "").toUpperCase()) {
            case "THRESHOLD":
                return $_("admin_direct_mm_minimum_balance_target");
            case "HOLDING":
                return $_("admin_direct_mm_daily_balance_target");
            default:
                return $_("admin_direct_mm_daily_volume_target");
        }
    }

    function getTargetValue(campaign: AdminCampaign): string {
        const details = (campaign.details as Record<string, unknown>) || {};
        const type = String(campaign.type || "");
        if (type === "THRESHOLD") {
            return formatTargetValue(details.minimum_balance_target);
        }
        if (type === "HOLDING") {
            return formatTargetValue(details.daily_balance_target);
        }
        return formatTargetValue(details.daily_volume_target);
    }

    function getTargetToken(campaign: AdminCampaign): string {
        const type = String(campaign.type || "");
        if (type === "THRESHOLD" || type === "HOLDING") {
            return String(campaign.symbol || campaign.name || "");
        }
        return String(campaign.fund_token_symbol || campaign.rewardToken || "");
    }

    function statusColor(s: string): string {
        switch (s.toLowerCase()) {
            case "active":
                return "text-success border-success";
            case "ended":
            case "closed":
                return "text-error border-error";
            default:
                return "text-warning border-warning";
        }
    }
</script>

<div
    class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full gap-4"
>
    <div class="flex items-start justify-between">
        <div>
            <span class="text-[1.1rem] text-base-content block">
                {hasJoined
                    ? $_("admin_direct_mm_joined_campaigns")
                    : $_("admin_direct_mm_available_campaigns")}
            </span>
            <span class="text-[13px] text-base-content/50 mt-1">
                {hasJoined
                    ? `${joinedCampaigns.length} ${$_("admin_direct_mm_campaign").toLowerCase()}${joinedCampaigns.length === 1 ? "" : "s"}`
                    : $_("admin_direct_mm_campaigns_subtitle")}
            </span>
        </div>
        {#if hasJoined}
            <button
                class="text-primary font-base text-sm flex items-center gap-1 hover:underline whitespace-nowrap bg-transparent border-none p-0 cursor-pointer"
                on:click={onViewAll}
            >
                {$_("admin_direct_mm_view_all")}
            </button>
        {/if}
    </div>

    {#if hasJoined}
        <!-- State 2: Show joined campaigns with details -->
        <div class="flex flex-col gap-4 max-h-100 overflow-y-auto pr-1">
            {#each joinedCampaigns as campaign}
                {@const rewardPool = formatFundAmount(
                    campaign.fund_amount || campaign.rewardPool,
                    campaign.fund_token_decimals,
                )}
                {@const rewardToken = String(
                    campaign.fund_token_symbol || campaign.rewardToken || "",
                )}
                {@const startDate = formatDate(
                    campaign.start_date || campaign.startDate,
                )}
                {@const endDate = formatDate(
                    campaign.end_date || campaign.endDate,
                )}
                <div class="bg-base-200/40 rounded-xl p-5 flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span
                                class="font-bold text-base-content text-[15px]"
                            >
                                {String(
                                    campaign.symbol || campaign.name || "—",
                                )}
                            </span>
                            <span class="text-xs text-base-content/50">
                                {$_("admin_direct_mm_exchange_label")}:
                                <span class="capitalize"
                                    >{String(
                                        campaign.exchange_name ||
                                            campaign.exchange ||
                                            "—",
                                    )}</span
                                >
                            </span>
                            <span class="text-xs text-base-content/50">
                                {$_("admin_direct_mm_api_key")}:
                                <span
                                    >{String(
                                        campaign.apiKeyName ||
                                            campaign.apiKeyId ||
                                            "Deleted",
                                    )}</span
                                >
                            </span>
                        </div>
                        <span
                            class="badge badge-success badge-outline border capitalize font-bold text-xs px-2 py-0.5 rounded-md"
                        >
                            {$_("admin_direct_mm_joined")}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_reward_pool")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{rewardPool}{rewardToken
                                        ? ` ${rewardToken}`
                                        : ""}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{getTargetLabel(campaign.type)}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{getTargetValue(campaign)}{getTargetToken(
                                        campaign,
                                    )
                                        ? ` ${getTargetToken(campaign)}`
                                        : ""}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_campaign_type")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{formatCampaignType(
                                        campaign.type || campaign.campaignType,
                                    )}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_date_range")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                >
                                    {#if startDate && endDate}{startDate} - {endDate}{:else}{$_(
                                            "admin_direct_mm_na",
                                        )}{/if}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {:else if campaigns.length > 0}
        <!-- State 1: No joined campaigns, show all campaign cards -->
        <div class="flex flex-col gap-4 max-h-100 overflow-y-auto pr-1">
            {#each campaigns as campaign}
                {@const rewardPool = formatFundAmount(
                    campaign.fund_amount || campaign.rewardPool,
                    campaign.fund_token_decimals,
                )}
                {@const rewardToken = String(
                    campaign.fund_token_symbol || campaign.rewardToken || "",
                )}
                {@const startDate = formatDate(
                    campaign.start_date || campaign.startDate,
                )}
                {@const endDate = formatDate(
                    campaign.end_date || campaign.endDate,
                )}
                <div class="bg-base-200/40 rounded-xl p-5 flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span
                                class="font-bold text-base-content text-[15px]"
                            >
                                {String(
                                    campaign.symbol || campaign.name || "—",
                                )}
                            </span>
                            <span class="text-xs text-base-content/50">
                                {$_("admin_direct_mm_exchange_label")}:
                                <span class="capitalize"
                                    >{String(
                                        campaign.exchange_name ||
                                            campaign.exchange ||
                                            "—",
                                    )}</span
                                >
                            </span>
                        </div>
                        <span
                            class={`text-xs font-bold tracking-wider capitalize border rounded-md px-2 py-0.5 ${statusColor(String(campaign.status || "active"))}`}
                        >
                            {String(campaign.status || "active")}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_reward_pool")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{rewardPool}{rewardToken
                                        ? ` ${rewardToken}`
                                        : ""}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{getTargetLabel(campaign.type)}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{getTargetValue(campaign)}{getTargetToken(
                                        campaign,
                                    )
                                        ? ` ${getTargetToken(campaign)}`
                                        : ""}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_campaign_type")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                    >{formatCampaignType(
                                        campaign.type || campaign.campaignType,
                                    )}</span
                                >
                            </div>
                        </div>
                        <div>
                            <span
                                class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
                                >{$_("admin_direct_mm_date_range")}</span
                            >
                            <div class="mt-0.5">
                                <span
                                    class="text-[15px] font-bold text-base-content"
                                >
                                    {#if startDate && endDate}{startDate} - {endDate}{:else}{$_(
                                            "admin_direct_mm_na",
                                        )}{/if}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        class="btn btn-primary text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm"
                        on:click={() => onJoin(campaign)}
                    >
                        {$_("admin_direct_mm_join_campaign_title")}
                    </button>
                </div>
            {/each}
        </div>
    {:else}
        <div
            class="flex items-center justify-center h-full text-base-content/40 text-sm"
        >
            {$_("admin_direct_mm_campaigns_empty")}
        </div>
    {/if}
</div>
