<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
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
    openNetworkModal,
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

<div class="max-w-2xl" data-testid="web3-withdraw">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content">Withdraw</span>
    <span class="mt-4 block text-base-content/60">
      Mocked withdrawal form with chain-specific context. Submission is disabled while disconnected or on an unsupported chain.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="withdraw-connect-gate">
      <span class="text-sm text-base-content/70">Connect a wallet before preparing a withdrawal.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="withdraw-unsupported-gate">
      <span>Wrong network selected. Withdrawal submission is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="withdraw-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="New withdrawal" eyebrow="Funding context" caption={`${$walletNamespaceLabel} · ${$walletNetwork ?? 'not connected'}`}>
    <div class="flex flex-col gap-6 border-t border-base-300 pt-6">
      <label class="flex flex-col gap-2">
        <span class="eyebrow">Asset</span>
        <select
          class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={selectedAsset}
          disabled={!$walletIsConnected}
          data-testid="withdraw-asset-select"
        >
          <option value="">Select asset</option>
          {#each $balances as balance}
            <option value={balance.asset}>
              {balance.chainNamespace === 'evm' ? 'EVM' : 'Solana / SVM'} · {balance.symbol} ({balance.amount} available)
            </option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Destination address</span>
        <input
          class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-sm focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={destination}
          oninput={() => { step = 'form'; }}
          placeholder={destinationExample}
          disabled={!$walletIsConnected}
          data-testid="withdraw-destination-input"
        />
        <span class="text-xs text-base-content/50">{destinationExample}</span>
        {#if validationErrors.destination}
          <span class="text-xs text-error" data-testid="withdraw-destination-error">{validationErrors.destination}</span>
        {/if}
      </label>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Amount</span>
        <input
          class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-2xl focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={amount}
          oninput={() => { step = 'form'; }}
          placeholder="0.00"
          disabled={!$walletIsConnected}
          data-testid="withdraw-amount-input"
        />
        <span class="text-xs text-base-content/50">
          Available: {selectedBalance?.amount ?? '0'} {selectedBalance?.symbol ?? 'asset'} · pending: {selectedBalance?.pendingAmount ?? '0'} · minimum: {minimumWithdrawFor(selectedBalance)} {selectedBalance?.symbol ?? ''}
        </span>
        {#if validationErrors.amount}
          <span class="text-xs text-error" data-testid="withdraw-amount-error">{validationErrors.amount}</span>
        {/if}
      </label>

      {#if $walletIsUnsupported}
        <span class="text-xs text-warning" data-testid="withdraw-inline-error">Select a supported EVM or Solana chain before submitting.</span>
      {:else if !$walletIsConnected}
        <span class="text-xs text-info" data-testid="withdraw-inline-error">Connection required before submission.</span>
      {/if}

      <button
        class="btn-pill-primary self-start disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!formIsValid}
        onclick={reviewWithdrawal}
        data-testid="withdraw-submit-button"
      >
        Review withdrawal
      </button>
    </div>
  </Section>

  {#if step === 'confirm' && selectedBalance}
    <Section title="Confirm withdrawal" eyebrow="Review">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-confirmation">
        <span class="block text-sm text-base-content/60">
          No signature, server withdrawal endpoint, RPC call, or on-chain transaction will be requested.
        </span>

        <div class="mt-6">
          <StatRow label="Asset" value={selectedBalance.symbol} />
          <StatRow label="Amount" value={amount} />
          <StatRow label="Chain" value={`${$walletNamespaceLabel} · ${$walletNetwork}`} />
          <StatRow label="Mock fee" value={`${withdrawFeeFor(selectedBalance)} ${selectedBalance.symbol}`} sublabel="reviewing" />
        </div>

        <code class="mt-6 block font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{destination}</code>

        <div class="mt-6 flex flex-wrap gap-2">
          <button class="btn-pill-outline" onclick={() => { step = 'form'; }} data-testid="withdraw-edit-button">Edit</button>
          <button class="btn-pill-primary" onclick={submitWithdrawal} data-testid="withdraw-confirm-button">Submit</button>
        </div>
      </div>
    </Section>
  {/if}

  {#if step === 'submitted' && withdrawResult}
    <Section title="Submitted" eyebrow="Mocked">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-submitted">
        <span class="block text-sm text-base-content/60">
          <span class="font-mono-num">{withdrawResult.id}</span> is {withdrawResult.status} for {withdrawResult.amount} {withdrawResult.symbol}.
        </span>
        <div class="mt-6" data-testid="withdraw-timeline">
          {#each withdrawResult.timeline as item}
            <div class="flex items-start gap-4 border-b border-base-300 py-4">
              <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {item.state === 'pending' ? 'bg-base-300' : 'bg-primary'}"></span>
              <div class="flex flex-col">
                <span class="font-medium text-base-content">{item.label}</span>
                <span class="text-xs text-base-content/55">{item.detail}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </Section>
  {/if}

  {#if $walletIsConnected && fundingActivity.length > 0}
    <Section title="Funding activity" eyebrow="After withdrawals">
      <div class="border-t border-base-300" data-testid="withdraw-activity-preview">
        {#each fundingActivity as entry}
          <StatRow
            label={entry.label}
            sublabel={entry.detail}
            value="→"
            href={entry.href}
            testid="withdraw-activity-link"
          />
        {/each}
      </div>
    </Section>
  {/if}
</div>
