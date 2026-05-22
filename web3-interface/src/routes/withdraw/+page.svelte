<script lang="ts">
  import { balances } from '$lib/stores/balances';
  import {
    openMockWallet,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
  } from '$lib/stores/wallet';

  let selectedSymbol = $state('');
  let amount = $state('');
  let destination = $state('');

  let selectedBalance = $derived($balances.find((balance) => balance.symbol === selectedSymbol));
  let destinationExample = $derived(
    $walletNamespace === 'solana'
      ? 'Example: So11111111111111111111111111111111111111112'
      : 'Example: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
  );
  let disabled = $derived(!$walletIsConnected || $walletIsUnsupported || !selectedSymbol || !amount || !destination);
</script>

<section class="space-y-4" data-testid="web3-withdraw">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold text-base-content">Withdraw</span>
      <span class="text-base-content/70">Mocked withdrawal form with chain-specific context and disabled submission when disconnected or unsupported.</span>
    </div>
  </div>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <div class="alert alert-info" data-testid="withdraw-connect-gate">
      <span>Connect a mocked Reown wallet before preparing a withdrawal.</span>
      <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
    </div>
  {:else if $walletIsUnsupported}
    <div class="alert alert-warning" data-testid="withdraw-unsupported-gate">
      <span>Unsupported chain selected. Withdrawal submission is blocked until EVM or Solana is selected.</span>
    </div>
  {/if}

  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4">
      <div class="rounded-box border border-base-300 bg-base-200 p-4">
        <span class="font-semibold">Funding context</span>
        <span class="mt-1 block text-sm text-base-content/70">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Asset</span>
        <select class="select select-bordered" bind:value={selectedSymbol} disabled={!$walletIsConnected} data-testid="withdraw-asset-select">
          <option value="">Select asset</option>
          {#each $balances as balance}
            <option value={balance.symbol}>{balance.symbol} ({balance.amount})</option>
          {/each}
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Destination address</span>
        <input class="input input-bordered" bind:value={destination} placeholder={destinationExample} disabled={!$walletIsConnected} data-testid="withdraw-destination-input" />
        <span class="label-text-alt mt-1 text-base-content/60">{destinationExample}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Amount</span>
        <input class="input input-bordered" bind:value={amount} placeholder="0.00" disabled={!$walletIsConnected} data-testid="withdraw-amount-input" />
        <span class="label-text-alt mt-1 text-base-content/60">Available: {selectedBalance?.amount ?? '0'} {selectedSymbol}</span>
      </label>

      {#if $walletIsUnsupported}
        <span class="text-sm text-warning" data-testid="withdraw-inline-error">Select a supported EVM or Solana chain before submitting.</span>
      {:else if !$walletIsConnected}
        <span class="text-sm text-info" data-testid="withdraw-inline-error">Connection required before submission.</span>
      {/if}

      <button class="btn btn-primary" disabled={disabled} data-testid="withdraw-submit-button">Review mocked withdrawal</button>
    </div>
  </div>
</section>
