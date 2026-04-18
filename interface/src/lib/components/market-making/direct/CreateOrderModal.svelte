<script lang="ts">
    import BigNumber from "bignumber.js";
    import { _ } from "svelte-i18n";
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";

    export let show = false;
    export let isStarting = false;
    export let exchangeOptions: string[] = [];
    export let filteredPairs: { symbol: string }[] = [];
    export let filteredApiKeys: AdminSingleKey[] = [];
    export let strategies: MarketMakingStrategy[] = [];
    export let selectedControllerType = "";
    export let prefillingFromOrderId: string | null = null;

    export let startExchangeName = "";
    export let startPair = "";
    export let startStrategyDefinitionId = "";
    export let startApiKeyId = "";
    export let startMakerApiKeyId = "";
    export let startTakerApiKeyId = "";
    export let orderAmount = "";
    export let minOrderAmount = "";
    export let displayMinOrderAmount = "";
    export let orderSpread = "";
    export let intervalTime = "";
    export let numTrades = "";
    export let pricePushRate = "";
    export let postOnlySide = "";
    export let dynamicRoleSwitching = true;
    export let targetQuoteVolume = "";
    export let makerDelayMs = "";
    export let cadenceVariance = "";
    export let tradeAmountVariance = "";
    export let priceOffsetVariance = "";
    export let makerDelayVariance = "";

    export let onSubmit: () => void;
    export let onClose: () => void;
    export let onDuplicateOrder: (() => void) | undefined = undefined;

    let pairSearch = "";
    let pairDropdownOpen = false;
    let pairInputEl: HTMLInputElement;
    let showAdvanced = false;

    $: baseCoin = startPair ? startPair.split("/")[0] : "";
    $: isDualAccountStrategy =
        selectedControllerType === "dualAccountVolume" ||
        selectedControllerType === "dualAccountBestCapacityVolume";
    $: isBestCapacityStrategy =
        selectedControllerType === "dualAccountBestCapacityVolume";

    $: orderAmountError = orderAmount && isNaN(Number(orderAmount));
    $: orderAmountBelowMinimum =
        !orderAmountError &&
        !!orderAmount &&
        !!minOrderAmount &&
        new BigNumber(orderAmount).isFinite() &&
        new BigNumber(orderAmount).isLessThan(minOrderAmount);
    $: spreadError = orderSpread && isNaN(Number(orderSpread));
    $: intervalTimeError = intervalTime && isNaN(Number(intervalTime));
    $: numTradesError = numTrades && isNaN(Number(numTrades));
    $: pricePushRateError = pricePushRate && isNaN(Number(pricePushRate));
    $: targetQuoteVolumeError =
        targetQuoteVolume && isNaN(Number(targetQuoteVolume));
    $: makerDelayMsError = makerDelayMs && isNaN(Number(makerDelayMs));
    $: cadenceVarianceError =
        cadenceVariance && isNaN(Number(cadenceVariance));
    $: tradeAmountVarianceError =
        tradeAmountVariance && isNaN(Number(tradeAmountVariance));
    $: priceOffsetVarianceError =
        priceOffsetVariance && isNaN(Number(priceOffsetVariance));
    $: makerDelayVarianceError =
        makerDelayVariance && isNaN(Number(makerDelayVariance));
    $: makerAccountOptions = filteredApiKeys;
    $: takerAccountOptions = filteredApiKeys.filter(
        (key) => String(key.key_id) !== String(startMakerApiKeyId),
    );
    $: hasDistinctDualAccounts = makerAccountOptions.length >= 2;
    $: dualRequiredMissing =
        isDualAccountStrategy &&
        !isBestCapacityStrategy &&
        (!intervalTime || !numTrades || !pricePushRate);
    $: dualAccountSelectionMissing =
        isDualAccountStrategy &&
        (!startMakerApiKeyId || !startTakerApiKeyId);
    $: dualSameAccount =
        isDualAccountStrategy &&
        !!startMakerApiKeyId &&
        !!startTakerApiKeyId &&
        String(startMakerApiKeyId) === String(startTakerApiKeyId);
    $: dualAccountUnavailable =
        isDualAccountStrategy && !hasDistinctDualAccounts;
    $: submitDisabled =
        isStarting ||
        !startStrategyDefinitionId ||
        orderAmountError ||
        orderAmountBelowMinimum ||
        dualRequiredMissing ||
        dualAccountSelectionMissing ||
        dualAccountUnavailable ||
        dualSameAccount;

    $: searchedPairs = pairSearch
        ? filteredPairs.filter((p) =>
              p.symbol.toLowerCase().includes(pairSearch.toLowerCase()),
          )
        : filteredPairs;

    $: if (
        filteredApiKeys.length > 0 &&
        !filteredApiKeys.find((k) => String(k.key_id) === String(startApiKeyId))
    ) {
        startApiKeyId = String(filteredApiKeys[0].key_id);
    }
    $: if (filteredApiKeys.length === 0) {
        startMakerApiKeyId = "";
        startTakerApiKeyId = "";
    }
    $: if (
        filteredApiKeys.length > 0 &&
        !filteredApiKeys.find(
            (k) => String(k.key_id) === String(startMakerApiKeyId),
        )
    ) {
        startMakerApiKeyId = String(filteredApiKeys[0].key_id);
    }
    $: if (
        isDualAccountStrategy &&
        filteredApiKeys.length > 0 &&
        (!takerAccountOptions.find(
            (k) => String(k.key_id) === String(startTakerApiKeyId),
        ) ||
            String(startMakerApiKeyId) === String(startTakerApiKeyId))
    ) {
        startTakerApiKeyId = String(takerAccountOptions[0]?.key_id ?? "");
    }
    $: renderedMinOrderAmount = displayMinOrderAmount || minOrderAmount;
    $: orderAmountPlaceholder = renderedMinOrderAmount
        ? $_("admin_direct_mm_order_amount_placeholder_with_min", {
              values: { amount: renderedMinOrderAmount },
          })
        : $_("admin_direct_mm_order_amount_placeholder");
    function openPairDropdown() {
        pairDropdownOpen = true;
        pairSearch = "";
        setTimeout(() => pairInputEl?.focus(), 0);
    }

    function selectPair(symbol: string) {
        startPair = symbol;
        pairSearch = "";
        pairDropdownOpen = false;
    }

    function handlePairBlur() {
        setTimeout(() => {
            pairDropdownOpen = false;
        }, 150);
    }
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show}
    <div class="modal modal-open bg-base-content/20 backdrop-blur-[2px]">
        <div
            class="modal-box bg-base-100 p-0 rounded-2xl max-w-120 shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto no-scrollbar"
        >
            <!-- Header -->
            <div class="px-7 pt-6 pb-4">
                <div class="flex items-start justify-between">
                    <div
                        class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="w-5 h-5 text-primary"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </div>
                    <button
                        class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
                        on:click={onClose}
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
                <span class="text-xl font-bold text-base-content block mt-3"
                    >{prefillingFromOrderId
                        ? $_("admin_direct_mm_duplicate_order")
                        : $_("admin_direct_mm_create_new_order")}</span
                >
                <span class="text-sm text-base-content/50 block mt-1"
                    >{prefillingFromOrderId
                        ? $_("admin_direct_mm_configure_duplicate")
                        : $_("admin_direct_mm_configure_deploy")}</span
                >
            </div>

            <!-- Form -->
            <div class="px-7 pb-7 flex flex-col gap-5">
                <!-- Exchange -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_direct_mm_exchange")}</span
                    >
                    <select
                        class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                        bind:value={startExchangeName}
                    >
                        <option value="" disabled selected hidden
                            >{$_("admin_direct_mm_select_exchange")}</option
                        >
                        {#each exchangeOptions as exchangeName}
                            <option value={exchangeName}>{exchangeName}</option>
                        {/each}
                    </select>
                </div>

                {#if startExchangeName}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{isDualAccountStrategy
                                ? $_("admin_direct_mm_maker_account")
                                : $_("admin_direct_mm_api_key")}</span
                        >
                        {#if filteredApiKeys.length > 0}
                            {#if isDualAccountStrategy}
                                <select
                                    class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                                    bind:value={startMakerApiKeyId}
                                >
                                    <option value="" disabled
                                        >{$_(
                                            "admin_direct_mm_read_trade_keys",
                                        )}</option
                                    >
                                    {#each filteredApiKeys as apiKey}
                                        <option value={String(apiKey.key_id)}>
                                            {apiKey.name} ({apiKey.key_id})
                                        </option>
                                    {/each}
                                </select>
                            {:else}
                                <select
                                    class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                                    bind:value={startApiKeyId}
                                >
                                    <option value="" disabled
                                        >{$_(
                                            "admin_direct_mm_read_trade_keys",
                                        )}</option
                                    >
                                    {#each filteredApiKeys as apiKey}
                                        <option value={String(apiKey.key_id)}>
                                            {apiKey.name} ({apiKey.key_id})
                                        </option>
                                    {/each}
                                </select>
                            {/if}
                        {:else}
                            <div
                                class="h-10 min-h-10 px-3 rounded-lg border border-dashed border-base-300 bg-base-100 flex items-center text-sm text-base-content/50"
                            >
                                {$_("admin_direct_mm_no_executable_api_key")}
                            </div>
                        {/if}
                        {#if dualAccountUnavailable}
                            <span class="text-xs text-error mt-1 block"
                                >{$_("admin_direct_mm_error_dual_accounts_required")}</span
                            >
                        {/if}
                    </div>
                    {#if isDualAccountStrategy}
                        <div class="bg-base-200/40 rounded-xl p-4">
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                >{$_("admin_direct_mm_taker_account")}</span
                            >
                            {#if takerAccountOptions.length > 0}
                                <select
                                    class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                                    bind:value={startTakerApiKeyId}
                                >
                                    <option value="" disabled
                                        >{$_(
                                            "admin_direct_mm_read_trade_keys",
                                        )}</option
                                    >
                                    {#each takerAccountOptions as apiKey}
                                        <option value={String(apiKey.key_id)}>
                                            {apiKey.name} ({apiKey.key_id})
                                        </option>
                                    {/each}
                                </select>
                            {:else}
                                <div
                                    class="h-10 min-h-10 px-3 rounded-lg border border-dashed border-base-300 bg-base-100 flex items-center text-sm text-base-content/50"
                                >
                                    {$_(
                                        "admin_direct_mm_no_executable_api_key",
                                    )}
                                </div>
                            {/if}
                            {#if dualSameAccount}
                                <span class="text-xs text-error mt-1 block"
                                    >{$_("admin_direct_mm_error_distinct_accounts")}</span
                                >
                            {/if}
                        </div>
                    {/if}
                {/if}

                <!-- Trading Pair -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_direct_mm_trading_pair")}</span
                    >
                    <div class="relative">
                        {#if pairDropdownOpen}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                                stroke="currentColor"
                                class="w-4 h-4 absolute z-10 left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                                />
                            </svg>
                            <input
                                bind:this={pairInputEl}
                                class="input input-bordered w-full h-10 min-h-10 pl-9 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                                placeholder={$_("admin_direct_mm_search_pairs")}
                                bind:value={pairSearch}
                                on:blur={handlePairBlur}
                            />
                        {:else}
                            <button
                                class="flex items-center justify-between w-full h-10 min-h-10 px-3 bg-base-100 text-sm rounded-lg border border-base-300 hover:border-primary transition-colors"
                                on:click={openPairDropdown}
                            >
                                <span
                                    class={startPair
                                        ? "text-base-content font-medium"
                                        : "text-base-content/40"}
                                >
                                    {startPair ||
                                        $_("admin_direct_mm_search_pairs")}
                                </span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-4 h-4 text-base-content/40"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                                    />
                                </svg>
                            </button>
                        {/if}
                        {#if pairDropdownOpen && searchedPairs.length > 0}
                            <div
                                class="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto no-scrollbar border border-base-300 rounded-lg bg-base-100 shadow-lg"
                            >
                                {#each searchedPairs as pair}
                                    <button
                                        class="w-full text-left px-3 py-2 text-sm hover:bg-base-200 transition-colors
                      {startPair === pair.symbol
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'text-base-content'}"
                                        on:click={() => selectPair(pair.symbol)}
                                    >
                                        {pair.symbol}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Strategy -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_direct_mm_strategy")}</span
                    >
                    {#if strategies.length <= 3}
                        <div class="flex flex-col gap-1.5">
                            {#each strategies as strategy}
                                <button
                                    class="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors border
                    {startStrategyDefinitionId === strategy.id
                                        ? 'bg-primary/5 text-primary font-semibold border-primary/20'
                                        : 'text-base-content bg-slate-100 hover:bg-base-300 border-transparent'}"
                                    on:click={() =>
                                        (startStrategyDefinitionId =
                                            strategy.id)}
                                >
                                    <span>{strategy.name}</span>
                                    {#if startStrategyDefinitionId === strategy.id}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke-width="2.5"
                                            stroke="currentColor"
                                            class="w-4 h-4 text-primary"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="m4.5 12.75 6 6 9-13.5"
                                            />
                                        </svg>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <select
                            class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                            bind:value={startStrategyDefinitionId}
                        >
                            <option value="" disabled selected hidden
                                >{$_("admin_direct_mm_select_strategy")}</option
                            >
                            {#each strategies as strategy}
                                <option value={strategy.id}
                                    >{strategy.name}</option
                                >
                            {/each}
                        </select>
                    {/if}
                </div>

                {#if startStrategyDefinitionId}
                    <!-- Order Parameters -->
                    <div>
                        <div class="flex items-center gap-1.5 mb-1">
                            <span
                                class="text-xs font-semibold text-base-content/60 tracking-wider"
                                >{$_("admin_direct_mm_order_parameters")}</span
                            >
                            <div
                                class="tooltip tooltip-right"
                                data-tip={$_(
                                    "admin_direct_mm_order_parameters_hint",
                                )}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-3.5 h-3.5 text-base-content/40"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                                    />
                                </svg>
                            </div>
                        </div>
                        <div class="bg-base-200/40 rounded-xl p-4">
                            <div class="flex-1">
                                <span
                                    class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                    >{$_(
                                        isBestCapacityStrategy
                                            ? "admin_direct_mm_max_order_amount"
                                            : "admin_direct_mm_order_amount",
                                    )}{baseCoin ? ` (${baseCoin})` : ""}</span
                                >
                                <div class="relative">
                                    <input
                                        type="text"
                                        inputmode="decimal"
                                        placeholder={orderAmountPlaceholder}
                                        class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300
                      {orderAmountError ? 'border-error' : ''}"
                                        class:pr-16={baseCoin}
                                        bind:value={orderAmount}
                                    />
                                    {#if baseCoin}
                                        <span
                                            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                            >{baseCoin}</span
                                        >
                                    {/if}
                                </div>
                                {#if orderAmountError}
                                    <span class="text-xs text-error mt-1 block"
                                        >{$_(
                                            "admin_direct_mm_invalid_number",
                                        )}</span
                                    >
                                {:else if orderAmountBelowMinimum}
                                    <span class="text-xs text-error mt-1 block"
                                        >{$_(
                                            "admin_direct_mm_order_amount_minimum_hint",
                                            {
                                                values: {
                                                    amount: renderedMinOrderAmount,
                                                },
                                            },
                                        )}</span
                                    >
                                {:else}
                                    <span
                                        class="text-xs text-base-content/40 mt-1 block"
                                        >{renderedMinOrderAmount
                                            ? $_(
                                                  isBestCapacityStrategy
                                                      ? "admin_direct_mm_max_order_amount_hint_with_min"
                                                      : "admin_direct_mm_order_amount_hint_with_min",
                                                  {
                                                      values: {
                                                          amount: renderedMinOrderAmount,
                                                      },
                                                  },
                                              )
                                            : $_(
                                                  isBestCapacityStrategy
                                                      ? "admin_direct_mm_max_order_amount_hint"
                                                      : "admin_direct_mm_order_amount_hint",
                                              )}</span
                                    >
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Spread -->
                    {#if !isBestCapacityStrategy}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_direct_mm_spread_optional")}</span
                        >
                        <div class="relative">
                            <input
                                type="text"
                                inputmode="decimal"
                                placeholder="e.g. 0.5"
                                class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300
                  {spreadError ? 'border-error' : ''}"
                                class:pr-10={true}
                                bind:value={orderSpread}
                            />
                            <span
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                >%</span
                            >
                        </div>
                        {#if spreadError}
                            <span class="text-xs text-error mt-1 block"
                                >{$_("admin_direct_mm_invalid_number")}</span
                            >
                        {:else}
                            <span
                                class="text-xs text-base-content/40 mt-1 block"
                                >{$_("admin_direct_mm_spread_hint")}</span
                            >
                        {/if}
                    </div>
                    {/if}

                    {#if isDualAccountStrategy}
                        <!-- Volume Parameters -->
                        <div>
                            <div class="flex items-center gap-1.5 mb-1">
                                <span
                                    class="text-xs font-semibold text-base-content/60 tracking-wider"
                                    >{$_(
                                        "admin_direct_mm_volume_parameters",
                                    )}</span
                                >
                                <div
                                    class="tooltip tooltip-right"
                                    data-tip={$_(
                                        "admin_direct_mm_volume_parameters_hint",
                                    )}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                        stroke="currentColor"
                                        class="w-3.5 h-3.5 text-base-content/40"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div
                                class="bg-base-200/40 rounded-xl p-4 flex flex-col gap-4"
                            >
                                <!-- Interval Time -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            isBestCapacityStrategy
                                                ? "admin_direct_mm_interval_optional"
                                                : "admin_direct_mm_interval_time",
                                        )}</span
                                    >
                                    <div class="relative">
                                        <input
                                            type="text"
                                            inputmode="decimal"
                                            placeholder="e.g. 30"
                                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 pr-8
                              {intervalTimeError ? 'border-error' : ''}"
                                            bind:value={intervalTime}
                                        />
                                        <span
                                            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                            >s</span
                                        >
                                    </div>
                                    {#if intervalTimeError}
                                        <span
                                            class="text-xs text-error mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_invalid_number",
                                            )}</span
                                        >
                                    {:else}
                                        <span
                                            class="text-xs text-base-content/40 mt-1 block"
                                            >{$_(
                                                isBestCapacityStrategy
                                                    ? "admin_direct_mm_interval_optional_hint"
                                                    : "admin_direct_mm_interval_time_hint",
                                            )}</span
                                        >
                                    {/if}
                                </div>

                                {#if isBestCapacityStrategy}
                                <!-- Daily Volume Target -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            "admin_direct_mm_daily_volume_target_config",
                                        )}</span
                                    >
                                    <input
                                        type="text"
                                        inputmode="decimal"
                                        placeholder="e.g. 50000"
                                        class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300
                              {targetQuoteVolumeError ? 'border-error' : ''}"
                                        bind:value={targetQuoteVolume}
                                    />
                                    {#if targetQuoteVolumeError}
                                        <span
                                            class="text-xs text-error mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_invalid_number",
                                            )}</span
                                        >
                                    {:else}
                                        <span
                                            class="text-xs text-base-content/40 mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_daily_volume_target_config_hint",
                                            )}</span
                                        >
                                    {/if}
                                </div>

                                <!-- Maker Delay -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            "admin_direct_mm_maker_delay_optional",
                                        )}</span
                                    >
                                    <div class="relative">
                                        <input
                                            type="text"
                                            inputmode="decimal"
                                            placeholder="e.g. 500"
                                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 pr-10
                              {makerDelayMsError ? 'border-error' : ''}"
                                            bind:value={makerDelayMs}
                                        />
                                        <span
                                            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                            >ms</span
                                        >
                                    </div>
                                    {#if makerDelayMsError}
                                        <span
                                            class="text-xs text-error mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_invalid_number",
                                            )}</span
                                        >
                                    {:else}
                                        <span
                                            class="text-xs text-base-content/40 mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_maker_delay_optional_hint",
                                            )}</span
                                        >
                                    {/if}
                                </div>
                                {/if}

                                {#if !isBestCapacityStrategy}
                                <!-- Num Trades -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            "admin_direct_mm_num_trades",
                                        )}</span
                                    >
                                    <input
                                        type="text"
                                        inputmode="numeric"
                                        placeholder="e.g. 100"
                                        class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300
                          {numTradesError ? 'border-error' : ''}"
                                        bind:value={numTrades}
                                    />
                                    {#if numTradesError}
                                        <span
                                            class="text-xs text-error mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_invalid_number",
                                            )}</span
                                        >
                                    {:else}
                                        <span
                                            class="text-xs text-base-content/40 mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_num_trades_hint",
                                            )}</span
                                        >
                                    {/if}
                                </div>

                                <!-- Price Push Rate -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            "admin_direct_mm_price_push_rate",
                                        )}</span
                                    >
                                    <div class="relative">
                                        <input
                                            type="text"
                                            inputmode="decimal"
                                            placeholder="e.g. 0.1"
                                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 pr-10
                              {pricePushRateError ? 'border-error' : ''}"
                                            bind:value={pricePushRate}
                                        />
                                        <span
                                            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                            >%</span
                                        >
                                    </div>
                                    {#if pricePushRateError}
                                        <span
                                            class="text-xs text-error mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_invalid_number",
                                            )}</span
                                        >
                                    {:else}
                                        <span
                                            class="text-xs text-base-content/40 mt-1 block"
                                            >{$_(
                                                "admin_direct_mm_price_push_rate_hint",
                                            )}</span
                                        >
                                    {/if}
                                </div>

                                <!-- Post-Only Side -->
                                <div class="flex-1">
                                    <span
                                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                        >{$_(
                                            "admin_direct_mm_post_only_side",
                                        )}</span
                                    >
                                    <select
                                        class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                                        bind:value={postOnlySide}
                                    >
                                        <option value=""
                                            >{$_(
                                                "admin_direct_mm_post_only_side_hint",
                                            )}</option
                                        >
                                        <option value="buy"
                                            >{$_(
                                                "admin_direct_mm_post_only_side_buy",
                                            )}</option
                                        >
                                        <option value="sell"
                                            >{$_(
                                                "admin_direct_mm_post_only_side_sell",
                                            )}</option
                                        >
                                    </select>
                                </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Advanced Config (collapsible) -->
                        {#if !isBestCapacityStrategy}
                        <div>
                            <button
                                class="flex items-center gap-1.5 mb-1 cursor-pointer"
                                on:click={() => (showAdvanced = !showAdvanced)}
                            >
                                <span
                                    class="text-xs font-semibold text-base-content/60 tracking-wider"
                                    >{$_(
                                        "admin_direct_mm_advanced_config",
                                    )}</span
                                >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    class="w-3.5 h-3.5 text-base-content/40 transition-transform"
                                    class:rotate-180={showAdvanced}
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                                    />
                                </svg>
                            </button>
                            {#if showAdvanced}
                                <div
                                    class="bg-base-200/40 rounded-xl p-4 flex flex-col gap-4"
                                >
                                    <!-- Dynamic Role Switching -->
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <div>
                                            <span
                                                class="text-xs font-semibold text-base-content/50 tracking-wider block"
                                                >{$_(
                                                    "admin_direct_mm_dynamic_role_switching",
                                                )}</span
                                            >
                                            <span
                                                class="text-xs text-base-content/40 block mt-0.5"
                                                >{$_(
                                                    "admin_direct_mm_dynamic_role_switching_hint",
                                                )}</span
                                            >
                                        </div>
                                        <input
                                            type="checkbox"
                                            class="toggle toggle-primary toggle-sm"
                                            bind:checked={dynamicRoleSwitching}
                                        />
                                    </div>

                                    <!-- Target Quote Volume -->
                                    <div class="flex-1">
                                        <span
                                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                            >{$_(
                                                "admin_direct_mm_target_quote_volume",
                                            )}</span
                                        >
                                        <input
                                            type="text"
                                            inputmode="decimal"
                                            placeholder="e.g. 50000"
                                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300
                              {targetQuoteVolumeError ? 'border-error' : ''}"
                                            bind:value={targetQuoteVolume}
                                        />
                                        {#if targetQuoteVolumeError}
                                            <span
                                                class="text-xs text-error mt-1 block"
                                                >{$_(
                                                    "admin_direct_mm_invalid_number",
                                                )}</span
                                            >
                                        {:else}
                                            <span
                                                class="text-xs text-base-content/40 mt-1 block"
                                                >{$_(
                                                    "admin_direct_mm_target_quote_volume_hint",
                                                )}</span
                                            >
                                        {/if}
                                    </div>

                                    <!-- Maker Delay -->
                                    <div class="flex-1">
                                        <span
                                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                                            >{$_(
                                                "admin_direct_mm_maker_delay",
                                            )}</span
                                        >
                                        <div class="relative">
                                            <input
                                                type="text"
                                                inputmode="decimal"
                                                placeholder="e.g. 500"
                                                class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 pr-10
                                  {makerDelayMsError ? 'border-error' : ''}"
                                                bind:value={makerDelayMs}
                                            />
                                            <span
                                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-base-content/40"
                                                >ms</span
                                            >
                                        </div>
                                        {#if makerDelayMsError}
                                            <span
                                                class="text-xs text-error mt-1 block"
                                                >{$_(
                                                    "admin_direct_mm_invalid_number",
                                                )}</span
                                            >
                                        {:else}
                                            <span
                                                class="text-xs text-base-content/40 mt-1 block"
                                                >{$_(
                                                    "admin_direct_mm_maker_delay_hint",
                                                )}</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                        {/if}

                    {/if}
                {/if}

                <!-- Actions -->
                <div class="flex gap-3 justify-end mt-2">
                    {#if onDuplicateOrder && !prefillingFromOrderId}
                        <button
                            class="btn btn-ghost text-base-content font-semibold px-6"
                            on:click={onDuplicateOrder}
                            type="button"
                        >
                            {$_("admin_direct_mm_duplicate_order")}
                        </button>
                    {/if}
                    <button
                        class="btn btn-ghost text-base-content font-semibold px-6"
                        on:click={onClose}
                    >
                        {$_("admin_direct_mm_cancel")}
                    </button>
                    <button
                        class="btn btn-primary text-primary-content font-semibold px-6 gap-2"
                        on:click={onSubmit}
                        disabled={submitDisabled}
                    >
                        <span
                            >{isStarting
                                ? $_("admin_direct_mm_launching")
                                : $_("admin_direct_mm_launch_order")}</span
                        >
                        {#if !isStarting}
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
                                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                                />
                            </svg>
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
