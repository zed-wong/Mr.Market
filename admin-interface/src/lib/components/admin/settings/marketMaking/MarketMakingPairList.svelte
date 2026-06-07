<script lang="ts">
    import clsx from "clsx";
    import { createEventDispatcher } from "svelte";
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import type {
        MarketMakingPair,
        MarketMakingPairDto,
    } from "$lib/types/hufi/grow";
    import {
        updateMarketMakingPair,
        removeMarketMakingPair,
    } from "$lib/helpers/mrm/admin/growdata";

    export let marketMakingPairs: MarketMakingPair[] = [];
    export let configuredExchanges: { exchange_id: string; name: string }[] = [];

    const dispatch = createEventDispatcher();

    let isUpdating = "";
    let isDeleting = "";
    let searchQuery = "";
    let filterExchange = "";

    // Pagination
    let currentPage = 1;
    let itemsPerPage = 10;
    const itemsPerPageOptions = [10, 25, 50];
    $: exchangeOptions = configuredExchanges.length
        ? configuredExchanges.map((e) => ({ id: e.exchange_id, name: e.name }))
        : [...new Set(marketMakingPairs.map((p) => p.exchange_id))].filter(Boolean).map((id) => ({ id, name: id }));
    $: sortedPairs = [...marketMakingPairs]
        .filter(p => {
            if (searchQuery && !p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) && !p.exchange_id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (filterExchange && p.exchange_id !== filterExchange) return false;
            return true;
        })
        .sort((a, b) => {
            const exchangeCompare = a.exchange_id.localeCompare(b.exchange_id);
            if (exchangeCompare !== 0) return exchangeCompare;
            return a.symbol.localeCompare(b.symbol);
        });
    $: totalPages = Math.max(1, Math.ceil(sortedPairs.length / itemsPerPage));
    $: paginatedPairs = sortedPairs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
    );
    $: totalEntries = sortedPairs.length;
    $: showingStart = totalEntries === 0
        ? 0
        : (currentPage - 1) * itemsPerPage + 1;
    $: showingEnd = totalEntries === 0
        ? 0
        : Math.min(currentPage * itemsPerPage, totalEntries);

    function marketMakingPairKey(pair: MarketMakingPair) {
        return `${pair.exchange_id}:${pair.symbol}`;
    }

    async function UpdateMarketMakingPair(pair: MarketMakingPair, enable: boolean) {
        if (!pair.id) return;
        const token = localStorage.getItem("admin-access-token");
        if (!token) return;

        isUpdating = marketMakingPairKey(pair);
        try {
            await updateMarketMakingPair(
                pair.id,
                { enable } as Partial<MarketMakingPairDto>,
                token,
            );
            dispatch("refresh");
        } finally {
            isUpdating = "";
        }
    }

    async function DeleteMarketMakingPair(id: string) {
        if (!id) return;
        isDeleting = id;
        const token = localStorage.getItem("admin-access-token");
        if (!token) return;
        await removeMarketMakingPair(id, token);
        dispatch("refresh");
        isDeleting = "";
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        toast.success($_("copied"));
    }

    function applyFilters() {
        currentPage = 1;
    }
</script>

{#if !marketMakingPairs}
    <div
        class="w-full h-64 flex flex-col justify-center items-center gap-4 text-base-content/40"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-12 h-12"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
        </svg>
        <p>{$_("failed_to_load_data")}</p>
        <button
            class="btn btn-sm btn-ghost"
            on:click={() => window.location.reload()}
        >
            {$_("reload")}
        </button>
    </div>
{:else}
    <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none">
        <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex flex-col gap-4">
                <span class="text-lg font-semibold text-base-content capitalize">{$_("market_making")} {$_("pairs")}</span>
                <span class="font-mono text-xs text-base-content/50">
                    page {currentPage} / {totalPages} · {showingStart} - {showingEnd} shown · {totalEntries} total
                </span>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                    class="select select-bordered select-sm w-full rounded-full border-base-300 bg-base-100 text-sm capitalize sm:w-80"
                    bind:value={filterExchange}
                    on:change={applyFilters}
                >
                    <option value="">{$_("all_exchanges")}</option>
                    {#each exchangeOptions as ex}
                        <option value={ex.id} class="capitalize">{ex.name}</option>
                    {/each}
                </select>
                <input
                    class="input input-bordered input-sm w-full rounded-full border-base-300 bg-base-100 font-mono text-xs sm:w-80"
                    placeholder={$_("search_pairs")}
                    bind:value={searchQuery}
                    on:input={applyFilters}
                />
                <button
                    type="button"
                    class="btn btn-sm rounded-full bg-base-content px-5 text-base-100 hover:bg-base-content/80 capitalize"
                    on:click={applyFilters}
                >
                    {$_("admin_filter")}
                </button>
            </div>
        </div>

        {#if paginatedPairs.length === 0}
            <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center">
                <span class="text-sm font-semibold text-base-content capitalize">{$_("no_pairs_found")}</span>
                <span class="text-sm text-base-content/60">{$_("search_pairs")}</span>
            </div>
        {:else}
        <div class="overflow-x-auto">
            <table class="table table-sm">
                <thead>
                    <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                        <th class="font-medium"
                            >{$_("icon")}</th
                        >
                        <th class="font-medium"
                            >{$_("exchange")}</th
                        >
                        <th class="font-medium"
                            >{$_("symbol")}</th
                        >
                        <th class="font-medium"
                            >{$_("base")} {$_("asset_id")}</th
                        >
                        <th class="font-medium"
                            >{$_("quote")} {$_("asset_id")}</th
                        >
                        <th class="font-medium"
                            >{$_("fee_rate")}</th
                        >
                        <th class="text-center font-medium"
                            >{$_("status")}</th
                        >
                        <th class="text-right font-medium"
                            >{$_("action")}</th
                        >
                    </tr>
                </thead>
                <tbody>
                    {#each paginatedPairs as pair}
                        <tr class="border-b border-base-300 hover:bg-neutral">
                            <td>
                                <div class="flex -space-x-1.5">
                                    <img
                                        class="inline-block min-w-6 min-h-6 h-6 w-6 rounded-full ring-2 ring-base-100"
                                        src={pair.base_icon_url}
                                        alt=""
                                    />
                                    <img
                                        class="inline-block min-w-6 min-h-6 h-6 w-6 rounded-full ring-2 ring-base-100"
                                        src={pair.quote_icon_url}
                                        alt=""
                                    />
                                </div>
                            </td>
                            <td class="font-medium">
                                <span
                                    class="font-mono text-xs font-semibold text-base-content"
                                    >{pair.exchange_id}</span
                                >
                            </td>
                            <td class="font-medium">
                                <span class="font-mono text-xs text-base-content"
                                    >{pair.symbol}</span
                                >
                            </td>
                            <td class="max-w-[150px]">
                                <div class="flex items-center gap-1 group/id">
                                    <div
                                        class="tooltip tooltip-right"
                                        data-tip={pair.base_symbol}
                                    >
                                        <span
                                            class="block truncate font-mono text-xs text-base-content/70"
                                        >
                                            {pair.base_asset_id.slice(0, 8)}...{pair.base_asset_id.slice(-4)}
                                        </span>
                                    </div>
                                    <button
                                        class="btn btn-ghost btn-xs btn-square opacity-0 group-hover/id:opacity-100 transition-opacity"
                                        aria-label={`copy ${pair.base_symbol} asset id`}
                                        on:click={() => copyToClipboard(pair.base_asset_id)}
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
                                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </td>
                            <td class="max-w-[150px]">
                                <div class="flex items-center gap-1 group/id">
                                    <div
                                        class="tooltip tooltip-right"
                                        data-tip={pair.quote_symbol}
                                    >
                                        <span
                                            class="block truncate font-mono text-xs text-base-content/70"
                                        >
                                            {pair.quote_asset_id.slice(0, 8)}...{pair.quote_asset_id.slice(-4)}
                                        </span>
                                    </div>
                                    <button
                                        class="btn btn-ghost btn-xs btn-square opacity-0 group-hover/id:opacity-100 transition-opacity"
                                        aria-label={`copy ${pair.quote_symbol} asset id`}
                                        on:click={() => copyToClipboard(pair.quote_asset_id)}
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
                                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </td>
                            <td>
                                {#if pair.custom_fee_rate}
                                    <span
                                        class="badge badge-primary badge-outline badge-sm"
                                        >{pair.custom_fee_rate}</span
                                    >
                                {:else}
                                    <span class="text-base-content/30">-</span>
                                {/if}
                            </td>
                            <td class="text-center">
                                <button
                                    class={clsx(
                                        "btn btn-xs btn-circle transition-all",
                                        pair.enable
                                            ? "btn-success text-white"
                                            : "btn-ghost text-base-content/40",
                                    )}
                                    on:click={async () => {
                                        const newEnable = !pair.enable;
                                        await UpdateMarketMakingPair(
                                            pair,
                                            newEnable,
                                        );
                                    }}
                                    disabled={!!isUpdating}
                                >
                                    {#if isUpdating === marketMakingPairKey(pair)}
                                        <span
                                            class="loading loading-spinner loading-xs"
                                        ></span>
                                    {:else if pair.enable}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-5 h-5"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    {:else}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            class="w-5 h-5"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM6.75 9.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    {/if}
                                </button>
                            </td>
                            <td class="text-right">
                                <button
                                    class="btn btn-ghost btn-sm text-error hover:bg-error/10"
                                    aria-label={`delete ${pair.symbol}`}
                                    on:click={async () => {
                                        if (
                                            confirm($_("confirm_delete_pair"))
                                        ) {
                                            await DeleteMarketMakingPair(
                                                pair.id,
                                            );
                                        }
                                    }}
                                >
                                    {#if isDeleting === pair.id}
                                        <span
                                            class="loading loading-spinner loading-xs"
                                        ></span>
                                    {:else}
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
                                                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                                            />
                                        </svg>
                                    {/if}
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Pagination Footer -->
        <div
            class="mt-6 flex flex-wrap items-end justify-between gap-3"
        >
            <div class="text-xs text-base-content/50">
                configured market-making pairs · {totalEntries} matched
            </div>
            <div class="flex flex-col items-stretch gap-2 sm:items-end">
                <select
                    class="select select-bordered select-sm w-full rounded-full border-base-300 bg-base-100 font-mono text-xs sm:w-56"
                    bind:value={itemsPerPage}
                    on:change={applyFilters}
                    aria-label="rows per page"
                >
                    {#each itemsPerPageOptions as option}
                        <option value={option}>{option} rows</option>
                    {/each}
                </select>
                <div class="join">
                    <button
                        class="join-item btn btn-sm border-base-300 bg-base-100 capitalize"
                        disabled={currentPage === 1}
                        on:click={() =>
                            (currentPage = Math.max(1, currentPage - 1))}
                    >
                        {$_("previous")}
                    </button>
                    <button
                        class="join-item btn btn-sm border-base-300 bg-base-100 capitalize"
                        disabled={currentPage === totalPages ||
                            marketMakingPairs.length === 0}
                        on:click={() =>
                            (currentPage = Math.min(totalPages, currentPage + 1))}
                    >
                        {$_("next")}
                    </button>
                </div>
            </div>
        </div>
        {/if}
    </div>
{/if}
