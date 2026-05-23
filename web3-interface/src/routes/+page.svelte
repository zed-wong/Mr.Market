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

  let recentActivity = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? aggregateMockActivityEntries(
          marketMakingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionMarketMakingActivity),
          fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity),
          mockAccountActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null)
        ).slice(0, 5)
      : []
  );

  const quickActions = [
    { href: '/wallet', label: 'Wallet', hint: 'Deposit, withdraw, balances' },
    { href: '/market-making', label: 'Pools', hint: 'Discover and join campaigns' },
    { href: '/market', label: 'Markets', hint: 'Live pair overview' },
  ];
</script>

<div data-testid="web3-home">
  <section class="pt-2">
    <span class="eyebrow">Portfolio</span>
    <div class="mt-3 flex items-baseline gap-3">
      <span class="font-display text-5xl md:text-7xl tracking-tight text-base-content font-mono-num">${$totalBalanceUsd}</span>
    </div>
    <span class="mt-4 block max-w-xl text-base-content/60">
      {#if $walletIsConnected}
        {$walletNamespaceLabel} on {$walletNetwork} connected as <span class="font-mono-num">{$walletShortAddress}</span>.
      {:else if $walletIsUnsupported}
        Unsupported chain selected. Read-only surfaces remain available.
      {:else}
        Disconnected. Connect a wallet to unlock account-specific funding and campaign actions.
      {/if}
    </span>

    {#if !$walletIsConnected && !$walletIsUnsupported}
      <button class="btn-pill-primary mt-6" onclick={openMockWallet} data-testid="home-connect-prompt">
        Connect wallet
      </button>
    {/if}
  </section>

  <Section title="Quick actions" eyebrow="Jump in">
    <div class="grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-3" data-testid="home-quick-actions">
      {#each quickActions as action}
        <a
          href={action.href}
          class="group flex flex-col gap-1 bg-base-100 p-6 transition-colors hover:bg-base-200"
        >
          <span class="font-medium text-base-content">{action.label}</span>
          <span class="text-sm text-base-content/55">{action.hint}</span>
          <span class="mt-4 text-base-content/40 transition-colors group-hover:text-primary">→</span>
        </a>
      {/each}
    </div>
  </Section>

  <Section title="Balances" eyebrow="Mocked data" caption="Per-account holdings from local fixtures.">
    {#snippet actions()}
      <a href="/wallet" class="btn-pill-ghost">View all →</a>
    {/snippet}

    <div data-testid="home-balances">
      {#if $balances.length > 0}
        <div class="border-t border-base-300">
          {#each $balances as balance}
            <StatRow
              label={balance.symbol}
              sublabel={`Pending withdrawal: ${balance.pendingAmount ?? '0'} ${balance.symbol}`}
              value={balance.amount}
              subvalue={`$${balance.usdValue}`}
              badge={balance.chainNamespace === 'evm' ? 'EVM' : 'Solana'}
            />
          {/each}
        </div>
      {:else}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          {$walletIsUnsupported
            ? 'Balances are blocked for unsupported chains.'
            : 'No account-scoped balances are shown while disconnected.'}
        </div>
      {/if}
    </div>
  </Section>

  {#if recentActivity.length > 0}
    <Section title="Recent activity" eyebrow="Session">
      <div class="border-t border-base-300" data-testid="home-recent-activity">
        {#each recentActivity as entry}
          <StatRow
            label={entry.label}
            sublabel={entry.detail}
            value="→"
            href={entry.href}
            testid="home-activity-link"
          />
        {/each}
      </div>
    </Section>
  {/if}
</div>
