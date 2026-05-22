<script lang="ts">
  import { balances } from '$lib/stores/balances';
  import {
    minimumWithdrawFor,
    sessionFundingActivity,
    submitMockWithdrawal,
    fundingActivityForAccount,
    validateMockWithdrawal,
    withdrawFeeFor,
    type MockFundingResult,
  } from '$lib/stores/funding';
  import {
    openMockWallet,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
  } from '$lib/stores/wallet';

  let selectedAsset = $state('');
  let amount = $state('');
  let destination = $state('');
  let step = $state<'form' | 'confirm' | 'submitted'>('form');
  let withdrawResult = $state<MockFundingResult | null>(null);

  let selectedBalance = $derived($balances.find((balance) => balance.asset === selectedAsset));
  let destinationExample = $derived(
    $walletNamespace === 'solana'
      ? 'Example: So11111111111111111111111111111111111111112'
      : 'Example: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
  );
  let validationErrors = $derived(
    validateMockWithdrawal({
      namespace: $walletNamespace,
      balance: selectedBalance,
      destination,
      amount,
    })
  );
  let formIsValid = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && selectedBalance && Object.keys(validationErrors).length === 0)
  );
  let fundingActivity = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? fundingActivityForAccount($walletAccount?.id, $walletNamespace, $sessionFundingActivity)
      : []
  );

  $effect(() => {
    const availableAssets = $balances.map((balance) => balance.asset);
    if (!availableAssets.includes(selectedAsset)) {
      selectedAsset = $balances[0]?.asset ?? '';
      step = 'form';
      withdrawResult = null;
    }
  });

  const reviewWithdrawal = () => {
    if (!formIsValid) return;
    step = 'confirm';
  };

  const submitWithdrawal = () => {
    if (!$walletAccount || !selectedBalance || !formIsValid) return;
    withdrawResult = submitMockWithdrawal($walletAccount.id, selectedBalance, amount, destination);
    step = 'submitted';
  };
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
        <select class="select select-bordered" bind:value={selectedAsset} disabled={!$walletIsConnected} data-testid="withdraw-asset-select">
          <option value="">Select asset</option>
          {#each $balances as balance}
            <option value={balance.asset}>
              {balance.chainNamespace === 'evm' ? 'EVM' : 'Solana / SVM'} · {balance.symbol} ({balance.amount} available)
            </option>
          {/each}
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Destination address</span>
        <input class="input input-bordered" bind:value={destination} oninput={() => { step = 'form'; }} placeholder={destinationExample} disabled={!$walletIsConnected} data-testid="withdraw-destination-input" />
        <span class="label-text-alt mt-1 text-base-content/60">{destinationExample}</span>
        {#if validationErrors.destination}
          <span class="label-text-alt mt-1 text-error" data-testid="withdraw-destination-error">{validationErrors.destination}</span>
        {/if}
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Amount</span>
        <input class="input input-bordered" bind:value={amount} oninput={() => { step = 'form'; }} placeholder="0.00" disabled={!$walletIsConnected} data-testid="withdraw-amount-input" />
        <span class="label-text-alt mt-1 text-base-content/60">
          Available: {selectedBalance?.amount ?? '0'} {selectedBalance?.symbol ?? 'asset'} · pending withdrawal:
          {selectedBalance?.pendingAmount ?? '0'} {selectedBalance?.symbol ?? 'asset'} · minimum:
          {minimumWithdrawFor(selectedBalance)} {selectedBalance?.symbol ?? 'asset'}
        </span>
        {#if validationErrors.amount}
          <span class="label-text-alt mt-1 text-error" data-testid="withdraw-amount-error">{validationErrors.amount}</span>
        {/if}
      </label>

      {#if $walletIsUnsupported}
        <span class="text-sm text-warning" data-testid="withdraw-inline-error">Select a supported EVM or Solana chain before submitting.</span>
      {:else if !$walletIsConnected}
        <span class="text-sm text-info" data-testid="withdraw-inline-error">Connection required before submission.</span>
      {/if}

      <button class="btn btn-primary" disabled={!formIsValid} onclick={reviewWithdrawal} data-testid="withdraw-submit-button">
        Review mocked withdrawal
      </button>
    </div>
  </div>

  {#if step === 'confirm' && selectedBalance}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="withdraw-confirmation">
      <div class="card-body gap-3">
        <span class="font-semibold">Confirm mocked withdrawal</span>
        <span class="text-base-content/70">
          Review before local mocked submission. No signature, server withdrawal endpoint, RPC call, or on-chain transaction will be requested.
        </span>
        <div class="grid gap-3 md:grid-cols-2">
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Asset<br /><strong>{selectedBalance.symbol}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Amount<br /><strong>{amount}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Chain<br /><strong>{$walletNamespaceLabel} · {$walletNetwork}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Mock fee/status<br /><strong>{withdrawFeeFor(selectedBalance)} {selectedBalance.symbol} · reviewing</strong></span>
        </div>
        <code class="rounded bg-base-200 px-3 py-2 text-sm break-all">{destination}</code>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline" onclick={() => { step = 'form'; }} data-testid="withdraw-edit-button">Edit</button>
          <button class="btn btn-primary" onclick={submitWithdrawal} data-testid="withdraw-confirm-button">Submit mocked withdrawal</button>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 'submitted' && withdrawResult}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="withdraw-submitted">
      <div class="card-body gap-3">
        <span class="font-semibold">Withdrawal submitted</span>
        <span class="text-base-content/70">
          {withdrawResult.id} is {withdrawResult.status} for {withdrawResult.amount} {withdrawResult.symbol}. Available balance now excludes the pending withdrawal.
        </span>
        <ul class="steps steps-vertical lg:steps-horizontal" data-testid="withdraw-timeline">
          {#each withdrawResult.timeline as item}
            <li class="step {item.state === 'pending' ? '' : 'step-primary'}">
              <span class="font-semibold">{item.label}</span>
              <span class="text-xs text-base-content/60">{item.detail}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  {#if $walletIsConnected}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="withdraw-activity-preview">
      <div class="card-body gap-3">
        <span class="font-semibold">Funding activity after withdrawals</span>
        {#each fundingActivity as entry}
          <a href={entry.href} class="rounded-box border border-base-300 bg-base-200 p-3 transition-colors hover:border-primary" data-testid="withdraw-activity-link">
            <span class="font-semibold">{entry.label}</span>
            <span class="block text-sm text-base-content/60">{entry.detail}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</section>
