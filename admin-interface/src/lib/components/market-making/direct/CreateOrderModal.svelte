<script lang="ts">
    import BigNumber from "bignumber.js";
    import { _ } from "svelte-i18n";
    import {
        getApiKeyReadiness,
        getApiKeyUseReadiness,
    } from "$lib/helpers/admin/api-key-readiness";
    import type { DirectApiKeyUseView } from "$lib/helpers/market-making/direct/api-key-filter";
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";
    import type {
        DirectReadinessResult,
        EfficientDualAccountVolumeMode,
    } from "$lib/types/hufi/admin-direct-market-making";
    import {
        getEfficientDualAccountModeOptions,
        getReadinessCapitalRows,
        isEfficientDualAccountControllerType,
        isBestCapacityDirectOrderControllerType,
        isDualAccountOrder,
        isSchemaDrivenDirectOrderControllerType,
        describeReadinessBlockingReason,
        describeReadinessMissingBalance,
        formatReadinessAmount,
        type DirectReadinessSubmitStatus,
        type StrategySchema,
    } from "$lib/helpers/market-making/direct/helpers";

    export let show = false;
    export let isStarting = false;
    export let exchangeOptions: string[] = [];
    export let filteredPairs: { symbol: string }[] = [];
    export let filteredApiKeys: AdminSingleKey[] = [];
    export let blockedApiKeyViews: DirectApiKeyUseView[] = [];
    export let strategies: MarketMakingStrategy[] = [];
    export let selectedControllerType = "";
    export let directExecutionMode:
        | "single_account"
        | "dual_account"
        | null
        | undefined;
    export let prefillingFromOrderId: string | null = null;
    export let selectedStrategySchema: StrategySchema = {};
    export let genericConfig: Record<string, unknown> = {};

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
    export let efficientMode: EfficientDualAccountVolumeMode = "balanced";
    export let readiness: DirectReadinessResult | null = null;
    export let readinessStatus: DirectReadinessSubmitStatus = "missing";
    export let readinessError = "";

    export let onSubmit: () => void;
    export let onClose: () => void;
    export let onDuplicateOrder: (() => void) | undefined = undefined;

    let pairSearch = "";
    let pairDropdownOpen = false;
    let pairInputEl: HTMLInputElement;
    let showAdvanced = false;
    const adaptivePmmHiddenFields = [
        "userId",
        "clientId",
        "marketMakingOrderId",
        "pair",
        "symbol",
        "exchangeName",
        "accountLabel",
        "apiKeyId",
        "bidSpread",
        "askSpread",
        "orderAmount",
        "orderRefreshTime",
        "numberOfLayers",
        "amountChangePerLayer",
        "amountChangeType",
        "ceilingPrice",
        "floorPrice",
        "oracleExchangeName",
    ];

    $: baseCoin = startPair ? startPair.split("/")[0] : "";
    $: isDualAccountStrategy = isDualAccountOrder({
        directExecutionMode,
        controllerType: selectedControllerType,
    });
    $: isBestCapacityStrategy = isBestCapacityDirectOrderControllerType(
        selectedControllerType,
    );
    $: isEfficientDualAccountStrategy =
        isEfficientDualAccountControllerType(selectedControllerType);
    $: isSchemaDrivenStrategy = isSchemaDrivenDirectOrderControllerType(
        selectedControllerType,
    );
    $: isPureMarketMakingStrategy =
        selectedControllerType === "pureMarketMaking";

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
    $: makerAccountOptions = filteredApiKeys;
    $: takerAccountOptions = filteredApiKeys.filter(
        (key) => String(key.key_id) !== String(startMakerApiKeyId),
    );
    $: selectedExchangeHasAnyApiKey =
        filteredApiKeys.length > 0 || blockedApiKeyViews.length > 0;
    $: missingApiKeyReadiness = getApiKeyReadiness(null);
    $: hasDistinctDualAccounts = makerAccountOptions.length >= 2;
    $: dualRequiredMissing =
        isDualAccountStrategy &&
        !isBestCapacityStrategy &&
        (!intervalTime || !numTrades || !pricePushRate);
    $: singleAccountSelectionMissing =
        !isDualAccountStrategy && !startApiKeyId;
    $: dualAccountSelectionMissing =
        isDualAccountStrategy && (!startMakerApiKeyId || !startTakerApiKeyId);
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
        singleAccountSelectionMissing ||
        orderAmountError ||
        orderAmountBelowMinimum ||
        dualRequiredMissing ||
        dualAccountSelectionMissing ||
        dualAccountUnavailable ||
        dualSameAccount ||
        (isEfficientDualAccountStrategy && readinessStatus !== "ready");
    $: efficientModeOptions = getEfficientDualAccountModeOptions();

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
        startApiKeyId = "";
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
    $: readinessBaseAsset =
        readiness?.bestFirstAction?.baseAsset ||
        readiness?.estimatedVolume?.baseAsset ||
        baseCoin;
    $: readinessCurrentBalanceRows = getReadinessCapitalRows(
        readiness?.currentBalancesByAccountAsset || [],
        "current",
    );
    $: readinessMinimumCapitalRows = getReadinessCapitalRows(
        readiness?.minimumCapitalByAccountAsset || [],
        "minimum",
    );
    $: readinessRecommendedCapitalRows = getReadinessCapitalRows(
        readiness?.recommendedCapitalByAccountAsset || [],
        "recommended",
    );
    $: readinessMaximumCapitalRows = getReadinessCapitalRows(
        readiness?.maximumUsefulCapitalByAccountAsset || [],
        "maximum",
    );
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

    function apiKeyOptionLabel(apiKey: AdminSingleKey): string {
        const view = getApiKeyUseReadiness(apiKey, "trade");
        const tradePermission = view.permissions.find(
            (permission) => permission.capability === "trade",
        );
        return `${apiKey.name} (${apiKey.key_id}) · ${view.label}${tradePermission ? ` · ${tradePermission.label}` : ""}`;
    }

    function readinessTitle(status: DirectReadinessSubmitStatus): string {
        if (status === "ready") return "Ready to start";
        if (status === "blocked") return "Cannot start yet";
        if (status === "loading") return "Checking readiness";
        if (status === "failed") return "Readiness check failed";
        if (status === "stale") return "Readiness is stale";
        return "Complete selections to check readiness";
    }

    function readinessDescription(status: DirectReadinessSubmitStatus): string {
        if (status === "ready") return "Planner readiness allows direct start for the selected accounts.";
        if (status === "blocked") return "Planner readiness found blockers. Review the account and asset details below.";
        if (status === "loading") return "Waiting for backend planner readiness before enabling start.";
        if (status === "failed") return readinessError || "Retry after fixing the readiness request.";
        if (status === "stale") return "Inputs changed; waiting for a fresh planner readiness result.";
        return "Select exchange, pair, two accounts, mode, and cycle limits.";
    }

    function readinessBadgeClass(status: DirectReadinessSubmitStatus): string {
        if (status === "ready") return "bg-success/10 text-success";
        if (status === "blocked" || status === "failed") return "bg-error/10 text-error";
        if (status === "loading" || status === "stale") return "bg-warning/10 text-warning";
        return "bg-base-300/50 text-base-content/60";
    }

    function readinessModeLabel(mode: EfficientDualAccountVolumeMode): string {
        return (
            efficientModeOptions.find((option) => option.value === mode)?.label ||
            mode
        );
    }

    function readinessEstimateBasisLabel(basis: string): string {
        if (basis === "current_available_balances") {
            return "based on current available balances";
        }

        return `based on ${basis}`;
    }

    import SchemaConfigForm from "$lib/components/admin/settings/strategies/SchemaConfigForm.svelte";
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
                <!-- Strategy -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_direct_mm_strategy")}</span
                    >
                    <select
                        class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                        bind:value={startStrategyDefinitionId}
                    >
                        <option value="" disabled selected hidden
                            >{$_("admin_direct_mm_select_strategy")}</option
                        >
                        {#each strategies as strategy}
                            <option value={strategy.id}>{strategy.name}</option>
                        {/each}
                    </select>
                </div>

                {#if isEfficientDualAccountStrategy}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-3"
                            >Efficient volume mode</span
                        >
                        <div class="grid grid-cols-1 gap-2">
                            {#each efficientModeOptions as option}
                                <label
                                    class="flex items-start gap-3 rounded-lg border border-base-300 bg-base-100 p-3 cursor-pointer hover:border-primary"
                                >
                                    <input
                                        type="radio"
                                        class="radio radio-primary radio-sm mt-0.5"
                                        bind:group={efficientMode}
                                        value={option.value}
                                    />
                                    <span class="min-w-0">
                                        <span class="block text-sm font-semibold text-base-content">
                                            {option.label}
                                        </span>
                                        <span class="block text-xs text-base-content/60 mt-1">
                                            {option.description}
                                        </span>
                                    </span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}

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
                                            {apiKeyOptionLabel(apiKey)}
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
                                            {apiKeyOptionLabel(apiKey)}
                                        </option>
                                    {/each}
                                </select>
                            {/if}
                        {:else}
                            <div
                                class="rounded-lg border border-dashed border-base-300 bg-base-100 p-3"
                            >
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <span class="block text-sm font-semibold text-base-content">
                                            {$_(
                                                "admin_direct_mm_no_executable_api_key",
                                            )}
                                        </span>
                                        <span class="block text-xs text-base-content/60 mt-1">
                                            {selectedExchangeHasAnyApiKey
                                                ? $_(
                                                      "admin_direct_mm_no_usable_api_key_hint",
                                                  )
                                                : $_(
                                                      "admin_direct_mm_missing_api_key_hint",
                                                  )}
                                        </span>
                                    </div>
                                    <span
                                        class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {selectedExchangeHasAnyApiKey
                                            ? 'bg-warning/10 text-warning'
                                            : missingApiKeyReadiness.tone}"
                                        title={selectedExchangeHasAnyApiKey
                                            ? $_(
                                                  "admin_direct_mm_no_usable_api_key_title",
                                              )
                                            : missingApiKeyReadiness.title}
                                    >
                                        {selectedExchangeHasAnyApiKey
                                            ? $_("admin_direct_mm_not_ready")
                                            : missingApiKeyReadiness.label}
                                    </span>
                                </div>
                                {#if !selectedExchangeHasAnyApiKey}
                                    <a
                                        href="/system/connectivity/api-keys"
                                        class="btn btn-ghost btn-xs mt-3 rounded-full capitalize"
                                    >
                                        {$_("admin_direct_mm_manage_api_keys")}
                                    </a>
                                {/if}
                            </div>
                        {/if}
                        {#if dualAccountUnavailable}
                            <span class="text-xs text-error mt-1 block"
                                >{$_(
                                    "admin_direct_mm_error_dual_accounts_required",
                                )}</span
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
                                            {apiKeyOptionLabel(apiKey)}
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
                                    >{$_(
                                        "admin_direct_mm_error_distinct_accounts",
                                    )}</span
                                >
                            {/if}
                        </div>
                    {/if}
                {/if}

                {#if isSchemaDrivenStrategy}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-3"
                            >{$_("admin_direct_mm_strategy_label")}</span
                        >
                        <SchemaConfigForm
                            schema={selectedStrategySchema}
                            bind:config={genericConfig}
                        />
                    </div>
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
                                    >{$_(
                                        "admin_direct_mm_invalid_number",
                                    )}</span
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
                                    on:click={() =>
                                        (showAdvanced = !showAdvanced)}
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
                                                bind:checked={
                                                    dynamicRoleSwitching
                                                }
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
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    {/if}

                    {#if isEfficientDualAccountStrategy}
                        <div class="bg-base-200/40 rounded-xl p-4" data-testid="efficient-readiness-panel">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <span class="text-xs font-semibold text-base-content/50 tracking-wider block">
                                        Planner readiness
                                    </span>
                                    <span class="text-sm font-semibold text-base-content block mt-1">
                                        {readinessTitle(readinessStatus)}
                                    </span>
                                    <span class="text-xs text-base-content/60 block mt-1">
                                        {readinessDescription(readinessStatus)}
                                    </span>
                                </div>
                                <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {readinessBadgeClass(readinessStatus)}">
                                    {readinessStatus.replace("_", " ")}
                                </span>
                            </div>

                            {#if readinessStatus === "loading"}
                                <div class="mt-3 flex items-center gap-2 text-xs text-base-content/60">
                                    <span class="loading loading-spinner loading-xs"></span>
                                    <span>Waiting for deterministic planner readiness</span>
                                </div>
                            {/if}

                            {#if readiness}
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Backend status</span>
                                        <span class="text-sm font-semibold text-base-content">
                                            {readiness.canStart ? "Can start" : "Cannot start"}
                                        </span>
                                    </div>
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Evaluated mode</span>
                                        <span class="text-sm font-semibold text-base-content">
                                            {readinessModeLabel(readiness.mode)}
                                        </span>
                                    </div>
                                </div>

                                {#if readiness.bestFirstAction}
                                    <div class="mt-3 rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] font-semibold text-base-content/50 block mb-1">
                                            Best first action
                                        </span>
                                        <span class="text-xs text-base-content block">
                                            Maker {readiness.bestFirstAction.makerAccountLabel}
                                            should {readiness.bestFirstAction.side}
                                            {formatReadinessAmount(readiness.bestFirstAction.quantity, readiness.bestFirstAction.baseAsset)}
                                            against taker {readiness.bestFirstAction.takerAccountLabel}
                                            at {formatReadinessAmount(readiness.bestFirstAction.price, readiness.bestFirstAction.quoteAsset)}
                                            ({formatReadinessAmount(readiness.bestFirstAction.notional, readiness.bestFirstAction.quoteAsset)} notional).
                                        </span>
                                    </div>
                                {/if}

                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Maximum cycle qty</span>
                                        <span class="text-sm font-semibold text-base-content">
                                            {formatReadinessAmount(readiness.maximumCycleQty, readinessBaseAsset)}
                                        </span>
                                    </div>
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Recommended cycle qty</span>
                                        <span class="text-sm font-semibold text-base-content">
                                            {formatReadinessAmount(readiness.recommendedCycleQty, readinessBaseAsset)}
                                        </span>
                                    </div>
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Estimated cycles</span>
                                        <span class="text-sm font-semibold text-base-content">
                                            {readiness.estimatedCycles.count}
                                        </span>
                                        <span class="text-[10px] text-base-content/50 block mt-1">
                                            {readinessEstimateBasisLabel(readiness.estimatedCycles.basis)}
                                        </span>
                                    </div>
                                    <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] text-base-content/50 block">Estimated volume</span>
                                        <span class="text-sm font-semibold text-base-content block">
                                            {formatReadinessAmount(readiness.estimatedVolume.quoteAmount, readiness.estimatedVolume.quoteAsset)}
                                        </span>
                                        <span class="text-[10px] text-base-content/50 block mt-1">
                                            {formatReadinessAmount(readiness.estimatedVolume.baseAmount, readiness.estimatedVolume.baseAsset)}
                                        </span>
                                    </div>
                                </div>

                                {#if readinessCurrentBalanceRows.length > 0}
                                    <div class="mt-3 rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] font-semibold text-base-content/50 block mb-2">
                                            Current balances
                                        </span>
                                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {#each readinessCurrentBalanceRows as row}
                                                <span class="rounded-md bg-base-200/60 px-2 py-1 text-[11px] text-base-content" data-testid={row.testId}>
                                                    {row.accountLabel}: {row.label}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                {#if readinessMinimumCapitalRows.length > 0 || readinessRecommendedCapitalRows.length > 0 || readinessMaximumCapitalRows.length > 0}
                                    <div class="mt-3 rounded-lg border border-base-300 bg-base-100 p-3">
                                        <span class="text-[10px] font-semibold text-base-content/50 block mb-2">
                                            Useful capital from backend
                                        </span>
                                        <div class="space-y-2">
                                            {#if readinessMinimumCapitalRows.length > 0}
                                                <div>
                                                    <span class="text-[10px] text-base-content/50 block">Minimum capital</span>
                                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                        {#each readinessMinimumCapitalRows as row}
                                                            <span class="rounded-md bg-base-200/60 px-2 py-1 text-[11px] text-base-content" data-testid={row.testId}>
                                                                {row.accountLabel}: {row.label}
                                                            </span>
                                                        {/each}
                                                    </div>
                                                </div>
                                            {/if}
                                            {#if readinessRecommendedCapitalRows.length > 0}
                                                <div>
                                                    <span class="text-[10px] text-base-content/50 block">Recommended capital</span>
                                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                        {#each readinessRecommendedCapitalRows as row}
                                                            <span class="rounded-md bg-base-200/60 px-2 py-1 text-[11px] text-base-content" data-testid={row.testId}>
                                                                {row.accountLabel}: {row.label}
                                                            </span>
                                                        {/each}
                                                    </div>
                                                </div>
                                            {/if}
                                            {#if readinessMaximumCapitalRows.length > 0}
                                                <div>
                                                    <span class="text-[10px] text-base-content/50 block">Maximum useful capital</span>
                                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                        {#each readinessMaximumCapitalRows as row}
                                                            <span class="rounded-md bg-base-200/60 px-2 py-1 text-[11px] text-base-content" data-testid={row.testId}>
                                                                {row.accountLabel}: {row.label}
                                                            </span>
                                                        {/each}
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {/if}

                                {#if readiness.missingBalances.length > 0}
                                    <div class="mt-3 space-y-2">
                                        {#each readiness.missingBalances as missing}
                                            <div class="rounded-lg border border-error/20 bg-error/10 p-3">
                                                <span class="text-xs font-semibold text-error block">
                                                    {missing.accountLabel} needs {formatReadinessAmount(missing.missingAmount, missing.asset)}
                                                </span>
                                                <span class="text-[11px] text-base-content/70 block mt-1">
                                                    {describeReadinessMissingBalance(missing)}
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}

                                {#if readiness.blockingReasons.length > 0 && readiness.missingBalances.length === 0}
                                    <div class="mt-3 space-y-2">
                                        {#each readiness.blockingReasons as reason}
                                            <div class="rounded-lg border border-error/20 bg-error/10 p-3">
                                                <span class="text-xs font-semibold text-error block">
                                                    {describeReadinessBlockingReason(reason)}
                                                </span>
                                                {#if reason.asset}
                                                    <span class="text-[11px] text-base-content/70 block mt-1">
                                                        Asset: {reason.asset}
                                                    </span>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/if}

                    {#if isPureMarketMakingStrategy}
                        <div>
                            <button
                                class="flex items-center gap-1.5 mb-1 cursor-pointer"
                                on:click={() => (showAdvanced = !showAdvanced)}
                                type="button"
                            >
                                <span
                                    class="text-xs font-semibold text-base-content/60 tracking-wider"
                                    >{$_("admin_direct_mm_advanced_config")}</span
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
                                <div class="bg-base-200/40 rounded-xl p-4">
                                    <SchemaConfigForm
                                        schema={selectedStrategySchema}
                                        bind:config={genericConfig}
                                        hiddenFields={adaptivePmmHiddenFields}
                                    />
                                </div>
                            {/if}
                        </div>
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
                        class="btn font-semibold px-6 gap-2 border-none {submitDisabled
                            ? 'bg-base-300 text-base-content/40 cursor-not-allowed hover:bg-base-300'
                            : 'bg-primary text-primary-content hover:bg-primary/90'}"
                        on:click={(e) => {
                            if (isStarting || submitDisabled) {
                                e.preventDefault();
                                return;
                            }
                            onSubmit();
                        }}
                        aria-disabled={submitDisabled}
                    >
                        {#if isStarting}
                            <span class="loading loading-spinner loading-xs"
                            ></span>
                        {/if}
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
