<script lang="ts">
  import { onMount } from 'svelte';
  import BigNumber from 'bignumber.js';
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { getDepositInstructions, verifyDeposit } from '$lib/helpers/api/web3';
  import { fundingActivity, refreshBalances } from '$lib/stores/balances';
  import {
    openNetworkModal,
    openMockWallet,
    walletChainId,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';
  import type { DepositInstructions, DepositToken, DepositVerifyResponse } from '$lib/types/deposit';

  type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
  type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

  let copied = $state(false);
  let loadState = $state<LoadState>('idle');
  let submitState = $state<SubmitState>('idle');
  let instructions = $state<DepositInstructions | null>(null);
  let selectedTokenAddress = $state('');
  let depositAmount = $state('');
  let txHash = $state('');
  let errorMessage = $state<string | null>(null);
  let depositResult = $state<DepositVerifyResponse | null>(null);

  let selectedToken = $derived(
    instructions?.supportedTokens.find((token) => token.tokenAddress === selectedTokenAddress) ?? null
  );
  let amountError = $derived(validateAmount(depositAmount, selectedToken));
  let txHashError = $derived(validateTxHash(txHash));
  let submitDisabled = $derived(
    !$walletIsConnected || $walletIsUnsupported || !instructions || !selectedToken || Boolean(amountError || txHashError) || submitState === 'submitting'
  );

  function validateAmount(amountInput: string, token: DepositToken | null): string | null {
    if (!token) return 'Select a supported token.';
    const trimmed = amountInput.trim();
    const amount = new BigNumber(trimmed || '');
    if (!trimmed || !amount.isFinite()) return 'Enter a numeric deposit amount.';
    if (amount.isLessThanOrEqualTo(0)) return 'Deposit amount must be greater than zero.';
    if ((amount.decimalPlaces() ?? 0) > token.decimals) return `${token.symbol} supports up to ${token.decimals} decimals.`;
    return null;
  }

  function validateTxHash(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Transaction hash is required.';
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return 'Enter a 32-byte EVM transaction hash.';
    return null;
  }

  async function loadInstructions() {
    if (!$walletIsConnected || $walletIsUnsupported) return;
    const chainId = String($walletChainId ?? '');
    loadState = 'loading';
    errorMessage = null;
    try {
      instructions = await getDepositInstructions(chainId);
      selectedTokenAddress = instructions.supportedTokens[0]?.tokenAddress ?? '';
      loadState = 'loaded';
    } catch (error) {
      instructions = null;
      loadState = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unable to load deposit instructions';
    }
  }

  onMount(() => {
    void loadInstructions();
  });

  $effect(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void loadInstructions();
    }
  });

  const copyVaultAddress = () => {
    if (instructions?.receiverAddress) {
      navigator.clipboard.writeText(instructions.receiverAddress);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const submitDeposit = async () => {
    if (!instructions || !selectedToken || submitDisabled) return;
    submitState = 'submitting';
    errorMessage = null;
    try {
      depositResult = await verifyDeposit({
        chainId: instructions.chainId,
        tokenAddress: selectedToken.tokenAddress,
        amount: depositAmount.trim(),
        txHash: txHash.trim(),
      });
      submitState = 'success';
      await refreshBalances();
    } catch (error) {
      submitState = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unable to verify deposit';
    }
  };
</script>

<div data-testid="web3-deposit" class="max-w-2xl">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-4xl md:text-5xl tracking-tight text-base-content">Deposit</span>
    <span class="mt-4 block text-base-content/60">
      Fetch the server receiving address, send a supported ERC-20 on-chain, then verify the transaction hash to credit the ledger.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="deposit-connect-gate">
      <span class="text-sm text-base-content/70">Connect a wallet before generating deposit instructions.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="deposit-unsupported-gate">
      <span>Wrong network selected. Deposit continuation is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="deposit-switch-network">Switch network</button>
    </section>
  {/if}

  {#if $walletIsConnected}
    <Section title="New deposit" eyebrow="Account context" caption={`${$walletNamespaceLabel} · ${$walletNetwork} · ${$walletShortAddress}`}>
      <div class="flex flex-col gap-6 border-t border-base-300 pt-6">
        {#if loadState === 'loading'}
          <div class="card-surface flex items-center gap-3 px-5 py-4 text-body-muted">
            <span class="loading loading-spinner loading-sm"></span>
            <span>Loading deposit instructions…</span>
          </div>
        {:else if loadState === 'error'}
          <div class="card-surface px-5 py-4 text-body-muted" data-testid="deposit-load-error">
            <span>{errorMessage}</span>
            <button class="btn-pill-primary mt-4" onclick={() => void loadInstructions()}>Retry</button>
          </div>
        {/if}

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Token</span>
          <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={selectedTokenAddress} disabled={!instructions} data-testid="deposit-asset-select">
            {#each instructions?.supportedTokens ?? [] as token}
              <option value={token.tokenAddress}>
                EVM · {token.symbol} · {token.name}
              </option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Deposit amount</span>
          <input
            class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-2xl focus:outline-none focus:border-base-content"
            bind:value={depositAmount}
            data-testid="deposit-amount-input"
          />
          <span class="text-xs text-base-content/50">
            Decimals: {selectedToken?.decimals ?? '—'}.
          </span>
          {#if amountError}
            <span class="text-xs text-error" data-testid="deposit-amount-error">{amountError}</span>
          {/if}
        </label>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Transaction hash</span>
          <input
            class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-sm focus:outline-none focus:border-base-content"
            bind:value={txHash}
            placeholder="0x..."
            data-testid="deposit-tx-hash-input"
          />
          {#if txHashError}
            <span class="text-xs text-error" data-testid="deposit-tx-hash-error">{txHashError}</span>
          {/if}
        </label>

        <button
          class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed self-start"
          disabled={submitDisabled}
          onclick={submitDeposit}
          data-testid="simulate-deposit-button"
        >
          {submitState === 'submitting' ? 'Verifying…' : 'Verify deposit'}
        </button>

        {#if submitState === 'error' && errorMessage}
          <span class="text-xs text-error" data-testid="deposit-submit-error">{errorMessage}</span>
        {/if}

        {#if depositResult}
          <div class="rounded-2xl border border-base-300 px-4 py-3 text-sm text-base-content/70" data-testid="deposit-result-summary">
            <span class="font-mono-num">{depositResult.deposit.txHash}</span> {depositResult.deposit.status} {depositResult.deposit.amount} {selectedToken?.symbol ?? 'token'}.
          </div>
        {/if}
      </div>
    </Section>

    <Section title="Vault address" eyebrow="Where to send">
      <div class="flex flex-col gap-3 border-t border-base-300 pt-6" data-testid="deposit-instructions">
        <div class="flex items-center gap-2">
          <code class="font-mono-num flex-1 rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{instructions?.receiverAddress ?? 'Load instructions to show address'}</code>
          <button class="btn-pill-outline" onclick={copyVaultAddress}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span class="text-sm text-base-content/55">Send only supported tokens for chain {instructions?.chainId ?? '—'} to this address.</span>
      </div>
    </Section>

    <Section title="Timeline" eyebrow="Server verification">
      <div class="border-t border-base-300" data-testid="deposit-timeline">
        {#each [
          { label: 'Address loaded', detail: instructions ? 'Server receiving address and token metadata loaded.' : 'Load deposit instructions from the backend.', state: instructions ? 'complete' : 'current' },
          { label: 'Transaction submitted', detail: txHash ? 'Transaction hash entered for verification.' : 'Send the token on-chain and paste the transaction hash.', state: txHash ? 'complete' : 'pending' },
          { label: 'Ledger credited', detail: depositResult ? 'Deposit ledger entry recorded idempotently.' : 'Credit appears after backend chain verification succeeds.', state: depositResult ? 'complete' : 'pending' },
        ] as step}
          <div class="flex items-start gap-4 border-b border-base-300 py-4">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {step.state === 'pending' ? 'bg-base-300' : 'bg-primary'}"></span>
            <div class="flex flex-col">
              <span class="font-medium text-base-content">{step.label}</span>
              <span class="text-xs text-base-content/55">{step.detail}</span>
            </div>
          </div>
        {/each}
      </div>
    </Section>

    {#if $fundingActivity.length > 0}
      <Section title="Funding activity" eyebrow="Updated by deposits">
        <div class="border-t border-base-300" data-testid="deposit-activity-preview">
          {#each $fundingActivity as entry}
            <StatRow
              label={entry.direction}
              sublabel={`${entry.assetId} · ${entry.createdAt}`}
              value={entry.amount}
              testid="deposit-activity-link"
            />
          {/each}
        </div>
      </Section>
    {/if}
  {/if}
</div>
