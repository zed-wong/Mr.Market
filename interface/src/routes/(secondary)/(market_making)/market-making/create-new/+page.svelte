<script lang="ts">
  import emptyToken from "$lib/images/empty-token.svg";
  import ExchangeSelection from "$lib/components/market-making/create-new/ExchangeSelection.svelte";

  import TradingPairSearchInput from "$lib/components/grow/marketMaking/createNew/tradingPair/searchInput.svelte";
  import TradingPairList from "$lib/components/grow/marketMaking/createNew/tradingPair/pairList.svelte";
  import TradingPairFooter from "$lib/components/grow/marketMaking/createNew/tradingPair/footer.svelte";
  import { _ } from "svelte-i18n";

  import AmountText from "$lib/components/grow/marketMaking/createNew/amount/amountText.svelte";
  import AmountNextStepBtn from "$lib/components/grow/marketMaking/createNew/amount/amountNextStepBtn.svelte";
  import AmountInput from "$lib/components/grow/marketMaking/createNew/amount/amountInput.svelte";
  import ConfirmPaymentInfo from "$lib/components/grow/marketMaking/createNew/confirmation/confirmPaymentInfo.svelte";
  import ConfirmPaymentBtn from "$lib/components/grow/marketMaking/createNew/confirmation/confirmPaymentBtn.svelte";
  import AmountTypeTab from "$lib/components/grow/marketMaking/createNew/amount/amountTypeTab.svelte";
  import Loading from "$lib/components/common/loading.svelte";

  import { goto } from "$app/navigation";
  import { page as dPage } from "$app/stores";
  import BigNumber from "bignumber.js";
  import { findCoinIconBySymbol } from "$lib/helpers/helpers";
  import {
    createMixinInvoice,
    getPaymentUrl,
    type InvoiceItem,
  } from "$lib/helpers/mixin/mixin-invoice";
  import { botId } from "$lib/stores/home";
  import { get } from "svelte/store";
  import { user } from "$lib/stores/wallet";

  import type { GrowInfo } from "$lib/types/hufi/grow";
  import { getUuid } from "@mixin.dev/mixin-node-sdk";
  import {
    getMarketMakingFee,
    createMarketMakingOrderIntent,
    type MarketMakingFee,
  } from "$lib/helpers/mrm/grow";
  import { getMarketMakingPaymentState } from "$lib/helpers/mrm/strategy";
  import {
    ORDER_STATE_FETCH_INTERVAL,
    ORDER_STATE_TIMEOUT_DURATION,
  } from "$lib/helpers/constants";
  import ChooseExchange from "$lib/components/grow/marketMaking/createNew/exchange/chooseExchange.svelte";
  import ChooseTradingPair from "$lib/components/grow/marketMaking/createNew/tradingPair/chooseTradingPair.svelte";

  export let data;

  let growInfo: GrowInfo | null = null;
  $: data.growBasicInfo.then((res: GrowInfo) => (growInfo = res));

  $: allMarketMakingPairs =
    growInfo?.market_making?.pairs?.filter((p) => p.enable) || [];
  $: selectedPairInfo = allMarketMakingPairs.find(
    (p) =>
      exchangeName &&
      tradingPair &&
      p.exchange_id === exchangeName &&
      p.symbol === tradingPair,
  );

  const selectExchange = (exchangeName: string) => {
    const newUrl = new URL($dPage.url);
    newUrl.searchParams.set("exchange", exchangeName);
    newUrl.searchParams.delete("trading_pair");
    newUrl.searchParams.delete("base_amount");
    newUrl.searchParams.delete("quote_amount");
    const newPath = newUrl.pathname + newUrl.search;
    goto(newPath, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  };

  const selectTradingPair = (tradingPair: string) => {
    const newUrl = new URL($dPage.url);
    newUrl.searchParams.set("trading_pair", tradingPair);
    newUrl.searchParams.delete("base_amount");
    newUrl.searchParams.delete("quote_amount");
    const newPath = newUrl.pathname + newUrl.search;
    goto(newPath, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  };

  let isPaying = false;
  let paymentSuccess = false;

  const confirmPayment = async () => {
    if (
      !selectedPairInfo ||
      !baseAmountInput ||
      !quoteAmountInput ||
      !baseAmount ||
      !quoteAmount ||
      !feeInfo
    ) {
      return;
    }

    isPaying = true;

    // Use fee info from API
    const baseAssetId = selectedPairInfo.base_asset_id;
    const quoteAssetId = selectedPairInfo.quote_asset_id;
    const baseFeeId = feeInfo.base_fee_id;
    const quoteFeeId = feeInfo.quote_fee_id;
    const baseFeeAmount = feeInfo.base_fee_amount;
    const quoteFeeAmount = feeInfo.quote_fee_amount;
    const marketMakingFeePercentage = feeInfo.market_making_fee_percentage;

    // Calculate market making fees
    const baseMarketMakingFee = marketMakingFeePercentage
      ? BigNumber(baseAmount).multipliedBy(marketMakingFeePercentage).toString()
      : "0";
    const quoteMarketMakingFee = marketMakingFeePercentage
      ? BigNumber(quoteAmount)
          .multipliedBy(marketMakingFeePercentage)
          .toString()
      : "0";

    try {
      const currentUser = get(user);
      const intent = await createMarketMakingOrderIntent({
        marketMakingPairId: selectedPairInfo.id,
        userId: currentUser?.user_id,
      });
      if (!intent?.memo || !intent?.orderId) {
        console.error("Failed to create market making order intent");
        isPaying = false;
        return;
      }

      const memo = intent.memo;

      const itemsMap = new Map<string, BigNumber>();
      const itemMemo = new Map<string, string>();

      const addItem = (assetId: string | null, amount: string) => {
        if (!assetId || !amount || parseFloat(amount) <= 0) return;
        const existingAmount = itemsMap.get(assetId) || new BigNumber(0);
        itemsMap.set(assetId, existingAmount.plus(amount));
        if (!itemMemo.has(assetId)) {
          itemMemo.set(assetId, memo);
        }
      };

      // Base asset payment
      addItem(baseAssetId, baseAmount);

      // Quote asset payment
      addItem(quoteAssetId, quoteAmount);

      // Add base asset withdrawal fee if it exists
      if (baseFeeAmount && parseFloat(baseFeeAmount) > 0) {
        addItem(baseFeeId, baseFeeAmount);
      }

      // Add quote asset withdrawal fee if it exists
      if (quoteFeeAmount && parseFloat(quoteFeeAmount) > 0) {
        addItem(quoteFeeId, quoteFeeAmount);
      }

      // Add base market making fee if it exists
      if (baseMarketMakingFee && parseFloat(baseMarketMakingFee) > 0) {
        addItem(baseAssetId, baseMarketMakingFee);
      }

      // Add quote market making fee if it exists
      if (quoteMarketMakingFee && parseFloat(quoteMarketMakingFee) > 0) {
        addItem(quoteAssetId, quoteMarketMakingFee);
      }

      const items: InvoiceItem[] = Array.from(itemsMap.entries()).map(
        ([assetId, amount]) => ({
          assetId,
          amount: amount.toString(),
          extra: itemMemo.get(assetId) || memo,
          traceId: getUuid(),
        }),
      );

      const invoiceMin = createMixinInvoice($botId, items);
      if (invoiceMin) {
        const url = getPaymentUrl(invoiceMin);
        window.open(url);
      }

      // Poll payment state
      let totalTime = 0;
      const checkPayment = async () => {
        try {
          if (totalTime > ORDER_STATE_TIMEOUT_DURATION) {
            isPaying = false;
            return;
          }

          console.log(`Checking payment state for order ${intent.orderId}`);
          const res = await getMarketMakingPaymentState(intent.orderId);
          if (res?.data?.payment_complete) {
            paymentSuccess = true;
            setTimeout(() => {
              goto(`/market-making/orders/${intent.orderId}`);
            }, 2000);
            return;
          }

          totalTime += ORDER_STATE_FETCH_INTERVAL;
          setTimeout(checkPayment, ORDER_STATE_FETCH_INTERVAL);
        } catch (error) {
          console.error("Error polling payment state:", error);
          // Continue polling despite error? Or stop? usually continue for network glitches
          totalTime += ORDER_STATE_FETCH_INTERVAL;
          setTimeout(checkPayment, ORDER_STATE_FETCH_INTERVAL);
        }
      };

      setTimeout(checkPayment, ORDER_STATE_FETCH_INTERVAL);
    } catch (e) {
      console.error("Error in confirmPayment:", e);
      isPaying = false;
    }
  };

  $: exchangeName = $dPage.url.searchParams.get("exchange");
  $: tradingPair = $dPage.url.searchParams.get("trading_pair");
  $: baseAmount = $dPage.url.searchParams.get("base_amount");
  $: quoteAmount = $dPage.url.searchParams.get("quote_amount");
  $: baseSymbol = tradingPair ? tradingPair.split("/")[0] : null;
  $: quoteSymbol = tradingPair ? tradingPair.split("/")[1] : null;
  $: baseIcon = baseSymbol
    ? findCoinIconBySymbol(baseSymbol) || emptyToken
    : emptyToken;
  $: quoteIcon = quoteSymbol
    ? findCoinIconBySymbol(quoteSymbol) || emptyToken
    : emptyToken;

  let baseAmountInput = "";
  let quoteAmountInput = "";
  let lastTradingPair: string | null = null;
  let lastUrlBaseAmount: string | null = null;
  let lastUrlQuoteAmount: string | null = null;
  let amountMode: "both_token" | "single_token" = "both_token";
  let singleTokenType: "base" | "quote" = "base";
  let feeInfo: MarketMakingFee | null = null;
  let isFetchingFee = false;

  // Fetch fee info when trading pair is selected
  $: if (exchangeName && tradingPair) {
    isFetchingFee = true;
    getMarketMakingFee(exchangeName, tradingPair, "deposit_to_exchange")
      .then((fee) => {
        feeInfo = fee;
      })
      .catch((err) => {
        console.error("Failed to fetch fee info:", err);
        feeInfo = null;
      })
      .finally(() => {
        isFetchingFee = false;
      });
  } else {
    feeInfo = null;
  }

  $: showBase =
    amountMode === "both_token" ||
    (amountMode === "single_token" && singleTokenType === "base");
  $: showQuote =
    amountMode === "both_token" ||
    (amountMode === "single_token" && singleTokenType === "quote");

  $: isValidAmount =
    amountMode === "both_token"
      ? baseAmount && quoteAmount
      : amountMode === "single_token" && singleTokenType === "base"
        ? baseAmount
        : quoteAmount;

  $: if (tradingPair !== lastTradingPair) {
    baseAmountInput = "";
    quoteAmountInput = "";
    lastTradingPair = tradingPair;
  }

  $: if (baseAmount !== lastUrlBaseAmount) {
    baseAmountInput = baseAmount ?? "";
    lastUrlBaseAmount = baseAmount;
  }

  $: if (quoteAmount !== lastUrlQuoteAmount) {
    quoteAmountInput = quoteAmount ?? "";
    lastUrlQuoteAmount = quoteAmount;
  }

  let localSelectedExchange: string | null = null;
  let searchTradingPairQuery = "";
  let selectedLocalPair: string | null = null;

  const goBack = () => {
    const newUrl = new URL($dPage.url);
    newUrl.searchParams.delete("exchange");
    goto(newUrl.toString(), { replaceState: true });
  };

  const confirmSelection = () => {
    if (selectedLocalPair) {
      selectTradingPair(selectedLocalPair);
    }
  };
</script>

<!-- Step 1: Choose Exchange -->
{#await data.growBasicInfo}
  <div class="flex flex-col items-center justify-center grow h-[calc(90vh)]">
    <Loading />
  </div>
{:then growInfo}
  {@const allMarketMakingPairs =
    growInfo?.market_making?.pairs?.filter((p) => p.enable) || []}
  {@const supportedMarketMakingExchanges =
    growInfo?.market_making?.exchanges
      ?.filter((e) => e.enable)
      .map((e) => {
        return {
          exchange_id: e.exchange_id,
          name: e.name,
        };
      }) || []}
  {@const supportedTradingpairs = allMarketMakingPairs.filter(
    (p) => !exchangeName || p.exchange_id === exchangeName,
  )}
  {@const filteredTradingPairs = searchTradingPairQuery
    ? supportedTradingpairs.filter((p) =>
        p.symbol.toLowerCase().includes(searchTradingPairQuery.toLowerCase()),
      )
    : supportedTradingpairs}
  {@const selectedPairInfo = allMarketMakingPairs.find(
    (p) => p.exchange_id === exchangeName && p.symbol === tradingPair,
  )}
  {@const basePrice = selectedPairInfo?.base_price
    ? parseFloat(selectedPairInfo.base_price)
    : 0}
  {@const quotePrice = selectedPairInfo?.target_price
    ? parseFloat(selectedPairInfo.target_price)
    : 0}
  {@const baseAmountUsd = baseAmount
    ? BigNumber(basePrice).times(baseAmount).toNumber()
    : null}
  {@const quoteAmountUsd = quoteAmount
    ? BigNumber(quotePrice).times(quoteAmount).toNumber()
    : null}

  {#if !exchangeName}
    <div
      class="flex flex-col items-center space-y-4 grow w-full max-w-4xl mx-auto pt-[3vh]"
    >
      <div class="text-center">
        <ChooseExchange />
      </div>
      <div class="px-6 w-full">
        <ExchangeSelection
          exchanges={supportedMarketMakingExchanges}
          bind:selectedExchange={localSelectedExchange}
          onSelect={(id) => (localSelectedExchange = id)}
          onContinue={() =>
            localSelectedExchange && selectExchange(localSelectedExchange)}
        />
      </div>
    </div>

    <!-- Step 2: Choose Trading Pair -->
  {:else if !tradingPair}
    <div
      class="flex flex-col space-y-4 items-center w-full max-w-lg mx-auto grow pt-[3vh]"
    >
      <div class="text-center">
        <ChooseTradingPair {exchangeName} />
      </div>

      <div class="mt-6 w-full">
        <TradingPairSearchInput bind:value={searchTradingPairQuery} />
      </div>

      <TradingPairList
        pairs={filteredTradingPairs}
        {exchangeName}
        selectedPair={selectedLocalPair}
        onSelect={(symbol) => (selectedLocalPair = symbol)}
      />

      <TradingPairFooter
        onBack={goBack}
        onConfirm={confirmSelection}
        confirmDisabled={!selectedLocalPair}
      />
    </div>

    <!-- Step 3: Enter Amount -->
  {:else if !isValidAmount}
    <div
      class="flex flex-col items-center grow h-[calc(100vh-64px)] pt-[3vh] pb-8 space-y-6 w-full"
    >
      <div class="text-center w-full">
        <AmountText {exchangeName} {tradingPair} />
      </div>
      <AmountTypeTab
        bind:mode={amountMode}
        bind:tokenType={singleTokenType}
        {baseSymbol}
        {quoteSymbol}
        {baseIcon}
        {quoteIcon}
      />
      <div
        class="px-4 gap-6 grid grid-cols-1 bg-transparent w-full max-w-md overflow-y-auto hide-scrollbar"
      >
        <AmountInput
          {baseIcon}
          {quoteIcon}
          {baseSymbol}
          {quoteSymbol}
          {showBase}
          {showQuote}
          {basePrice}
          {quotePrice}
          bind:baseAmount={baseAmountInput}
          bind:quoteAmount={quoteAmountInput}
        />
      </div>

      <div class="mt-auto w-full flex justify-center px-4">
        <AmountNextStepBtn
          baseAmount={baseAmountInput}
          quoteAmount={quoteAmountInput}
          mode={amountMode}
          tokenType={singleTokenType}
        />
      </div>
    </div>

    <!-- Step 4: Confirm Payment -->
  {:else}
    <div
      class="flex flex-col items-center grow h-[100vh-64px] mt-6 px-4 space-y-4"
    >
      {#if paymentSuccess}
        <div
          class="flex flex-col items-center justify-center p-8 space-y-4 bg-white rounded-lg shadow-sm"
        >
          <div class="rounded-full bg-green-100 p-3">
            <svg
              class="w-8 h-8 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900">
            {$_("payment_successful")}
          </h3>
          <p class="text-gray-500">{$_("redirecting_to_order_details")}</p>
        </div>
      {:else}
        <ConfirmPaymentInfo
          {exchangeName}
          {tradingPair}
          {baseSymbol}
          {quoteSymbol}
          {baseIcon}
          {quoteIcon}
          {baseAmount}
          {quoteAmount}
          {baseAmountUsd}
          {quoteAmountUsd}
          baseFeeAmount={feeInfo?.base_fee_amount}
          baseFeeSymbol={feeInfo?.base_fee_symbol}
          quoteFeeAmount={feeInfo?.quote_fee_amount}
          quoteFeeSymbol={feeInfo?.quote_fee_symbol}
          baseFeeUsdPrice={feeInfo?.base_fee_price_usd}
          quoteFeeUsdPrice={feeInfo?.quote_fee_price_usd}
          baseAssetUsdPrice={feeInfo?.base_asset_price_usd}
          quoteAssetUsdPrice={feeInfo?.quote_asset_price_usd}
          marketMakingFeePercentage={feeInfo?.market_making_fee_percentage}
          {isFetchingFee}
        />
        <div class="px-6 w-full flex justify-center">
          <ConfirmPaymentBtn onConfirm={confirmPayment} loading={isPaying} />
        </div>
      {/if}
    </div>
  {/if}
{/await}
