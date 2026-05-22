<script lang="ts">
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
    walletStatus,
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
</script>

<section class="space-y-6" data-testid="web3-home">
  <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4">
        <span class="text-sm text-base-content/60">Home portfolio</span>
        <span class="text-4xl font-bold text-base-content">${$totalBalanceUsd}</span>
        <span class="text-base-content/70">
          {$walletIsConnected
            ? `${$walletNamespaceLabel} on ${$walletNetwork} connected as ${$walletShortAddress}`
            : $walletIsUnsupported
              ? 'Unsupported chain selected. Read-only surfaces remain available.'
              : 'Disconnected. Connect a mocked Reown wallet to unlock account-specific funding and campaign actions.'}
        </span>
        {#if !$walletIsConnected && !$walletIsUnsupported}
          <button class="btn btn-primary w-fit" onclick={openMockWallet} data-testid="home-connect-prompt">
            Connect mocked Reown wallet
          </button>
        {/if}
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-3">
        <span class="font-semibold">Session control state</span>
        <div class="stats stats-vertical border border-base-300 bg-base-200">
          <div class="stat">
            <span class="stat-title">Wallet</span>
            <span class="stat-value text-base">{$walletStatus}</span>
          </div>
          <div class="stat">
            <span class="stat-title">Namespace</span>
            <span class="stat-value text-base">{$walletNamespaceLabel}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-3" data-testid="home-quick-actions">
    <a href="/wallet" class="card border border-base-300 bg-base-100 shadow-sm transition-colors hover:border-primary">
      <div class="card-body gap-2 p-4">
        <span class="font-semibold">Wallet / Funding</span>
        <span class="text-sm text-base-content/60">Open deposit and withdraw entry points.</span>
      </div>
    </a>
    <a href="/deposit" class="card border border-base-300 bg-base-100 shadow-sm transition-colors hover:border-primary">
      <div class="card-body gap-2 p-4">
        <span class="font-semibold">Deposit funds</span>
        <span class="text-sm text-base-content/60">Preview mocked EVM or Solana deposit instructions.</span>
      </div>
    </a>
    <a href="/market-making" class="card border border-base-300 bg-base-100 shadow-sm transition-colors hover:border-primary">
      <div class="card-body gap-2 p-4">
        <span class="font-semibold">Campaigns / Market Making</span>
        <span class="text-sm text-base-content/60">Browse mocked campaign discovery data.</span>
      </div>
    </a>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="home-balances">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between">
        <span class="font-semibold">Mocked balances</span>
        <span class="badge badge-outline">UI-only data</span>
      </div>

      {#if $balances.length > 0}
        <div class="grid gap-3 md:grid-cols-2">
          {#each $balances as balance}
            <div class="rounded-box border border-base-300 bg-base-200 p-4">
              <div class="flex items-center justify-between">
                <span class="font-semibold">{balance.symbol}</span>
                <span class="badge badge-ghost">{balance.chainNamespace === 'evm' ? 'EVM' : 'Solana'}</span>
              </div>
              <div class="mt-3 flex items-end justify-between">
                <span class="text-2xl font-bold">{balance.amount}</span>
                <span class="text-base-content/70">${balance.usdValue}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="rounded-box border border-base-300 bg-base-200 p-6 text-center text-base-content/70">
          <span>
            {$walletIsUnsupported
              ? 'Balances are blocked for unsupported chains.'
              : 'No account-scoped balances are shown while disconnected.'}
          </span>
        </div>
      {/if}
    </div>
  </div>

  {#if recentActivity.length > 0}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="home-recent-activity">
      <div class="card-body gap-3">
        <span class="font-semibold">Recent activity</span>
        <div class="grid gap-3 md:grid-cols-2">
          {#each recentActivity as entry}
            <a href={entry.href} class="rounded-box border border-base-300 bg-base-200 p-4 transition-colors hover:border-primary" data-testid="home-activity-link">
              <span class="font-semibold">{entry.label}</span>
              <span class="block text-sm text-base-content/60">{entry.detail}</span>
            </a>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>