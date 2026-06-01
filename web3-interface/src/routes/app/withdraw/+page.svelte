<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { getWithdrawStatus, submitWithdraw } from '$lib/helpers/api/web3';
  import { balances, fundingActivity, refreshBalances } from '$lib/stores/balances';
  import {
    openNetworkModal,
    openMockWallet,
    walletAddress,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
  } from '$lib/stores/wallet';
  import type { BalanceEntry } from '$lib/types/balances';
  import type { WithdrawResponse } from '$lib/types/withdraw';

  let selectedAsset = $state('');
  let amount = $state('');
  let step = $state<'form' | 'confirm' | 'submitted'>('form');
  let withdrawResult = $state<WithdrawResponse | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  let selectedBalance = $derived($balances.find((balance) => balance.asset === selectedAsset));
  let validationErrors = $derived(validateWithdrawal(selectedBalance, amount));
  let formIsValid = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && selectedBalance && Object.keys(validationErrors).length === 0 && !submitting)
  );

  function validateWithdrawal(balance: BalanceEntry | null | undefined, amountInput: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!balance) {
      errors.amount = 'Select an available asset before preparing a withdrawal.';
      return errors;
    }
    if (!balance.chainId || !balance.tokenAddress) {
      errors.asset = 'Selected asset is missing EVM token metadata.';
    }
    const trimmed = amountInput.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      errors.amount = 'Enter a numeric withdrawal amount.';
    } else if (parsed <= 0) {
      errors.amount = 'Withdrawal amount must be greater than zero.';
    } else if ((trimmed.split('.')[1]?.length ?? 0) > balance.decimals) {
      errors.amount = `${balance.symbol} supports up to ${balance.decimals} decimals.`;
    } else if (parsed > Number(balance.amount || 0)) {
      errors.amount = `Amount exceeds available balance of ${balance.amount} ${balance.symbol}.`;
    }
    return errors;
  }

  $effect(() => {
    const availableAssets = $balances.map((balance) => balance.asset);
    if (!availableAssets.includes(selectedAsset)) {
      selectedAsset = $balances[0]?.asset ?? '';
      step = 'form';
      withdrawResult = null;
    }
  });

  onMount(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void refreshBalances();
    }
  });

  onDestroy(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  const reviewWithdrawal = () => {
    if (!formIsValid) return;
    step = 'confirm';
  };

  const pollWithdrawal = (withdrawalId: string) => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        const status = await getWithdrawStatus(withdrawalId);
        withdrawResult = status;
        if (status.status === 'pending' || status.status === 'submitted') {
          pollWithdrawal(withdrawalId);
        } else {
          await refreshBalances();
        }
      } catch (error) {
        submitError = error instanceof Error ? error.message : 'Unable to refresh withdrawal status';
      }
    }, 2500);
  };

  const submitWithdrawal = async () => {
    if (!selectedBalance?.chainId || !selectedBalance.tokenAddress || !formIsValid) return;
    submitting = true;
    submitError = null;
    try {
      withdrawResult = await submitWithdraw({
        chainId: selectedBalance.chainId,
        tokenAddress: selectedBalance.tokenAddress,
        amount: amount.trim(),
        idempotencyKey: `withdraw:${selectedBalance.assetId}:${amount.trim()}:${Date.now()}`,
      });
      step = 'submitted';
      await refreshBalances();
      if (withdrawResult.status === 'pending' || withdrawResult.status === 'submitted') {
        pollWithdrawal(withdrawResult.withdrawalId);
      }
    } catch (error) {
      submitError = error instanceof Error ? error.message : 'Unable to submit withdrawal';
    } finally {
      submitting = false;
    }
  };
</script>

<div class="max-w-2xl" data-testid="web3-withdraw">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-4xl md:text-5xl tracking-tight text-base-content">Withdraw</span>
    <span class="mt-4 block text-base-content/60">
      Withdraw available ledger funds back to the authenticated wallet. Server submission is blocked when chain credentials are unavailable.
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

      <div class="flex flex-col gap-2">
        <span class="eyebrow">Recipient</span>
        <code class="font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{$walletAddress ?? 'Connect wallet'}</code>
        <span class="text-xs text-base-content/50">Withdrawals are sent to the authenticated wallet address.</span>
      </div>

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
          Available: {selectedBalance?.amount ?? '0'} {selectedBalance?.symbol ?? 'asset'} · token: {selectedBalance?.tokenAddress ?? '—'}
        </span>
        {#if validationErrors.asset}
          <span class="text-xs text-error" data-testid="withdraw-asset-error">{validationErrors.asset}</span>
        {/if}
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

      {#if submitError}
        <span class="text-xs text-error" data-testid="withdraw-submit-error">{submitError}</span>
      {/if}
    </div>
  </Section>

  {#if step === 'confirm' && selectedBalance}
    <Section title="Confirm withdrawal" eyebrow="Review">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-confirmation">
        <span class="block text-sm text-base-content/60">
          The backend will debit the wallet ledger idempotently, then submit an ERC-20 transfer if a signer is configured. Otherwise it will return blocked.
        </span>

        <div class="mt-6">
          <StatRow label="Asset" value={selectedBalance.symbol} />
          <StatRow label="Amount" value={amount} />
          <StatRow label="Chain" value={`${$walletNamespaceLabel} · ${$walletNetwork}`} />
          <StatRow label="Recipient" value={$walletAddress ?? '—'} />
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <button class="btn-pill-outline" onclick={() => { step = 'form'; }} data-testid="withdraw-edit-button">Edit</button>
          <button class="btn-pill-primary" onclick={submitWithdrawal} disabled={submitting} data-testid="withdraw-confirm-button">{submitting ? 'Submitting…' : 'Submit'}</button>
        </div>
      </div>
    </Section>
  {/if}

  {#if step === 'submitted' && withdrawResult}
    <Section title="Submitted" eyebrow="Mocked">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-submitted">
        <span class="block text-sm text-base-content/60">
          <span class="font-mono-num">{withdrawResult.withdrawalId}</span> is {withdrawResult.status} for {withdrawResult.withdrawal.amount} {selectedBalance?.symbol ?? 'token'}.
        </span>
        {#if withdrawResult.txHash}
          <code class="mt-4 block font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{withdrawResult.txHash}</code>
        {/if}
        {#if withdrawResult.failureReason}
          <span class="mt-4 block text-xs text-error">{withdrawResult.failureReason}</span>
        {/if}
        <div class="mt-6" data-testid="withdraw-timeline">
          {#each [
            { label: 'Requested', detail: 'Withdrawal request was accepted by the backend.', state: 'complete' },
            { label: 'Ledger debited', detail: withdrawResult.withdrawal.ledgerEntryId ? `Ledger entry ${withdrawResult.withdrawal.ledgerEntryId}` : 'Ledger debit not recorded yet.', state: withdrawResult.withdrawal.ledgerEntryId ? 'complete' : 'pending' },
            { label: 'Chain submission', detail: withdrawResult.txHash ?? withdrawResult.failureReason ?? 'Waiting for chain submission evidence.', state: withdrawResult.status === 'submitted' || withdrawResult.status === 'completed' ? 'complete' : withdrawResult.status === 'blocked' || withdrawResult.status === 'failed' ? 'current' : 'pending' },
          ] as item}
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

  {#if $walletIsConnected && $fundingActivity.length > 0}
    <Section title="Funding activity" eyebrow="After withdrawals">
      <div class="border-t border-base-300" data-testid="withdraw-activity-preview">
        {#each $fundingActivity as entry}
          <StatRow
            label={entry.direction}
            sublabel={`${entry.assetId} · ${entry.createdAt}`}
            value={entry.amount}
            testid="withdraw-activity-link"
          />
        {/each}
      </div>
    </Section>
  {/if}
</div>
