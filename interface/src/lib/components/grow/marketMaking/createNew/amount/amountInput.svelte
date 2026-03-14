<script lang="ts">
    import { _ } from "svelte-i18n";
    import { formatDecimals, formatUSMoney } from "$lib/helpers/utils";
    import {
        formatBalanceForDisplay,
        getBalanceAutofillAmount,
    } from "$lib/helpers/mrm/marketMakingBalance";
    import { mixinAuthWrapper } from "$lib/helpers/mixin/mixin";
    import { mixinConnectLoading } from "$lib/stores/home";
    import AssetIcon from "$lib/components/common/assetIcon.svelte";

    export let baseIcon: string;
    export let baseSymbol: string | null = null;
    export let quoteIcon: string;
    export let quoteSymbol: string | null = null;
    export let baseChainIcon: string;
    export let quoteChainIcon: string;
    export let basePrice = 1;
    export let quotePrice = 1;
    export let baseBalance = "0";
    export let quoteBalance = "0";
    export let baseAmount = "";
    export let quoteAmount = "";
    export let isConnected = false;
    export let showBase = true;
    export let showQuote = true;

    const getFiatValue = (amount: string, price: number) => {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount)) return formatUSMoney(0);
        const fiatValue = formatDecimals(numericAmount * price, 3);
        return formatUSMoney(fiatValue);
    };
</script>

<div class="flex flex-col space-y-6">
    {#if showBase}
        <div class="flex flex-col w-full">
            <div
                class="flex items-center w-full border border-base-300 rounded-4xl px-4 py-4 bg-base-100"
            >
                <AssetIcon
                    chainIcon={baseChainIcon}
                    assetIcon={baseIcon}
                    clazz="w-10 h-10"
                    claxx="w-4 h-4"
                    imageClass="rounded-full"
                />
                <div class="mr-4" />
                <input
                    type="text"
                    inputmode="decimal"
                    required
                    bind:value={baseAmount}
                    data-testid="amount-input-0"
                    placeholder={$_("enter_symbol_amount", {
                        values: { symbol: baseSymbol ?? "" },
                    })}
                    class="input input-ghost w-full focus:outline-none focus:bg-transparent text-lg p-0 h-auto font-medium placeholder:text-base-content/30"
                />
            </div>
            <div class="flex justify-between items-center px-4 mt-2">
                <span class="text-xs font-bold text-base-content/50">
                    {getFiatValue(baseAmount, basePrice)}
                </span>
                {#if isConnected}
                    <button
                        type="button"
                        class="text-xs font-bold text-base-content/50 hover:text-base-content transition-colors"
                        data-testid="amount-balance-0"
                        on:click={() =>
                            (baseAmount =
                                getBalanceAutofillAmount(baseBalance))}
                    >
                        <span class="text-xs">
                            {$_("balance_of", {
                                values: {
                                    amount: formatBalanceForDisplay(
                                        baseBalance,
                                    ),
                                },
                            })}
                        </span>
                    </button>
                {:else}
                    <div data-testid="amount-balance-connect-0">
                        <button
                            type="button"
                            class="text-[10px] font-bold text-base-content/50 hover:text-base-content transition-colors disabled:opacity-50"
                            on:click={() => mixinAuthWrapper(false)}
                            disabled={$mixinConnectLoading}
                        >
                            {#if $mixinConnectLoading}
                                <span class="loading loading-xs" />
                            {:else}
                                <span class="text-xs">
                                    {$_("connect_wallet")}
                                </span>
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if showQuote}
        <div class="flex flex-col w-full">
            <div
                class="flex items-center w-full border border-base-300 rounded-4xl px-4 py-4 bg-base-100"
            >
                <AssetIcon
                    chainIcon={quoteChainIcon}
                    assetIcon={quoteIcon}
                    clazz="w-10 h-10"
                    claxx="w-4 h-4"
                    imageClass="rounded-full"
                />
                <div class="mr-4" />
                <input
                    type="text"
                    inputmode="decimal"
                    required
                    bind:value={quoteAmount}
                    data-testid="amount-input-1"
                    placeholder={$_("enter_symbol_amount", {
                        values: { symbol: quoteSymbol ?? "" },
                    })}
                    class="input input-ghost w-full focus:outline-none focus:bg-transparent text-lg p-0 h-auto font-medium placeholder:text-base-content/30"
                />
            </div>
            <div class="flex justify-between items-center px-4 mt-2">
                <span class="text-xs font-bold text-base-content/50">
                    {getFiatValue(quoteAmount, quotePrice)}
                </span>
                {#if isConnected}
                    <button
                        type="button"
                        class="text-xs font-bold text-base-content/50 hover:text-base-content transition-colors"
                        data-testid="amount-balance-1"
                        on:click={() =>
                            (quoteAmount =
                                getBalanceAutofillAmount(quoteBalance))}
                    >
                        <span class="text-xs">
                            {$_("balance_of", {
                                values: {
                                    amount: formatBalanceForDisplay(
                                        quoteBalance,
                                    ),
                                },
                            })}
                        </span>
                    </button>
                {:else}
                    <div data-testid="amount-balance-connect-1">
                        <button
                            type="button"
                            class="text-[10px] font-bold text-base-content/50 hover:text-base-content transition-colors disabled:opacity-50"
                            on:click={() => mixinAuthWrapper(false)}
                            disabled={$mixinConnectLoading}
                        >
                            {#if $mixinConnectLoading}
                                <span class="loading loading-xs" />
                            {:else}
                                <span class="text-xs">
                                    {$_("connect_wallet")}
                                </span>
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
