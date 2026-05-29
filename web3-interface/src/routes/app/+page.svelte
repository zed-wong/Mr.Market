<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { aggregateMockActivityEntries, mockAccountActivityForAccount } from '$lib/helpers/mock-web3';
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { marketMakingActivityForAccount, sessionMarketMakingActivity } from '$lib/stores/market-making';
  import {
    openMockWallet,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  type HomePageState = 'loaded' | 'loading' | 'empty' | 'error';

  let homePageState = $state<HomePageState>('loaded');
  let recentActivity = $derived(
    homePageState === 'loaded' && $walletIsConnected && !$walletIsUnsupported
      ? aggregateMockActivityEntries(
          marketMakingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionMarketMakingActivity),
          fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity),
          mockAccountActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null)
        ).slice(0, 5)
      : []
  );
  let displayedBalances = $derived(homePageState === 'loaded' ? $balances : []);
  let displayedTotalBalanceUsd = $derived(homePageState === 'loaded' ? $totalBalanceUsd : '0.00');

  const quickActions = [
    { href: '/app/wallet', label: 'Wallet', hint: 'Deposit, withdraw, balances' },
    { href: '/app/market-making', label: 'Pools', hint: 'Discover and join campaigns' },
    { href: '/app/market', label: 'Markets', hint: 'Live pair overview' },
  ];
</script>

<div class="anim-page-enter" data-testid="web3-home">
  <section class="card-surface p-6 md:p-8">
    <span class="eyebrow">Portfolio balance</span>
    <div class="mt-2 flex items-baseline gap-3">
      <span class="text-display text-base-content font-mono-num">${displayedTotalBalanceUsd}</span>
    </div>
    <span class="mt-3 block max-w-xl text-body-muted">
      {#if $walletIsConnected}
        {$walletNamespaceLabel} on {$walletNetwork} · <span class="font-mono-num">{$walletShortAddress}</span>
      {:else if $walletIsUnsupported}
        Unsupported chain selected. Read-only surfaces remain available.
      {:else}
        Connect a wallet to unlock funding and campaign actions.
      {/if}
    </span>

    {#if !$walletIsConnected && !$walletIsUnsupported}
      <button class="btn-pill-primary mt-5" onclick={openMockWallet} data-testid="home-connect-prompt">
        Connect wallet
      </button>
    {/if}
  </section>

  <section class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="home-state-controls">
    <span class="text-sm text-base-content/60">Preview loaded, loading, empty, and recovery states for the deterministic dashboard.</span>
    <label class="flex items-center gap-2 text-sm">
      <span class="eyebrow">State</span>
      <select class="bg-transparent border-b border-base-300 px-0 py-1 focus:outline-none focus:border-base-content" bind:value={homePageState} data-testid="home-state-select">
        <option value="loaded">Loaded dashboard</option>
        <option value="loading">Loading state</option>
        <option value="empty">Empty state</option>
        <option value="error">Error state</option>
      </select>
    </label>
  </section>

  <Section title="Quick actions" eyebrow="Jump in">
    <div class="grid gap-3 md:grid-cols-3" data-testid="home-quick-actions">
      {#each quickActions as action}
        <a
          href={action.href}
          class="group card-surface card-hover flex flex-col gap-1 p-5"
        >
          <span class="text-base font-semibold text-base-content">{action.label}</span>
          <span class="text-body-muted">{action.hint}</span>
          <span class="mt-4 inline-block text-base-content/40 transition-transform duration-220 ease-out group-hover:translate-x-1 group-hover:text-primary">→</span>
        </a>
      {/each}
    </div>
  </Section>

  <Section title="Balances" eyebrow="Account scoped" caption="Per-account holdings from local fixtures.">
    {#snippet actions()}
      <a href="/app/wallet" class="btn-pill-ghost">View all →</a>
    {/snippet}

    <div data-testid="home-balances">
      {#if homePageState === 'loading'}
        <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="home-loading-state">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Loading portfolio balances from deterministic session fixtures…</span>
        </div>
      {:else if homePageState === 'error'}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="home-error-state">
          <span class="block font-medium text-base-content">Dashboard preview unavailable</span>
          <span class="mt-1 block text-sm">Retry the local demo state; no backend balance request was made.</span>
          <button class="btn-pill-primary mt-4" onclick={() => { homePageState = 'loaded'; }}>Retry dashboard</button>
        </div>
      {:else if homePageState === 'empty'}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="home-empty-state">
          <span class="block font-medium text-base-content">No portfolio activity yet</span>
          <span class="mt-1 block text-sm">Start with a deposit or create a market-making order to populate this deterministic account.</span>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <a href="/app/deposit" class="btn-pill-primary">Simulate deposit</a>
            <a href="/app/market-making" class="btn-pill-outline">Explore campaigns</a>
          </div>
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
          {$walletIsUnsupported
            ? 'Balances are blocked for unsupported chains.'
            : 'No account-scoped balances are shown while disconnected.'}
        </div>
      {/if}
    </div>
  </Section>

  <Section title="Recent activity" eyebrow="Session">
    <div data-testid="home-recent-activity">
      {#if homePageState === 'loading'}
        <div class="card-surface flex items-center justify-center gap-3 px-5 py-10 text-center text-body-muted" data-testid="home-activity-loading-state">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Preparing the latest funding and order events…</span>
        </div>
      {:else if homePageState === 'error'}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="home-activity-error-state">
          Activity timeline is temporarily unavailable in this preview state.
        </div>
      {:else if homePageState === 'empty' || recentActivity.length === 0}
        <div class="card-surface px-5 py-10 text-center text-body-muted" data-testid="home-activity-empty-state">
          No recent activity yet. Funding and order lifecycle events will be timestamped here.
        </div>
      {:else}
        {#each recentActivity as entry}
          <StatRow
            label={entry.label}
            sublabel={entry.detail}
            value="→"
            href={entry.href}
            testid="home-activity-link"
          />
        {/each}
      {/if}
    </div>
  </Section>
</div>
