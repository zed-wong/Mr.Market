<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { invalidate, goto } from "$app/navigation";
  import { getUuid } from "@mixin.dev/mixin-node-sdk";
  import type { SpotTradingPair } from "$lib/types/hufi/spot";
  import { addSpotTradingPair } from "$lib/helpers/mrm/admin/spotdata";
  import { getCcxtExchangeMarkets } from "$lib/helpers/mrm/admin/growdata";
  import AssetSelect from "../common/AssetSelect.svelte";
  import QuickAddTradingPair from "$lib/components/admin/settings/spotTrading/QuickAddTradingPair.svelte";

import { toast } from "svelte-sonner";

  export let configuredExchanges: {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  }[] = [];
  export let existingPairs: SpotTradingPair[] = [];

  let AddNewSymbol = "";
  let AddNewExchangeId = "";
  let AddNewCcxtId = "";
  let AddNewAmountSignificantFigures = "";
  let AddNewPriceSignificantFigures = "";
  let AddNewBuyDecimalDigits = "";
  let AddNewSellDecimalDigits = "";
  let AddNewMaxBuyAmount = "";
  let AddNewMaxSellAmount = "";
  let AddNewBaseAssetId = "";
  let AddNewQuoteAssetId = "";
  let AddNewCustomFeeRate = "";

  let addDialogEl: HTMLDialogElement | null = null;
  let isAdding = false;
  let isExchangeDropdownOpen = false;
  let isMarketDropdownOpen = false;
  let availableMarkets: any[] = [];
  let isLoadingMarkets = false;

  let addMode: "menu" | "quick" | "custom" = "menu";
  let quickResetToken = 0;

  const normalizeSymbol = (symbol: string) =>
    symbol.split(":")[0].trim().toUpperCase();
  $: existingPairKeys = new Set(
    existingPairs.map(
      (pair) => `${pair.exchange_id}:${normalizeSymbol(pair.symbol || "")}`,
    ),
  );

  const cleanUpStates = () => {
    isAdding = false;
    addMode = "menu";
    AddNewSymbol = "";
    AddNewExchangeId = "";
    AddNewCcxtId = "";
    AddNewAmountSignificantFigures = "";
    AddNewPriceSignificantFigures = "";
    AddNewBuyDecimalDigits = "";
    AddNewSellDecimalDigits = "";
    AddNewMaxBuyAmount = "";
    AddNewMaxSellAmount = "";
    AddNewBaseAssetId = "";
    AddNewQuoteAssetId = "";
    AddNewCustomFeeRate = "";
    availableMarkets = [];
    selectedBaseAsset = null;
    selectedQuoteAsset = null;
    availableMarkets = [];
    selectedBaseAsset = null;
    selectedQuoteAsset = null;
  };

  function closeDialog() {
    addDialogEl?.close();
  }

  function openDialog() {
    addMode = "menu";
    addDialogEl?.showModal();
  }

  function openQuickAdd() {
    addMode = "quick";
    quickResetToken += 1;
  }

  function openCustomAdd() {
    addMode = "custom";
  }

  async function AddSpotTradingPair(pair: SpotTradingPair) {
    const existingKey = `${pair.exchange_id}:${normalizeSymbol(pair.symbol || "")}`;
    if (existingPairKeys.has(existingKey)) {
      toast.error($_("pair_already_added"));
      return;
    }

    if (
      !pair.symbol ||
      !pair.exchange_id ||
      !pair.ccxt_id ||
      !pair.base_asset_id ||
      !pair.quote_asset_id
    ) {
      toast.error($_("fill_all_fields_msg"));
      return;
    }
    isAdding = true;
    const token = localStorage.getItem("admin-access-token");
    if (!token) {
      toast.error($_("auth_token_missing"));
      return;
    }

    toast.promise(
      addSpotTradingPair(pair, token)
        .then(async () => {
          await invalidate("admin:settings:spot-trading");
          cleanUpStates();
        })
        .catch((error) => {
          cleanUpStates();
          console.error(error);
          throw error;
        }),
      {
        loading: $_("adding_pair_msg"),
        success: $_("add_pair_success_msg"),
        error: (err) => {
          if (err instanceof Error) {
            return `${$_("add_pair_failed_msg")}: ${err.message}`;
          }
          return `${$_("add_pair_failed_msg")}: ${String(err)}`;
        },
      },
    );
  }

  async function fetchMarkets(exchangeId: string) {
    if (!exchangeId) return;
    isLoadingMarkets = true;
    availableMarkets = [];
    try {
      const token = localStorage.getItem("admin-access-token");
      if (token) {
        const markets = await getCcxtExchangeMarkets(exchangeId, token);
        if (Array.isArray(markets)) {
          availableMarkets = markets;
        }
      }
    } catch (e) {
      console.error("Failed to fetch markets", e);
    } finally {
      isLoadingMarkets = false;
    }
  }

  function handleMarketSelect(market: any) {
    AddNewSymbol = market.symbol;
    AddNewCcxtId = market.id;
    // AddNewBaseAssetId = market.baseId || market.base; // User requested to not fill this
    // AddNewQuoteAssetId = market.quoteId || market.quote; // User requested to not fill this

    // Auto-fill precision if available
    if (market.precision) {
      if (market.precision.amount) {
        AddNewAmountSignificantFigures = market.precision.amount.toString();
        AddNewSellDecimalDigits = market.precision.amount.toString();
      }
      if (market.precision.price) {
        AddNewPriceSignificantFigures = market.precision.price.toString();
        AddNewBuyDecimalDigits = market.precision.price.toString();
      }
    }

    // Auto-fill limits if available (limits might be nested differently depending on CCXT structure)
    // This is a best-effort mapping
    if (market.limits) {
      if (market.limits.amount && market.limits.amount.max)
        AddNewMaxBuyAmount = market.limits.amount.max.toString();
      // Assuming sell limit is same as buy limit for simplicity if not explicitly separate
      if (market.limits.amount && market.limits.amount.max)
        AddNewMaxSellAmount = market.limits.amount.max.toString();
    }

    isMarketDropdownOpen = false;
  }

  // Asset Search Logic
  let selectedBaseAsset: any = null;
  let selectedQuoteAsset: any = null;

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (isExchangeDropdownOpen && !target.closest(".exchange-dropdown")) {
      isExchangeDropdownOpen = false;
    }
    if (isMarketDropdownOpen && !target.closest(".market-dropdown")) {
      isMarketDropdownOpen = false;
    }
    if (isMarketDropdownOpen && !target.closest(".market-dropdown")) {
      isMarketDropdownOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<button
  type="button"
  class="btn btn-primary gap-2 shadow-lg hover:shadow-primary/20 transition-all"
  on:click={openDialog}
>
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
    {$_("add_pair")}
  </button>

<dialog
  bind:this={addDialogEl}
  class="modal modal-bottom sm:modal-middle backdrop-blur-sm"
  on:close={cleanUpStates}
>
  <div
    class="modal-box w-full sm:max-w-[36rem] rounded-t-3xl sm:rounded-box space-y-3 pt-0 px-0 max-h-[88vh] overflow-y-auto"
  >
    <div class="sticky top-0 bg-base-100 z-10">
      <div class="mx-auto mt-2 mb-2 h-1 w-10 rounded-full bg-base-content/20 sm:hidden"></div>
      <div class="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-base-200">
        <div class="flex items-center gap-2">
          {#if addMode !== "menu"}
            <button
              type="button"
              class="btn btn-sm btn-circle btn-ghost"
              on:click={() => (addMode = "menu")}
              aria-label="Back"
              title="Back"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-5 h-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
            </button>
          {/if}
          <h3 class="font-semibold text-base sm:text-lg">
            {#if addMode === "menu"}
              {$_("add_pair")}
            {:else if addMode === "quick"}
              {$_("quick_add_pair")}
            {:else}
              {$_("add_new_pair")}
            {/if}
          </h3>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost"
          on:click={closeDialog}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1"
            stroke="currentColor"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>
    </div>

    <div class="px-4 sm:px-6 pb-5">
    {#if addMode === "menu"}
      <div class="grid gap-2">
        <button type="button" class="btn btn-outline justify-start" on:click={openQuickAdd}>
          {$_("quick_add")}
        </button>
        <button type="button" class="btn btn-outline justify-start" on:click={openCustomAdd}>
          Custom add
        </button>
      </div>
    {:else}
      <div class="tabs tabs-boxed mb-4">
        <button
          type="button"
          class={clsx("tab", addMode === "quick" && "tab-active")}
          on:click={openQuickAdd}
        >
          {$_("quick_add")}
        </button>
        <button
          type="button"
          class={clsx("tab", addMode === "custom" && "tab-active")}
          on:click={openCustomAdd}
        >
          Custom add
        </button>
      </div>

      {#if addMode === "quick"}
        <QuickAddTradingPair
          embedded
          resetToken={quickResetToken}
          {configuredExchanges}
          existingPairs={existingPairs}
          on:refresh={async () => {
            await invalidate("admin:settings:spot-trading");
            closeDialog();
          }}
        />
      {:else}
        {#if configuredExchanges.length === 0}
          <div class="alert alert-warning">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              /></svg
            >
            <span>{$_("no_exchanges_configured_msg")}</span>
            <div>
              <a href="/manage/settings/exchanges" class="btn btn-sm"
                >{$_("go_to_exchanges")}</a
              >
            </div>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="form-control w-full col-span-2">
          <label class="label" for="exchange-id-input">
            <span class="label-text font-medium">{$_("exchange_id")}</span>
          </label>
          <div
            class="dropdown w-full exchange-dropdown"
            class:dropdown-open={isExchangeDropdownOpen}
          >
            <input
              id="exchange-id-input"
              type="text"
              class="input input-bordered w-full focus:input-primary transition-all"
              bind:value={AddNewExchangeId}
              on:focus={() => (isExchangeDropdownOpen = true)}
              on:input={() => (isExchangeDropdownOpen = true)}
              placeholder={$_("select_exchange_placeholder")}
            />
            {#if isExchangeDropdownOpen}
              <ul
                class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full max-h-60 overflow-y-auto block z-[50] mt-1 border border-base-200"
              >
                {#each configuredExchanges.filter((e) => e.exchange_id
                    .toLowerCase()
                    .includes(AddNewExchangeId.toLowerCase())) as exchange}
                  <li>
                    <button
                      type="button"
                      class="w-full text-left flex items-center gap-2"
                      on:click={() => {
                        AddNewExchangeId = exchange.exchange_id;
                        isExchangeDropdownOpen = false;
                        fetchMarkets(AddNewExchangeId);
                      }}
                    >
                      {#if exchange.icon_url}
                        <img
                          src={exchange.icon_url}
                          alt={exchange.name}
                          class="w-4 h-4 rounded-full"
                        />
                      {/if}
                      {exchange.name} ({exchange.exchange_id})
                    </button>
                  </li>
                {/each}
                <div class="divider my-1"></div>
                <li>
                  <button
                    type="button"
                    class="w-full text-left flex items-center gap-2 text-primary"
                    on:click={() => goto("/manage/settings/exchanges")}
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
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    {$_("add_new_exchange")}
                  </button>
                </li>
              </ul>
            {/if}
          </div>
        </div>

        <div class="form-control w-full col-span-2">
          <label class="label" for="symbol-input">
            <span class="label-text font-medium">{$_("symbol")}</span>
            <span class="label-text-alt text-base-content/60"
              >({$_("example_pair")})</span
            >
          </label>
          <div
            class="dropdown w-full market-dropdown"
            class:dropdown-open={isMarketDropdownOpen}
          >
            <input
              id="symbol-input"
              type="text"
              class="input input-bordered w-full focus:input-primary transition-all"
              bind:value={AddNewSymbol}
              on:focus={() => (isMarketDropdownOpen = true)}
              on:input={() => (isMarketDropdownOpen = true)}
              placeholder={$_("search_pair_placeholder")}
              disabled={!AddNewExchangeId}
            />
            {#if isMarketDropdownOpen && AddNewExchangeId}
              <ul
                class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full max-h-60 overflow-y-auto block z-[50] mt-1 border border-base-200"
              >
                {#if isLoadingMarkets}
                  <li class="disabled">
                    <span
                      ><span class="loading loading-spinner loading-xs"></span>
                      {$_("loading_markets")}</span
                    >
                  </li>
                {:else if availableMarkets.length === 0}
                  <li class="disabled">
                    <span>{$_("no_markets_found")}</span>
                  </li>
                {:else}
                {#each availableMarkets
                  .filter((m) => m.symbol
                      .toLowerCase()
                      .includes(AddNewSymbol.toLowerCase()))
                  .filter((m) => !existingPairKeys.has(
                    `${AddNewExchangeId}:${normalizeSymbol(m.symbol || "")}`,
                  ))
                  .slice(0, 50) as market}
                    <li>
                      <button
                        type="button"
                        class="w-full text-left"
                        on:click={() => handleMarketSelect(market)}
                      >
                        {market.symbol}
                      </button>
                    </li>
                  {/each}
                {/if}
              </ul>
            {/if}
          </div>
        </div>

        <div class="form-control w-full">
          <label class="label w-full" for="ccxt-id-input">
            <span class="label-text font-medium">{$_("ccxt_id")}</span>
          </label>
          <input
            id="ccxt-id-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewCcxtId}
          />
        </div>

        <div
          class="divider col-span-2 text-xs font-bold opacity-50 uppercase tracking-widest"
        >
          {$_("assets")}
        </div>

        <AssetSelect
          id="base-asset-id-input"
          label={$_("base_asset_id")}
          bind:value={AddNewBaseAssetId}
          bind:selectedAsset={selectedBaseAsset}
          placeholder={$_("search_or_enter_uuid")}
        />

        <AssetSelect
          id="quote-asset-id-input"
          label={$_("quote_asset_id")}
          bind:value={AddNewQuoteAssetId}
          bind:selectedAsset={selectedQuoteAsset}
          placeholder={$_("search_or_enter_uuid_or_symbol")}
        />

        <div
          class="divider col-span-2 text-xs font-bold opacity-50 uppercase tracking-widest"
        >
          {$_("precision")}
        </div>

        <div class="form-control w-full">
          <label class="label" for="amount-sig-figs-input">
            <span class="label-text font-medium">{$_("amount_sig_figs")}</span>
          </label>
          <input
            id="amount-sig-figs-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewAmountSignificantFigures}
          />
        </div>
        <div class="form-control w-full">
          <label class="label" for="price-sig-figs-input">
            <span class="label-text font-medium">{$_("price_sig_figs")}</span>
          </label>
          <input
            id="price-sig-figs-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewPriceSignificantFigures}
          />
        </div>
        <div class="form-control w-full">
          <label class="label" for="buy-decimals-input">
            <span class="label-text font-medium">{$_("buy_decimals")}</span>
          </label>
          <input
            id="buy-decimals-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewBuyDecimalDigits}
          />
        </div>
        <div class="form-control w-full">
          <label class="label" for="sell-decimals-input">
            <span class="label-text font-medium">{$_("sell_decimals")}</span>
          </label>
          <input
            id="sell-decimals-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewSellDecimalDigits}
          />
        </div>

        <div
          class="divider col-span-2 text-xs font-bold opacity-50 uppercase tracking-widest"
        >
          {$_("limits")}
        </div>

        <div class="form-control w-full">
          <label class="label" for="max-buy-amount-input">
            <span class="label-text font-medium">{$_("max_buy_amount")}</span>
          </label>
          <input
            id="max-buy-amount-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewMaxBuyAmount}
          />
        </div>
        <div class="form-control w-full">
          <label class="label" for="max-sell-amount-input">
            <span class="label-text font-medium">{$_("max_sell_amount")}</span>
          </label>
          <input
            id="max-sell-amount-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewMaxSellAmount}
          />
        </div>

        <div
          class="divider col-span-2 text-xs font-bold opacity-50 uppercase tracking-widest"
        >
          {$_("fees")}
        </div>

        <div class="form-control w-full col-span-2">
          <label class="label" for="custom-fee-rate-input">
            <span class="label-text font-medium">{$_("custom_fee_rate")}</span>
            <span class="label-text-alt text-base-content/60"
              >({$_("optional")})</span
            >
          </label>
          <input
            id="custom-fee-rate-input"
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            bind:value={AddNewCustomFeeRate}
            placeholder="0.001"
          />
        </div>

        <div class="col-span-2 mt-4">
          <button
            class="btn btn-primary w-full"
            on:click={async () => {
              await AddSpotTradingPair({
                symbol: AddNewSymbol,
                exchange_id: AddNewExchangeId,
                ccxt_id: AddNewCcxtId,
                amount_significant_figures: AddNewAmountSignificantFigures,
                price_significant_figures: AddNewPriceSignificantFigures,
                buy_decimal_digits: AddNewBuyDecimalDigits,
                sell_decimal_digits: AddNewSellDecimalDigits,
                max_buy_amount: AddNewMaxBuyAmount,
                max_sell_amount: AddNewMaxSellAmount,
                base_asset_id: AddNewBaseAssetId,
                quote_asset_id: AddNewQuoteAssetId,
                custom_fee_rate: AddNewCustomFeeRate || undefined,
                enable: true,
                id: getUuid(),
              });
            }}
          >
            <span
              class={clsx(isAdding && "loading loading-spinner loading-sm")}
            >
              {$_("add")}
            </span>
          </button>
        </div>
      </div>
        {/if}
      {/if}
    {/if}
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close">close</button>
  </form>
</dialog>
