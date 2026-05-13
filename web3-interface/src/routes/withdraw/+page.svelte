<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { balances } from '$lib/stores/balances';
  import { submitWithdraw } from '$lib/helpers/api/web3';
  import type { WithdrawStatus } from '$lib/types/withdraw';
  import { shortenAddress } from '$lib/helpers/utils';

  let selectedSymbol = $state('');
  let amount = $state('');
  let destination = $state('');
  let status: WithdrawStatus = $state('idle');
  let error = $state<string | null>(null);

  const availableTokens = $derived(
    $balances.filter((b) => Number(b.amount) > 0)
  );

  const selectedBalance = $derived(
    availableTokens.find((b) => b.symbol === selectedSymbol)
  );

  const handleWithdraw = async () => {
    if (!selectedSymbol || !amount || !destination) return;
    try {
      error = null;
      status = 'submitting';
      const result = await submitWithdraw({
        token: selectedSymbol,
        amount,
        to: destination,
      });
      status = 'pending';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Withdrawal failed';
      status = 'failed';
    }
  };

  const reset = () => {
    selectedSymbol = '';
    amount = '';
    destination = '';
    status = 'idle';
    error = null;
  };
</script>

<section class="space-y-4" data-testid="web3-withdraw">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      <span class="text-lg font-bold text-base-content capitalize">{$_('withdraw_title')}</span>
      <span class="text-base-content/70">{$_('withdraw_subtitle')}</span>
    </div>
  </div>

  {#if status === 'completed'}
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body gap-3 p-5 md:p-6 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-12 text-success mx-auto">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
        </svg>
        <span class="text-lg font-bold capitalize">{$_('withdraw_completed')}</span>
        <button class="btn btn-outline capitalize mt-4" onclick={reset}>{$_('home')}</button>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body gap-4 p-5 md:p-6">
        {#if status === 'pending'}
          <div class="text-center py-4">
            <span class="loading loading-spinner loading-lg"></span>
            <p class="mt-2 text-base-content/70 capitalize">{$_('withdraw_pending')}</p>
          </div>
        {:else}
          <div class="form-control">
            <label class="label" for="withdraw-token">
              <span class="label-text capitalize">{$_('withdraw_select_token')}</span>
            </label>
            <select id="withdraw-token" class="select select-bordered w-full" bind:value={selectedSymbol}>
              <option value="" disabled selected>{$_('withdraw_select_token')}</option>
              {#each availableTokens as token}
                <option value={token.symbol}>{token.symbol} ({token.amount})</option>
              {/each}
            </select>
          </div>

          <div class="form-control">
            <label class="label" for="withdraw-amount">
              <span class="label-text capitalize">{$_('withdraw_amount')}</span>
              {#if selectedBalance}
                <span class="label-text-alt text-base-content/50">
                  {$_('withdraw_balance', { values: { balance: selectedBalance.amount } })}
                </span>
              {/if}
            </label>
            <input
              id="withdraw-amount"
              type="number"
              class="input input-bordered w-full"
              placeholder="0.0"
              bind:value={amount}
              min="0"
              step="any"
            />
          </div>

          <div class="form-control">
            <label class="label" for="withdraw-destination">
              <span class="label-text capitalize">{$_('withdraw_to')}</span>
            </label>
            <input
              id="withdraw-destination"
              type="text"
              class="input input-bordered w-full"
              placeholder={$_('withdraw_to_placeholder')}
              bind:value={destination}
            />
          </div>

          {#if error}
            <div class="alert alert-error">
              <span class="text-sm">{error}</span>
            </div>
          {/if}

          <button
            class="btn btn-primary w-full capitalize"
            onclick={handleWithdraw}
            disabled={!selectedSymbol || !amount || !destination || status === 'submitting'}
          >
            {#if status === 'submitting'}
              <span class="loading loading-spinner loading-sm"></span>
              {$_('withdraw_submitting')}
            {:else}
              {$_('withdraw_submit')}
            {/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</section>