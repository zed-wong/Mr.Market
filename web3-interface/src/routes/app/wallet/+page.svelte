<script lang="ts">
  import { onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { balances, balancesError, balancesLoading, fundingActivity, inMarketMakingBalances, refreshBalances, totalBalanceUsd } from '$lib/stores/balances';
  import { openMockWallet, openNetworkModal, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespaceLabel, walletNetwork } from '$lib/stores/wallet';

  let displayedBalances = $derived($balances);
  let displayedTotalBalanceUsd = $derived($totalBalanceUsd);

  onMount(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void refreshBalances();
    }
  });

  $effect(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void refreshBalances();
    }
  });
</script>

<div class="anim-page-enter" data-testid="web3-wallet-funding">
  <section class="card-surface p-6 md:p-8">
    <span class="eyebrow">Wallet balance</span>
    <div class="mt-2 flex items-baseline gap-3">
      <span class="text-display text-base-content font-mono-num">${displayedTotalBalanceUsd}</span>
    </div>
    <span class="mt-3 block text-body-muted">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>

    <div class="mt-5 flex flex-wrap gap-2">
      <a href="/app/deposit" class="btn-pill-primary" data-testid="deposit-entry">Deposit</a>
      <a href="/app/withdraw" class="btn-pill-outline" data-testid="withdraw-entry">Withdraw</a>
    </div>
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
    {#if $balancesLoading}
      <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="wallet-loading-state">
        <span class="loading loading-spinner loading-sm"></span>
        <span>Loading ledger-derived wallet balances…</span>
      </div>
    {:else if $balancesError}
      <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-error-state">
        <span class="block font-medium text-base-content">Balances unavailable</span>
        <span class="mt-1 block text-sm">{$balancesError}</span>
        <button class="btn-pill-primary mt-4" onclick={() => void refreshBalances()}>Retry balances</button>
      </div>
    {:else if displayedBalances.length === 0 && $walletIsConnected && !$walletIsUnsupported}
      <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-empty-state">
        <span class="block font-medium text-base-content">No funded assets yet</span>
        <span class="mt-1 block text-sm">Verify an on-chain deposit to create the first ledger balance.</span>
        <a href="/app/deposit" class="btn-pill-primary mt-4 inline-flex">Verify deposit</a>
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
        Connect a wallet to view ledger-derived balances.
      </div>
    {/if}
  </Section>

  <Section title="In market-making" eyebrow="Order scoped">
    {#if $inMarketMakingBalances.length > 0}
      {#each $inMarketMakingBalances as balance}
        <StatRow
          label={balance.assetId}
          sublabel={`${balance.orderCount} order${balance.orderCount === 1 ? '' : 's'} · locked ${balance.locked}`}
          value={balance.available}
          subvalue={`total ${balance.total}`}
          badge="order scoped"
        />
      {/each}
    {:else}
      <div class="card-surface px-5 py-10 text-center text-body-muted">
        No order-scoped market-making balances are locked for this account.
      </div>
    {/if}
  </Section>

  <Section title="Funding activity" eyebrow="Recent">
    <div data-testid="funding-activity">
      {#if $balancesLoading}
        <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-loading-state">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Loading server funding activity…</span>
        </div>
      {:else if $balancesError}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-error-state">
          Activity could not be loaded. Retry balances above.
        </div>
      {:else if $fundingActivity.length === 0 && $walletIsConnected && !$walletIsUnsupported}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="wallet-activity-empty-state">
          No funding activity yet. Deposits and withdrawals will appear here after ledger entries are recorded.
        </div>
      {:else if $fundingActivity.length > 0}
        {#each $fundingActivity as entry}
          <StatRow label={entry.direction} sublabel={`${entry.assetId} · ${entry.scope} · ${entry.createdAt}`} value={entry.amount} />
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
