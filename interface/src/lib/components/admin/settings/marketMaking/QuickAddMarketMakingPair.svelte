<script lang="ts">
    import clsx from "clsx";
    import { toast } from "svelte-sonner";
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
    export let embedded = false;
    export let resetToken = 0;

    const dispatch = createEventDispatcher();

    let addDialog = false;
    let symbolQuery = "";
    let marketsByExchange: Record<string, any[]> = {};
    let isLoadingMarkets = false;
    let loadingExchangeIds: string[] = [];
    let hasFetchedAll = false;
    let addingKey: string | null = null;
    let isFocusedAddFlow = false;
    let loadingMarket: any = null;
    let showAssetPicker = false;
    let pendingMarket: any = null;
    let baseAssetOptions: any[] = [];
    let quoteAssetOptions: any[] = [];
    let selectedBaseAsset: any = null;
    let selectedQuoteAsset: any = null;
    let chainInfoById: Record<string, any> = {};

    const normalizeSymbol = (symbol: string) =>
        symbol.split(":")[0].trim().toUpperCase();

    type MarketCandidate = {
        exchange_id: string;
        symbol?: string;
        display_symbol?: string;
        base?: string;
        quote?: string;
        spot?: boolean;
        [key: string]: unknown;
    };

    function normalizePairText(value: string) {
        return value
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/[-_]/g, "/")
            .replace(/\/+/g, "/");
    }

    function rankPairMatch(market: MarketCandidate, queryRaw: string) {
        const query = normalizePairText(queryRaw);
        if (!query) return 999;

        const symbol = normalizePairText(market.display_symbol || market.symbol || "");
        if (!symbol) return 999;
        if (symbol === query) return 0;

        const base = normalizePairText(market.base || "");
        const quote = normalizePairText(market.quote || "");

        if (query.includes("/")) {
            const [qBase, qQuote] = query.split("/");
            if (qBase && qQuote && base === qBase && quote === qQuote) return 1;
            if (qBase && symbol.startsWith(`${qBase}/`)) return 2;
            if (qQuote && symbol.endsWith(`/${qQuote}`)) return 3;
        } else {
            if (base === query || quote === query) return 1;
            if (symbol.startsWith(query)) return 2;
        }

        if (symbol.includes(query)) return 4;
        return 10;
    }

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
              const queryRaw = symbolQuery.trim();
              const query = normalizePairText(queryRaw);
              const results = configuredExchanges
                  .flatMap((exchange) =>
                      (marketsByExchange[exchange.exchange_id] || []).map(
                          (market) => ({
                              ...market,
                              exchange_id: exchange.exchange_id,
                              display_symbol: (market?.symbol || "").split(":")[0],
                          }) as MarketCandidate,
                      ),
                  )
                  .filter((market) => {
                      if (market?.spot === false) return false;
                      if ((market?.symbol || "").includes(":")) return false;
                       const symbol = normalizePairText(
                           market.display_symbol || market.symbol || "",
                       );
                      const base = normalizePairText(market.base || "");
                      const quote = normalizePairText(market.quote || "");
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
                  });

              return results
                  .map((market, idx) => ({
                      market,
                      idx,
                      rank: rankPairMatch(market, queryRaw),
                  }))
                  .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
                  .map((item) => item.market)
                  .slice(0, 100);
          })()
        : [];

    $: if ((embedded || addDialog) && symbolQuery.trim().length > 0 && !hasFetchedAll) {
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
        isFocusedAddFlow = false;
        loadingMarket = null;
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

        isFocusedAddFlow = true;
        loadingMarket = market;
        addingKey = `${market.exchange_id}:${market.symbol}`;

        try {
            const [baseAssets, quoteAssets] = await Promise.all([
                fetchAssetsBySymbol(market.base),
                fetchAssetsBySymbol(market.quote),
            ]);

            if (!baseAssets.length || !quoteAssets.length) {
                toast.error($_("no_assets_found") || "No assets found");
                isFocusedAddFlow = false;
                loadingMarket = null;
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
            if (!showAssetPicker) {
                isFocusedAddFlow = false;
                loadingMarket = null;
            }
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
            isFocusedAddFlow = false;
            loadingMarket = null;
        }
    }

    function resetState() {
        symbolQuery = "";
        marketsByExchange = {};
        isLoadingMarkets = false;
        loadingExchangeIds = [];
        hasFetchedAll = false;
        addingKey = null;
        isFocusedAddFlow = false;
        loadingMarket = null;
        resetAssetPicker();
    }

    $: if (embedded && resetToken > 0) {
        resetState();
    }
</script>

{#if embedded}
    <div class="w-full">
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
                {#if !isFocusedAddFlow}
                    <label
                        class="input input-lg text-sm w-full rounded-full bg-base-200 border-0.5 border-base-200 focus-within:border-base-200 focus-within:outline-none flex items-center gap-2"
                    >
                        <svg
                            class="h-[1em] opacity-50"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                        >
                            <g
                                stroke-linejoin="round"
                                stroke-linecap="round"
                                stroke-width="2.5"
                                fill="none"
                                stroke="currentColor"
                            >
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.3-4.3"></path>
                            </g>
                        </svg>
                        <input
                            id="quick-symbol-input"
                            type="search"
                            class="grow"
                            bind:value={symbolQuery}
                            placeholder={$_("search_pair_placeholder")}
                        />
                    </label>
                {/if}

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

                {#if isFocusedAddFlow && addingKey && !showAssetPicker && loadingMarket}
                    <div
                        class="rounded-lg border border-base-200 bg-base-200/40 p-3"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <div class="font-medium">
                                    {loadingMarket.display_symbol ||
                                        loadingMarket.symbol}
                                </div>
                                <span class="text-xs text-base-content/60">
                                    {exchangeById[loadingMarket.exchange_id]?.name ||
                                        loadingMarket.exchange_id}
                                </span>
                            </div>
                            <button class="btn btn-sm btn-primary btn-disabled">
                                <span
                                    class="loading loading-spinner loading-xs"
                                ></span>
                            </button>
                        </div>
                    </div>
                {:else if !isFocusedAddFlow && isLoadingMarkets}
                    <div class="flex items-center gap-2 text-sm">
                        <span class="loading loading-spinner loading-xs"></span>
                        {$_("loading_markets")} ({configuredExchanges.length} exchanges)
                    </div>
                {:else if !isFocusedAddFlow && symbolQuery.trim().length === 0}
                    <div class="text-sm text-base-content/60">
                        {$_("type_symbol_to_search")}
                    </div>
                {:else if !isFocusedAddFlow && filteredMarkets.length === 0}
                    <div class="text-sm text-base-content/60">
                        {$_("no_matching_markets")}
                    </div>
                {:else if !isFocusedAddFlow}
                    <div class="space-y-2">
                        {#each filteredMarkets as market}
                            <div class="flex items-center justify-between gap-4 p-2.5 rounded-lg border border-base-200">
                                <div>
                                    <div class="font-medium">
                                        {market.display_symbol || market.symbol}
                                    </div>
                                    <span class="text-xs text-base-content/60">
                                        {exchangeById[market.exchange_id]?.name || market.exchange_id}
                                    </span>
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
{:else}
    <details
        class={clsx(!embedded && "dropdown dropdown-end", embedded && "w-full")}
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
            class={clsx(
                "bg-base-100 rounded-box p-6 shadow-xl border border-base-200 max-h-[80vh] overflow-y-auto",
                "dropdown-content w-lg mt-2",
            )}
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
                    {#if !isFocusedAddFlow}
                        <label
                            class="input input-lg text-sm w-full rounded-full bg-base-200 border-0.5 border-base-200 focus-within:border-base-200 focus-within:outline-none flex items-center gap-2"
                        >
                            <svg
                                class="h-[1em] opacity-50"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                            >
                                <g
                                    stroke-linejoin="round"
                                    stroke-linecap="round"
                                    stroke-width="2.5"
                                    fill="none"
                                    stroke="currentColor"
                                >
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="m21 21-4.3-4.3"></path>
                                </g>
                            </svg>
                            <input
                                id="quick-symbol-input"
                                type="search"
                                class="grow"
                                bind:value={symbolQuery}
                                placeholder={$_("search_pair_placeholder")}
                            />
                        </label>
                    {/if}

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

                    {#if isFocusedAddFlow && addingKey && !showAssetPicker && loadingMarket}
                        <div
                            class="rounded-lg border border-base-200 bg-base-200/40 p-3"
                        >
                            <div class="flex items-center justify-between gap-4">
                                <div>
                                    <div class="font-medium">
                                        {loadingMarket.display_symbol ||
                                            loadingMarket.symbol}
                                    </div>
                                    <span class="text-xs text-base-content/60">
                                        {exchangeById[loadingMarket.exchange_id]
                                            ?.name || loadingMarket.exchange_id}
                                    </span>
                                </div>
                                <button
                                    class="btn btn-sm btn-primary btn-disabled"
                                >
                                    <span
                                        class="loading loading-spinner loading-xs"
                                    ></span>
                                </button>
                            </div>
                        </div>
                    {:else if !isFocusedAddFlow && isLoadingMarkets}
                        <div class="flex items-center gap-2 text-sm">
                            <span class="loading loading-spinner loading-xs"></span>
                            {$_("loading_markets")} ({configuredExchanges.length} exchanges)
                        </div>
                    {:else if !isFocusedAddFlow && symbolQuery.trim().length === 0}
                        <div class="text-sm text-base-content/60">
                            {$_("type_symbol_to_search")}
                        </div>
                    {:else if !isFocusedAddFlow && filteredMarkets.length === 0}
                        <div class="text-sm text-base-content/60">
                            {$_("no_matching_markets")}
                        </div>
                    {:else if !isFocusedAddFlow}
                        <div class="space-y-2">
                            {#each filteredMarkets as market}
                                <div class="flex items-center justify-between gap-4 p-2.5 rounded-lg border border-base-200">
                                    <div>
                                        <div class="font-medium">
                                            {market.display_symbol || market.symbol}
                                        </div>
                                        <span class="text-xs text-base-content/60">
                                            {exchangeById[market.exchange_id]?.name || market.exchange_id}
                                        </span>
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
{/if}
