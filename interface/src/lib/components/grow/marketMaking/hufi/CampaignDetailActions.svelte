<script lang="ts">
    import { goto } from "$app/navigation";
    import { _ } from "svelte-i18n";
    import { onDestroy } from "svelte";
    import BigNumber from "bignumber.js";
    import type { ApiCampaign } from "$lib/helpers/mrm/campaignFormatter";
    import type { GrowInfo } from "$lib/types/hufi/grow";
    import {
        getMarketMakingFee,
        type MarketMakingFee,
    } from "$lib/helpers/mrm/grow";
    import {
        createMarketMakingPayment,
        createMarketMakingPaymentPoller,
    } from "$lib/helpers/mrm/marketMakingPayment";
    import { findCoinIconBySymbol } from "$lib/helpers/helpers";
    import emptyToken from "$lib/images/empty-token.svg";
    import AmountInput from "$lib/components/grow/marketMaking/createNew/amount/amountInput.svelte";
    import CampaignConfirmPayment from "$lib/components/grow/marketMaking/hufi/CampaignConfirmPayment.svelte";
    import ConfirmPaymentBtn from "$lib/components/grow/marketMaking/createNew/confirmation/confirmPaymentBtn.svelte";
    import PaymentSuccessDialog from "$lib/components/grow/marketMaking/createNew/confirmation/PaymentSuccessDialog.svelte";
    import { botId } from "$lib/stores/home";
    import { user } from "$lib/stores/wallet";
    import { page } from "$app/stores";
    import { get } from "svelte/store";

    export let campaign: ApiCampaign;

    let showDialog = false;
    let showConfirmStep = false;
    let growInfo: GrowInfo | null = null;
    let feeInfo: MarketMakingFee | null = null;
    let isFetchingFee = false;
    let baseAmountInput = "";
    let quoteAmountInput = "";
    let isPaying = false;
    let showSuccessDialog = false;
    let successOrderId = "";
    let isPageActive = true;
    let isLoadingGrowInfo = false;
    let feeRequestId = 0;
    let requestAddingUrl = "#";

    $: exchangeName = campaign?.exchange_name ?? null;
    $: tradingPair = campaign?.symbol ?? null;
    $: baseSymbol = tradingPair ? tradingPair.split("/")[0] : null;
    $: quoteSymbol = tradingPair ? tradingPair.split("/")[1] : null;
    $: baseIcon = baseSymbol
        ? findCoinIconBySymbol(baseSymbol) || emptyToken
        : emptyToken;
    $: quoteIcon = quoteSymbol
        ? findCoinIconBySymbol(quoteSymbol) || emptyToken
        : emptyToken;
    $: selectedPairInfo =
        growInfo?.market_making?.pairs?.find(
            (pair) =>
                pair.enable &&
                exchangeName &&
                tradingPair &&
                pair.exchange_id === exchangeName &&
                pair.symbol === tradingPair,
        ) || null;
    $: hasMarketMakingSupport = Boolean(
        exchangeName && tradingPair && selectedPairInfo,
    );
    $: supportStatusReady = Boolean(growInfo);
    $: basePrice = (() => {
        const rawPrice =
            selectedPairInfo?.base_price ?? feeInfo?.base_asset_price_usd;
        return rawPrice ? parseFloat(rawPrice) : 0;
    })();
    $: quotePrice = (() => {
        const rawPrice =
            selectedPairInfo?.target_price ?? feeInfo?.quote_asset_price_usd;
        return rawPrice ? parseFloat(rawPrice) : 0;
    })();
    $: baseAmountUsd = baseAmountInput
        ? BigNumber(basePrice).times(baseAmountInput).toNumber()
        : null;
    $: quoteAmountUsd = quoteAmountInput
        ? BigNumber(quotePrice).times(quoteAmountInput).toNumber()
        : null;
    $: hasValidAmounts = Boolean(
        baseAmountInput &&
        quoteAmountInput &&
        parseFloat(baseAmountInput) > 0 &&
        parseFloat(quoteAmountInput) > 0,
    );
    $: isContinueDisabled = !hasValidAmounts || !selectedPairInfo;

    const paymentPoller = createMarketMakingPaymentPoller({
        isActive: () => isPageActive,
        onSuccess: (orderId) => {
            showSuccessDialog = true;
            successOrderId = orderId;
            isPaying = false;
        },
        onTimeout: () => {
            if (isPageActive) {
                isPaying = false;
            }
        },
    });

    const resetPaymentState = () => {
        isPaying = false;
        showSuccessDialog = false;
        successOrderId = "";
    };

    $: if (showDialog && !growInfo && !isLoadingGrowInfo) {
        const growInfoPromise = $page.data?.growInfo;
        if (growInfoPromise && typeof growInfoPromise.then === "function") {
            isLoadingGrowInfo = true;
            growInfoPromise
                .then((res: GrowInfo) => {
                    growInfo = res;
                })
                .catch((err: unknown) => {
                    console.error("Failed to load grow info from layout:", err);
                })
                .finally(() => {
                    isLoadingGrowInfo = false;
                });
        }
    }

    $: if (showDialog && exchangeName && tradingPair) {
        const requestId = ++feeRequestId;
        isFetchingFee = true;
        getMarketMakingFee(exchangeName, tradingPair, "deposit_to_exchange")
            .then((fee) => {
                if (requestId === feeRequestId) {
                    feeInfo = fee;
                }
            })
            .catch((err) => {
                console.error("Failed to fetch fee info:", err);
                if (requestId === feeRequestId) {
                    feeInfo = null;
                }
            })
            .finally(() => {
                if (requestId === feeRequestId) {
                    isFetchingFee = false;
                }
            });
    } else {
        feeInfo = null;
        isFetchingFee = false;
    }

    $: if (!hasValidAmounts) {
        showConfirmStep = false;
    }

    $: if (!showDialog) {
        resetPaymentState();
        showConfirmStep = false;
        baseAmountInput = "";
        quoteAmountInput = "";
    }

    const confirmPayment = async () => {
        if (!selectedPairInfo || !feeInfo || !hasValidAmounts) {
            return;
        }

        showSuccessDialog = false;
        successOrderId = "";
        isPaying = true;

        try {
            const currentUser = get(user);
            const paymentResult = await createMarketMakingPayment({
                selectedPairInfo,
                feeInfo,
                baseAmount: baseAmountInput,
                quoteAmount: quoteAmountInput,
                botId: $botId,
                userId: currentUser?.user_id,
            });

            if (!paymentResult?.orderId) {
                isPaying = false;
                return;
            }

            if (paymentResult.paymentUrl) {
                window.open(paymentResult.paymentUrl);
            }

            if (isPageActive) {
                isPaying = true;
            }
            paymentPoller.start(paymentResult.orderId);
        } catch (e) {
            console.error("Error in confirmPayment:", e);
            isPaying = false;
        }
    };

    const continueToConfirm = () => {
        if (isContinueDisabled) {
            return;
        }
        showConfirmStep = true;
    };

    const requestAdding = () => {
        if (!requestAddingUrl) {
            return;
        }
        window.open(requestAddingUrl);
    };

    onDestroy(() => {
        isPageActive = false;
        paymentPoller.stopAll();
    });
</script>

<div
    class="fixed bottom-0 left-0 right-0 p-5 bg-base-100 border-t border-gray-100 flex gap-4 pb-8 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
>
    <button
        class="flex-1 btn bg-base-100 hover:bg-base-200 text-base-content border border-gray-200 rounded-full h-12 min-h-12 text-sm font-bold normal-case shadow-sm"
        on:click={() => goto("/market-making/hufi/join")}
    >
        {$_("hufi_campaign_join_direct")}
    </button>
    <button
        class="flex-[1.5] btn bg-base-content hover:bg-base-content/90 text-base-100 border-none rounded-full h-12 min-h-12 text-sm font-bold normal-case shadow-lg"
        data-testid="hufi-create-button"
        on:click={() => (showDialog = true)}
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
        {$_("hufi_campaign_create_mmaking")}
    </button>
</div>

<!-- Create Market-Making Dialog -->
<dialog
    id="hufi_create_dialog"
    class="modal modal-bottom sm:modal-middle"
    class:modal-open={showDialog}
>
    <div class="modal-box space-y-3 pt-0" data-testid="hufi-create-dialog">
        <div class="sticky top-0 bg-opacity-100 bg-base-100 z-10 pt-4">
            <div class="flex justify-between items-center">
                <span class="font-semibold"
                    >{$_("hufi_campaign_create_mmaking")}</span
                >
                <button
                    on:click={() => (showDialog = false)}
                    aria-label="Close dialog"
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
        </div>

        <div class="space-y-4">
            <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600">{$_("exchange")}</span>
                    <span class="text-sm font-semibold capitalize"
                        >{campaign.exchange_name}</span
                    >
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600"
                        >{$_("trading_pair")}</span
                    >
                    <span class="text-sm font-semibold">{campaign.symbol}</span>
                </div>
            </div>

            {#if supportStatusReady && !hasMarketMakingSupport}
                <div class="space-y-4">
                    <div
                        class="bg-amber-50 border border-amber-200 text-sm text-amber-700 rounded-lg p-4"
                    >
                        <span class="">
                            {$_("hufi_campaign_pair_not_supported", {
                                values: {
                                    exchange: campaign.exchange_name,
                                    pair: campaign.symbol,
                                },
                            })}
                        </span>
                    </div>
                    <div class="flex gap-3">
                        <button
                            class="btn btn-xl flex-1 rounded-full bg-base-100 border border-base-300"
                            on:click={requestAdding}
                        >
                            <span class="text-normal">
                                {$_("hufi_campaign_request_adding")}
                            </span>
                        </button>
                        <button
                            class="btn btn-xl flex-1 rounded-full bg-base-content hover:bg-base-content/90 focus:bg-base-content/90 no-animation"
                            on:click={() => goto("/market-making/hufi/join")}
                        >
                            <span
                                class="text-base-100 font-semibold capitalize"
                            >
                                {$_("hufi_campaign_join_direct")}
                            </span>
                        </button>
                    </div>
                </div>
            {:else if !showConfirmStep}
                <div class="space-y-4">
                    <div class="space-y-3">
                        <span class="text-sm font-semibold text-base-content">
                            {$_("amount")}
                        </span>
                        <AmountInput
                            {baseIcon}
                            {quoteIcon}
                            {baseSymbol}
                            {quoteSymbol}
                            {basePrice}
                            {quotePrice}
                            showBase={true}
                            showQuote={true}
                            bind:baseAmount={baseAmountInput}
                            bind:quoteAmount={quoteAmountInput}
                        />
                    </div>
                    <div
                        class="bg-blue-50 border border-blue-100 text-sm text-blue-700 rounded-lg p-3"
                    >
                        {$_("hufi_campaign_create_new_notice")}
                    </div>
                </div>
            {:else}
                <CampaignConfirmPayment
                    {baseSymbol}
                    {quoteSymbol}
                    {baseIcon}
                    {quoteIcon}
                    baseAmount={baseAmountInput}
                    quoteAmount={quoteAmountInput}
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
            {/if}

            {#if !supportStatusReady || hasMarketMakingSupport}
                <div class="flex gap-3 pt-2 pb-2 items-center">
                    {#if showConfirmStep}
                        <button
                            class="btn btn-ghost btn-xl rounded-full border border-base-300 px-4"
                            on:click={() => (showConfirmStep = false)}
                        >
                            {$_("back")}
                        </button>
                        <div class="flex-[1.5] flex justify-center">
                            <ConfirmPaymentBtn
                                onConfirm={confirmPayment}
                                loading={isPaying}
                                disabled={!hasValidAmounts ||
                                    !selectedPairInfo ||
                                    isFetchingFee ||
                                    !feeInfo}
                            />
                        </div>
                    {:else}
                        <button
                            class="btn btn-ghost btn-xl flex-1 rounded-full border border-base-300"
                            on:click={() => (showDialog = false)}
                        >
                            {$_("cancel")}
                        </button>
                        <button
                            class="btn btn-xl flex-1 rounded-full bg-base-content hover:bg-base-content/90 focus:bg-base-content/90 no-animation"
                            data-testid="hufi-create-continue"
                            class:btn-disabled={isContinueDisabled}
                            class:opacity-50={isContinueDisabled}
                            class:cursor-not-allowed={isContinueDisabled}
                            disabled={isContinueDisabled}
                            aria-disabled={isContinueDisabled}
                            on:click={continueToConfirm}
                        >
                            <span
                                class="text-base-100 font-semibold capitalize"
                            >
                                {$_("continue")}
                            </span>
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button on:click={() => (showDialog = false)}></button>
    </form>
</dialog>

<PaymentSuccessDialog
    isOpen={showSuccessDialog}
    on:confirm={() => {
        showDialog = false;
        goto(`/market-making/orders/${successOrderId}`);
    }}
/>
