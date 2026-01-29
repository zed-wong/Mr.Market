<script lang="ts">
    import clsx from "clsx";
    import toast from "svelte-french-toast";
    import { _ } from "svelte-i18n";
    import { createEventDispatcher } from "svelte";
    import { getUuid } from "@mixin.dev/mixin-node-sdk";
    import { MIXIN_API_BASE_URL } from "$lib/helpers/constants";
    import { mixinAsset } from "$lib/helpers/mixin/mixin";
    import {
        addMarketMakingPair,
        getCcxtExchangeMarkets,
    } from "$lib/helpers/mrm/admin/growdata";
    import type { MarketMakingPair, MarketMakingPairDto } from "$lib/types/hufi/grow";

    export let configuredExchanges: {
        exchange_id: string;
        name: string;
        icon_url?: string;
        enable: boolean;
    }[] = [];
    export let existingPairs: MarketMakingPair[] = [];

    const dispatch = createEventDispatcher();

    let addDialog = false;
    let symbolQuery = "";
    let marketsByExchange: Record<string, any[]> = {};
    let isLoadingMarkets = false;
    let loadingExchangeIds: string[] = [];
    let hasFetchedAll = false;
    let addingKey: string | null = null;
    let showAssetPicker = false;
    let pendingMarket: any = null;
    let baseAssetOptions: any[] = [];
    let quoteAssetOptions: any[] = [];
    let selectedBaseAsset: any = null;
    let selectedQuoteAsset: any = null;
    let chainInfoById: Record<string, any> = {};

    const normalizeSymbol = (symbol: string) =>
        symbol.split(":")[0].trim().toUpperCase();

    $: exchangeById = Object.fromEntries(
        configuredExchanges.map((exchange) => [exchange.exchange_id, exchange]),
    );
    $: existingPairKeys = new Set(
        existingPairs.map(
            (pair) =>
                `${pair.exchange_id}:${normalizeSymbol(pair.symbol || "")}`,
        ),
    );

    $: filteredMarkets = symbolQuery.trim().length
        ? (() => {
              const seenKeys = new Set<string>();
              return configuredExchanges
                  .flatMap((exchange) =>
                      (marketsByExchange[exchange.exchange_id] || []).map(
                          (market) => ({
                              ...market,
                              exchange_id: exchange.exchange_id,
                              display_symbol: (market?.symbol || "").split(":")[0],
                          }),
                      ),
                  )
                  .filter((market) => {
                      if (market?.spot === false) return false;
                      if ((market?.symbol || "").includes(":")) return false;
                      const query = symbolQuery.trim().toLowerCase();
                      const symbol = (market?.display_symbol || "").toLowerCase();
                      const base = (market?.base || "").toLowerCase();
                      const quote = (market?.quote || "").toLowerCase();
                      return (
                          symbol.includes(query) ||
                          base === query ||
                          quote === query
                      );
                  })
                  .filter((market) => {
                      const key = `${market.exchange_id}:${market.display_symbol}`;
                      if (seenKeys.has(key)) return false;
                      seenKeys.add(key);
                      return true;
                  })
                  .slice(0, 100);
          })()
        : [];

    $: if (addDialog && symbolQuery.trim().length > 0 && !hasFetchedAll) {
        hasFetchedAll = true;
        fetchAllMarkets();
    }

    async function fetchExchangeMarkets(exchangeId: string, token: string) {
        if (
            marketsByExchange[exchangeId] ||
            loadingExchangeIds.includes(exchangeId)
        ) {
            return;
        }
        loadingExchangeIds = [...loadingExchangeIds, exchangeId];
        try {
            const markets = await getCcxtExchangeMarkets(exchangeId, token);
            if (Array.isArray(markets)) {
                marketsByExchange = {
                    ...marketsByExchange,
                    [exchangeId]: markets,
                };
            }
        } catch (error) {
            console.error(`Failed to fetch markets for ${exchangeId}`, error);
        } finally {
            loadingExchangeIds = loadingExchangeIds.filter(
                (id) => id !== exchangeId,
            );
        }
    }

    async function fetchAllMarkets() {
        if (!configuredExchanges.length) return;
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing") || "Auth token missing");
            return;
        }
        isLoadingMarkets = true;
        try {
            await Promise.all(
                configuredExchanges.map((exchange) =>
                    fetchExchangeMarkets(exchange.exchange_id, token),
                ),
            );
        } finally {
            isLoadingMarkets = false;
        }
    }

    async function fetchAssetsBySymbol(symbol: string) {
        if (!symbol) return [];
        try {
            const response = await fetch(
                `${MIXIN_API_BASE_URL}/network/assets/search/${symbol}`,
            );
            const data = await response.json();
            const assets = data?.data || [];
            const exact = assets.filter(
                (asset: any) =>
                    asset.symbol?.toLowerCase() === symbol.toLowerCase(),
            );
            return exact.length ? exact : assets;
        } catch (error) {
            console.error("Failed to resolve asset", error);
            return [];
        }
    }

    function hasMultipleChains(assets: any[]) {
        const chainIds = assets.map((asset) => asset?.chain_id).filter(Boolean);
        return new Set(chainIds).size > 1;
    }

    function getChainIds(assets: any[]): string[] {
        return assets
            .map((asset) => asset?.chain_id)
            .filter(
                (chainId): chainId is string => typeof chainId === "string",
            );
    }

    async function ensureChainInfo(chainId: string) {
        if (!chainId || chainInfoById[chainId]) return;
        try {
            const asset = await mixinAsset(chainId);
            chainInfoById = { ...chainInfoById, [chainId]: asset };
        } catch (error) {
            console.error("Failed to fetch chain asset", error);
        }
    }

    function resetAssetPicker() {
        showAssetPicker = false;
        pendingMarket = null;
        baseAssetOptions = [];
        quoteAssetOptions = [];
        selectedBaseAsset = null;
        selectedQuoteAsset = null;
    }

    async function submitPair(market: any, baseAsset: any, quoteAsset: any) {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing") || "Auth token missing");
            return;
        }

        const pair: MarketMakingPairDto = {
            id: getUuid(),
            symbol: market.symbol,
            base_symbol: market.base,
            quote_symbol: market.quote,
            base_asset_id: baseAsset.asset_id,
            base_icon_url: baseAsset.icon_url,
            quote_asset_id: quoteAsset.asset_id,
            quote_icon_url: quoteAsset.icon_url,
            exchange_id: market.exchange_id,
            custom_fee_rate: undefined,
            enable: true,
        };

        await toast.promise(addMarketMakingPair(pair, token), {
            loading: $_("adding_pair_msg"),
            success: $_("add_pair_success_msg"),
            error: $_("add_pair_failed_msg"),
        });

        dispatch("refresh");
    }

    async function addFromMarket(market: any) {
        const existingKey = `${market.exchange_id}:${normalizeSymbol(
            market.display_symbol || market.symbol || "",
        )}`;
        if (existingPairKeys.has(existingKey)) {
            toast.error($_("pair_already_added"));
            return;
        }

        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing") || "Auth token missing");
            return;
        }

        addingKey = `${market.exchange_id}:${market.symbol}`;

        try {
            const [baseAssets, quoteAssets] = await Promise.all([
                fetchAssetsBySymbol(market.base),
                fetchAssetsBySymbol(market.quote),
            ]);

            if (!baseAssets.length || !quoteAssets.length) {
                toast.error($_("no_assets_found") || "No assets found");
                return;
            }

            baseAssetOptions = baseAssets;
            quoteAssetOptions = quoteAssets;
            selectedBaseAsset = baseAssets[0];
            selectedQuoteAsset = quoteAssets[0];

            const chainIds = Array.from(
                new Set([
                    ...getChainIds(baseAssets),
                    ...getChainIds(quoteAssets),
                ]),
            );
            await Promise.all(
                chainIds.map((chainId) => ensureChainInfo(chainId)),
            );

            if (
                hasMultipleChains(baseAssets) ||
                hasMultipleChains(quoteAssets)
            ) {
                pendingMarket = market;
                showAssetPicker = true;
                return;
            }

            await submitPair(market, baseAssets[0], quoteAssets[0]);
        } finally {
            addingKey = null;
        }
    }

    async function confirmAssetSelection() {
        if (!pendingMarket || !selectedBaseAsset || !selectedQuoteAsset) {
            toast.error($_("fill_all_fields_msg"));
            return;
        }

        const existingKey = `${pendingMarket.exchange_id}:${normalizeSymbol(
            pendingMarket.display_symbol || pendingMarket.symbol || "",
        )}`;
        if (existingPairKeys.has(existingKey)) {
            toast.error($_("pair_already_added"));
            return;
        }

        addingKey = `${pendingMarket.exchange_id}:${pendingMarket.symbol}`;
        try {
            await submitPair(
                pendingMarket,
                selectedBaseAsset,
                selectedQuoteAsset,
            );
            resetAssetPicker();
        } finally {
            addingKey = null;
        }
    }

    function resetState() {
        symbolQuery = "";
        marketsByExchange = {};
        isLoadingMarkets = false;
        loadingExchangeIds = [];
        hasFetchedAll = false;
        addingKey = null;
        resetAssetPicker();
    }
</script>

<details
    class="dropdown dropdown-end"
    bind:open={addDialog}
    on:toggle={() => !addDialog && resetState()}
>
    <summary class="btn btn-outline gap-2">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="w-4 h-4"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
            />
        </svg>
        {$_("quick_add")}
    </summary>
    <div
        class="dropdown-content bg-base-100 rounded-box p-6 shadow-xl border border-base-200 w-lg mt-2 max-h-[80vh] overflow-y-auto"
    >
        <div class="flex justify-between items-center mb-4">
            <span class="text-lg font-semibold">{$_("quick_add_pair")}</span>
            <button
                class="btn btn-sm btn-circle btn-ghost"
                on:click={() => (addDialog = false)}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        {#if configuredExchanges.length === 0}
            <div class="alert alert-warning">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
                <span>{$_("no_exchanges_configured_msg")}</span>
            </div>
        {:else}
            <div class="space-y-4">
                <div class="form-control w-full">
                    <label class="label" for="quick-symbol-input">
                        <span class="label-text font-medium"
                            >{$_("symbol")}</span
                        >
                        <span class="label-text-alt text-base-content/60"
                            >{$_("symbol_examples_pairs")}</span
                        >
                    </label>
                    <input
                        id="quick-symbol-input"
                        type="text"
                        class="input input-bordered w-full focus:input-primary transition-all"
                        bind:value={symbolQuery}
                        placeholder={$_("symbol_placeholder_pairs")}
                    />
                    <span class="text-xs text-base-content/50 mt-1">
                        {$_("search_all_exchanges_hint")}
                    </span>
                </div>

                {#if showAssetPicker}
                    <div
                        class="rounded-lg border border-base-200 bg-base-200/40 p-4 space-y-4"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-semibold">
                                    {$_("select_assets")}
                                </div>
                                <div class="text-xs text-base-content/60">
                                    {$_("select_assets_hint")}
                                </div>
                            </div>
                            <button
                                class="btn btn-xs btn-ghost"
                                on:click={resetAssetPicker}
                            >
                                {$_("cancel")}
                            </button>
                        </div>

                        <div class="space-y-2">
                            <div
                                class="text-xs font-semibold capitalize tracking-wide opacity-60"
                            >
                                {$_("base_asset_choice", {
                                    values: { symbol: pendingMarket?.base },
                                })}
                            </div>
                            {#each baseAssetOptions as asset}
                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-base-200 bg-base-100"
                                >
                                    <input
                                        type="radio"
                                        name="base-asset"
                                        class="radio radio-sm"
                                        checked={selectedBaseAsset?.asset_id ===
                                            asset.asset_id}
                                        on:change={() =>
                                            (selectedBaseAsset = asset)}
                                    />
                                    <img
                                        src={asset.icon_url}
                                        alt={asset.symbol}
                                        class="w-8 h-8 rounded-full"
                                    />
                                    <div class="flex-1">
                                        <div class="font-semibold">
                                            {asset.symbol}
                                        </div>
                                        <div
                                            class="text-xs text-base-content/60"
                                        >
                                            {asset.name}
                                        </div>
                                    </div>
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        {#if chainInfoById[asset.chain_id]?.icon_url}
                                            <img
                                                src={chainInfoById[
                                                    asset.chain_id
                                                ].icon_url}
                                                alt={chainInfoById[
                                                    asset.chain_id
                                                ].symbol}
                                                class="w-4 h-4 rounded-full"
                                            />
                                        {/if}
                                        <span class="font-mono opacity-70"
                                            >{asset.chain_id}</span
                                        >
                                    </div>
                                </label>
                            {/each}
                        </div>

                        <div class="space-y-2">
                            <div
                                class="text-xs font-semibold capitalize tracking-wide opacity-60"
                            >
                                {$_("quote_asset_choice", {
                                    values: { symbol: pendingMarket?.quote },
                                })}
                            </div>
                            {#each quoteAssetOptions as asset}
                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-base-200 bg-base-100"
                                >
                                    <input
                                        type="radio"
                                        name="quote-asset"
                                        class="radio radio-sm"
                                        checked={selectedQuoteAsset?.asset_id ===
                                            asset.asset_id}
                                        on:change={() =>
                                            (selectedQuoteAsset = asset)}
                                    />
                                    <img
                                        src={asset.icon_url}
                                        alt={asset.symbol}
                                        class="w-8 h-8 rounded-full"
                                    />
                                    <div class="flex-1">
                                        <div class="font-semibold">
                                            {asset.symbol}
                                        </div>
                                        <div
                                            class="text-xs text-base-content/60"
                                        >
                                            {asset.name}
                                        </div>
                                    </div>
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        {#if chainInfoById[asset.chain_id]?.icon_url}
                                            <img
                                                src={chainInfoById[
                                                    asset.chain_id
                                                ].icon_url}
                                                alt={chainInfoById[
                                                    asset.chain_id
                                                ].symbol}
                                                class="w-4 h-4 rounded-full"
                                            />
                                        {/if}
                                        <span class="font-mono opacity-70"
                                            >{asset.chain_id}</span
                                        >
                                    </div>
                                </label>
                            {/each}
                        </div>

                        <button
                            class="btn btn-primary w-full"
                            on:click={confirmAssetSelection}
                            disabled={!selectedBaseAsset || !selectedQuoteAsset}
                        >
                            {#if addingKey && pendingMarket}
                                <span class="loading loading-spinner loading-xs"
                                ></span>
                            {:else}
                                {$_("add_pair_action", {
                                    values: { symbol: pendingMarket?.symbol },
                                })}
                            {/if}
                        </button>
                    </div>
                {/if}

                <div
                    class="divider text-xs font-bold opacity-50 capitalize tracking-wide"
                >
                    {$_("related_pairs")}
                </div>

                {#if isLoadingMarkets}
                    <div class="flex items-center gap-2 text-sm">
                        <span class="loading loading-spinner loading-xs"></span>
                        {$_("loading_markets")} ({configuredExchanges.length} exchanges)
                    </div>
                {:else if symbolQuery.trim().length === 0}
                    <div class="text-sm text-base-content/60">
                        {$_("type_symbol_to_search")}
                    </div>
                {:else if filteredMarkets.length === 0}
                    <div class="text-sm text-base-content/60">
                        {$_("no_matching_markets")}
                    </div>
                {:else}
                    <div class="space-y-2">
                        {#each filteredMarkets as market}
                            <div
                                class="flex items-center justify-between gap-4 p-3 rounded-lg border border-base-200"
                            >
                                <div>
                                    <div class="font-semibold">
                                        {market.display_symbol || market.symbol}
                                    </div>
                                    <div
                                        class="flex items-center gap-2 text-xs text-base-content/60 mt-1"
                                    >
                                        {#if exchangeById[market.exchange_id]?.icon_url}
                                            <img
                                                src={exchangeById[
                                                    market.exchange_id
                                                ].icon_url}
                                                alt={exchangeById[
                                                    market.exchange_id
                                                ].name}
                                                class="h-4 w-auto"
                                            />
                                        {/if}
                                        <span
                                            >{exchangeById[market.exchange_id]
                                                ?.name ||
                                                market.exchange_id}</span
                                        >
                                    </div>
                                </div>
                                <button
                                    class={clsx(
                                        "btn btn-sm btn-primary",
                                        addingKey ===
                                            `${market.exchange_id}:${market.symbol}` &&
                                            "btn-disabled",
                                    )}
                                    on:click={() => addFromMarket(market)}
                                    disabled={addingKey ===
                                        `${market.exchange_id}:${market.symbol}` ||
                                        existingPairKeys.has(
                                            `${market.exchange_id}:${normalizeSymbol(
                                                market.display_symbol ||
                                                    market.symbol ||
                                                    "",
                                            )}`,
                                        )}
                                >
                                    {#if existingPairKeys.has(
                                        `${market.exchange_id}:${normalizeSymbol(
                                            market.display_symbol ||
                                                market.symbol ||
                                                "",
                                        )}`,
                                    )}
                                        {$_("pair_added")}
                                    {:else if addingKey === `${market.exchange_id}:${market.symbol}`}
                                        <span
                                            class="loading loading-spinner loading-xs"
                                        ></span>
                                    {:else}
                                        {$_("add")}
                                    {/if}
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</details>
