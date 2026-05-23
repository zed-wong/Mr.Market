<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { openMockWallet, openNetworkModal, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespaceLabel, walletNetwork } from '$lib/stores/wallet';

  type WalletPageState = 'loaded' | 'loading' | 'empty' | 'error';

  let walletPageState = $state<WalletPageState>('loaded');
  let fundingActivity = $derived(
    walletPageState === 'loaded' && $walletIsConnected && !$walletIsUnsupported
      ? fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity)
      : []
  );
  let displayedBalances = $derived(walletPageState === 'loaded' ? $balances : []);
  let displayedTotalBalanceUsd = $derived(walletPageState === 'loaded' ? $totalBalanceUsd : '0.00');
</script>

<div class="anim-page-enter" data-testid="web3-wallet-funding">
  <section class="card-surface p-6 md:p-8">
    <span class="eyebrow">Wallet balance</span>
    <div class="mt-2 flex items-baseline gap-3">
      <span class="text-display text-base-content font-mono-num">${displayedTotalBalanceUsd}</span>
    </div>
    <span class="mt-3 block text-body-muted">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>

    <div class="mt-5 flex flex-wrap gap-2">
      <a href="/deposit" class="btn-pill-primary" data-testid="deposit-entry">Deposit</a>
      <a href="/withdraw" class="btn-pill-outline" data-testid="withdraw-entry">Withdraw</a>
    </div>
  </section>

  <section class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="wallet-state-controls">
    <span class="text-sm text-base-content/60">State preview uses deterministic local data and keeps funding actions recoverable.</span>
    <label class="flex items-center gap-2 text-sm">
      <span class="eyebrow">State</span>
      <select class="bg-transparent border-b border-base-300 px-0 py-1 focus:outline-none focus:border-base-content" bind:value={walletPageState} data-testid="wallet-state-select">
        <option value="loaded">Loaded balances</option>
        <option value="loading">Loading state</option>
        <option value="empty">Empty state</option>
        <option value="error">Error state</option>
      </select>
    </label>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-6 card-surface flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="wallet-disconnected-gate">
      <span class="text-body-muted">Connect a wallet to show account-specific balances and funding.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning/10 border border-warning/30 px-5 py-4 text-body-muted" data-testid="wallet-unsupported-gate">
      <span>Wrong network selected. Deposit and withdraw submission are blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="wallet-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="Assets" eyebrow="Account scoped">
    {#if walletPageState === 'loading'}
      <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="wallet-loading-state">
        <span class="loading loading-spinner loading-sm"></span>
        <span>Reconciling deterministic asset balances for this account…</span>
      </div>
    {:else if walletPageState === 'error'}
      <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-error-state">
        <span class="block font-medium text-base-content">Balance preview unavailable</span>
        <span class="mt-1 block text-sm">No backend request failed. Return to loaded balances to retry the local funding view.</span>
        <button class="btn-pill-primary mt-4" onclick={() => { walletPageState = 'loaded'; }}>Retry balances</button>
      </div>
    {:else if walletPageState === 'empty'}
      <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-empty-state">
        <span class="block font-medium text-base-content">No funded assets yet</span>
        <span class="mt-1 block text-sm">Simulate a deposit to create the first deterministic balance and funding activity row.</span>
        <a href="/deposit" class="btn-pill-primary mt-4 inline-flex">Simulate deposit</a>
      </div>
    {:else if displayedBalances.length > 0}
      {#each displayedBalances as balance}
        <StatRow
          label={balance.symbol}
          sublabel={`Pending withdrawal: ${balance.pendingAmount ?? '0'} ${balance.symbol}`}
          value={balance.amount}
          subvalue={`$${balance.usdValue}`}
          badge={balance.chainNamespace === 'evm' ? 'EVM' : 'Solana'}
        />
      {/each}
    {:else}
      <div class="card-surface px-5 py-10 text-center text-body-muted">
        No available balances for the current mocked session.
      </div>
    {/if}
  </Section>

  <Section title="Funding activity" eyebrow="Recent">
    <div data-testid="funding-activity">
      {#if walletPageState === 'loading'}
        <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-loading-state">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Preparing funding activity timeline…</span>
        </div>
      {:else if walletPageState === 'error'}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-error-state">
          Activity preview could not be prepared. Retry the loaded wallet state above.
        </div>
      {:else if walletPageState === 'empty'}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-empty-state">
          No funding activity yet. Deposits and withdrawals will appear here with deterministic timestamps.
        </div>
      {:else if fundingActivity.length > 0}
        {#each fundingActivity as entry}
          <StatRow label={entry.label} sublabel={entry.detail} value="→" />
        {/each}
      {:else if $walletIsUnsupported}
        <div class="card-surface px-5 py-10 text-center text-body-muted">
          Funding activity is hidden while the selected chain is unsupported.
        </div>
      {:else}
        <div class="card-surface px-5 py-10 text-center text-body-muted">
          Connect a wallet to view account-specific funding activity.
        </div>
      {/if}
    </div>
  </Section>
</div>
