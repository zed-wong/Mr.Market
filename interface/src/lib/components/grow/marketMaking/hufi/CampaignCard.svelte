<script lang="ts">
    import type { ApiCampaign } from "$lib/helpers/mrm/campaignFormatter";
    import {
        formatDateTime,
        formatType,
        formatStatus,
        formatExchangeName,
        shortenAddress,
        getTargetLabel,
        getTargetValue,
        calculateOracleFees,
        getCampaignResults,
        getSymbolIcon,
    } from "$lib/helpers/mrm/campaignFormatter";

    export let campaign: ApiCampaign;

    function copyAddress(text: string) {
        navigator.clipboard.writeText(text);
    }

    const symbolIcon = getSymbolIcon(campaign.symbol);
    const fundAmountValue =
        Number(campaign.fund_amount) /
        Math.pow(10, campaign.fund_token_decimals);
    const balanceValue =
        Number(campaign.balance) / Math.pow(10, campaign.fund_token_decimals);
    const paidValue = fundAmountValue - balanceValue;
    const progressPercent =
        fundAmountValue > 0 ? (paidValue / fundAmountValue) * 100 : 0;

    function getStatusBadgeClass(status: string) {
        switch (status.toLowerCase()) {
            case "active":
                return "badge-success text-success-content";
            case "pending":
                return "badge-warning text-warning-content";
            case "completed":
                return "badge-primary text-primary-content";
            case "failed":
                return "badge-error text-error-content";
            default:
                return "badge-neutral text-neutral-content";
        }
    }

    function getEscrowBadgeClass(escrowStatus: string) {
        switch (escrowStatus.toLowerCase()) {
            case "pending":
                return "badge-warning text-warning-content";
            case "approved":
                return "badge-success text-success-content";
            case "rejected":
                return "badge-error text-error-content";
            default:
                return "badge-neutral text-neutral-content";
        }
    }
</script>

<div class="flex flex-col space-y-6 p-6 md:p-8 pb-6">
    <!-- Campaign Header -->
    <div class="flex flex-col space-y-4">
        <div class="flex items-center gap-3">
            <img
                src={symbolIcon}
                alt={campaign.symbol}
                class="w-12 h-12 rounded-full"
            />
            <div class="flex flex-col">
                <h1 class="text-2xl font-bold">{campaign.symbol}</h1>
                <span class="text-sm text-base-content/70"
                    >{formatExchangeName(campaign.exchange_name)}</span
                >
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-primary text-primary-content font-medium"
                >{formatType(campaign.type)}</span
            >
            <span
                class="badge {getStatusBadgeClass(campaign.status)} font-medium"
                >{formatStatus(campaign.status)}</span
            >
            <span
                class="badge {getEscrowBadgeClass(
                    campaign.escrow_status,
                )} font-medium">Escrow: {campaign.escrow_status}</span
            >
        </div>
    </div>

    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-2 gap-3">
        <div class="bg-linear-to-br from-gray-50 to-gray-100 rounded-xl p-4">
            <div class="text-xs text-gray-500 font-medium mb-1">Total Fund</div>
            <div class="text-lg font-bold">
                {fundAmountValue.toLocaleString()}
                {campaign.fund_token_symbol}
            </div>
        </div>
        <div class="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-4">
            <div class="text-xs text-blue-600 font-medium mb-1">
                Current Balance
            </div>
            <div class="text-lg font-bold text-blue-700">
                {balanceValue.toLocaleString()}
                {campaign.fund_token_symbol}
            </div>
        </div>
        <div class="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-4">
            <div class="text-xs text-green-600 font-medium mb-1">
                Amount Paid
            </div>
            <div class="text-lg font-bold text-green-700">
                {paidValue.toLocaleString()}
                {campaign.fund_token_symbol}
            </div>
        </div>
        <div class="bg-linear-to-br from-amber-50 to-amber-100 rounded-xl p-4">
            <div class="text-xs text-amber-600 font-medium mb-1">
                {getTargetLabel(campaign.type)}
            </div>
            <div class="text-lg font-bold text-amber-700">
                {getTargetValue(campaign)}
            </div>
        </div>
    </div>

    <!-- Fund Progress -->
    <div class="bg-gray-50 rounded-xl p-4">
        <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium">Fund Usage</span>
            <span class="text-sm text-gray-500"
                >{progressPercent.toFixed(1)}%</span
            >
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
            <div
                class="bg-linear-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                style="width: {progressPercent}%"
            ></div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
            <span>{paidValue.toLocaleString()} paid</span>
            <span>{fundAmountValue.toLocaleString()} total</span>
        </div>
    </div>

    <!-- Campaign Info Section -->
    <div class="flex flex-col space-y-4">
        <div class="font-bold text-sm bg-slate-50 p-3 px-4 rounded-lg">
            Campaign Information
        </div>
        <div class="flex flex-col space-y-4 px-2">
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold">Contract Address</span>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{shortenAddress(campaign.address)}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.address)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-4 h-4"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="flex justify-between">
                <span class="text-sm font-bold">Start Date</span>
                <span class="text-sm text-base-content/70"
                    >{formatDateTime(campaign.start_date)}</span
                >
            </div>

            <div class="flex justify-between">
                <span class="text-sm font-bold">End Date</span>
                <span class="text-sm text-base-content/70"
                    >{formatDateTime(campaign.end_date)}</span
                >
            </div>

            <div class="flex justify-between">
                <span class="text-sm font-bold">Exchange</span>
                <span class="text-sm text-base-content/70"
                    >{formatExchangeName(campaign.exchange_name)}</span
                >
            </div>
        </div>
    </div>

    <!-- Oracle Fees -->
    <div class="flex flex-col space-y-4">
        <div class="font-bold text-sm bg-slate-50 p-3 px-4 rounded-lg">
            Oracle Fees
        </div>
        <div class="flex flex-col space-y-4 px-2">
            <div class="flex justify-between">
                <span class="text-sm font-bold">Exchange Oracle</span>
                <span class="text-sm text-base-content/70"
                    >{campaign.exchange_oracle_fee_percent}%</span
                >
            </div>
            <div class="flex justify-between">
                <span class="text-sm font-bold">Recording Oracle</span>
                <span class="text-sm text-base-content/70"
                    >{campaign.recording_oracle_fee_percent}%</span
                >
            </div>
            <div class="flex justify-between">
                <span class="text-sm font-bold">Reputation Oracle</span>
                <span class="text-sm text-base-content/70"
                    >{campaign.reputation_oracle_fee_percent}%</span
                >
            </div>
            <div class="flex justify-between">
                <span class="text-sm font-bold">Total Fee</span>
                <span class="text-sm font-bold text-primary"
                    >{calculateOracleFees(
                        campaign.fund_amount,
                        campaign.fund_token_decimals,
                        campaign.fund_token_symbol,
                        campaign.exchange_oracle_fee_percent,
                        campaign.recording_oracle_fee_percent,
                        campaign.reputation_oracle_fee_percent,
                    )}</span
                >
            </div>
        </div>
    </div>

    <!-- Results Section -->
    <div class="flex flex-col space-y-4">
        <div class="font-bold text-sm bg-slate-50 p-3 px-4 rounded-lg">
            Results
        </div>
        <div class="flex flex-col space-y-4 px-2">
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold">Campaign Results</span>
                <div class="flex items-center gap-2">
                    <span
                        class="w-2 h-2 rounded-full {getCampaignResults(
                            campaign,
                        ) === 'N/A'
                            ? 'bg-error'
                            : 'bg-warning'}"
                    ></span>
                    <span class="text-sm font-medium"
                        >{getCampaignResults(campaign)}</span
                    >
                    {#if getCampaignResults(campaign) !== "N/A"}
                        <a
                            href={campaign.final_results_url ||
                                campaign.intermediate_results_url ||
                                ""}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn btn-ghost btn-xs"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                                stroke="currentColor"
                                class="w-4 h-4"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                />
                            </svg>
                        </a>
                    {/if}
                </div>
            </div>

            {#if campaign.daily_paid_amounts && campaign.daily_paid_amounts.length > 0}
                <div class="border-t border-gray-100 pt-4">
                    <div class="text-xs text-gray-500 mb-2">Daily Payments</div>
                    <div class="max-h-32 overflow-y-auto space-y-1">
                        {#each campaign.daily_paid_amounts as payment}
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-500">{payment.date}</span
                                >
                                <span class="font-medium"
                                    >{payment.amount}
                                    {campaign.fund_token_symbol}</span
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Oracle Addresses -->
    <div class="flex flex-col space-y-4">
        <div class="font-bold text-sm bg-slate-50 p-3 px-4 rounded-lg">
            Oracle Addresses
        </div>
        <div class="flex flex-col space-y-3 px-2">
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500 font-medium">Launcher</span>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{shortenAddress(campaign.launcher)}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.launcher)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500 font-medium"
                    >Exchange Oracle</span
                >
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{shortenAddress(campaign.exchange_oracle)}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.exchange_oracle)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500 font-medium"
                    >Recording Oracle</span
                >
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{shortenAddress(campaign.recording_oracle)}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.recording_oracle)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500 font-medium"
                    >Reputation Oracle</span
                >
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{shortenAddress(campaign.reputation_oracle)}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.reputation_oracle)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500 font-medium">Fund Token</span
                >
                <div class="flex items-center gap-2">
                    <span class="text-sm font-mono"
                        >{campaign.fund_token_symbol}</span
                    >
                    <button
                        class="btn btn-ghost btn-xs"
                        on:click={() => copyAddress(campaign.fund_token)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
