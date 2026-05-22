<script lang="ts">
  import { aggregateMockActivityEntries, mockAccountActivityForAccount } from '$lib/helpers/mock-web3';
  import { balances } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { marketMakingActivityForAccount, sessionMarketMakingActivity } from '$lib/stores/market-making';
  import {
    openMockWallet,
    setWalletDisconnected,
    walletAccount,
    walletAddress,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
    walletStatus,
  } from '$lib/stores/wallet';

  let activityEntries = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? aggregateMockActivityEntries(
          marketMakingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionMarketMakingActivity),
          fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity),
          mockAccountActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null)
        )
      : []
  );
</script>

<section class="space-y-6" data-testid="web3-account">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold text-base-content">Account</span>
      <span class="text-base-content/70">Mocked wallet/session state, funding activity, and market-making settings only.</span>
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="account-session-summary">
      <div class="card-body gap-4">
        <div class="flex items-center justify-between">
          <span class="font-semibold">Session summary</span>
          <span class="badge {$walletIsUnsupported ? 'badge-warning' : $walletIsConnected ? 'badge-success' : 'badge-ghost'}">{$walletStatus}</span>
        </div>
        <div class="space-y-3">
          <div>
            <span class="text-sm text-base-content/60">Address</span>
            <span class="block font-mono text-sm">{$walletAddress ?? 'Disconnected'}</span>
          </div>
          <div>
            <span class="text-sm text-base-content/60">Short address</span>
            <span class="block">{$walletShortAddress || '—'}</span>
          </div>
          <div>
            <span class="text-sm text-base-content/60">Namespace / network</span>
            <span class="block">{$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'}</span>
          </div>
          <div>
            <span class="text-sm text-base-content/60">Account label</span>
            <span class="block">{$walletAccount?.label ?? 'No mocked account selected'}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-primary" onclick={openMockWallet} data-testid="account-open-wallet">Open wallet controls</button>
          <button class="btn btn-outline btn-error" onclick={setWalletDisconnected} disabled={!$walletIsConnected && !$walletIsUnsupported} data-testid="account-disconnect">Disconnect</button>
        </div>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="account-settings">
      <div class="card-body gap-3">
        <span class="font-semibold">Settings</span>
        <div class="rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-semibold">Mock session persistence</span>
          <span class="mt-1 block text-sm text-base-content/70">State is local to the current browser context. Fresh contexts start disconnected deterministically.</span>
        </div>
        <div class="rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-semibold">Funding and campaign notifications</span>
          <span class="mt-1 block text-sm text-base-content/70">Enabled for mocked deposit, withdraw, and market-making activity.</span>
        </div>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="account-activity">
    <div class="card-body gap-3">
      <span class="font-semibold">Activity</span>
      {#if activityEntries.length > 0}
        <div class="grid gap-3 md:grid-cols-3">
          {#each activityEntries as entry}
            <a href={entry.href} class="rounded-box border border-base-300 bg-base-200 p-4 transition-colors hover:border-primary" data-testid="account-activity-link">
              <span class="font-semibold">{entry.label}</span>
              <span class="block text-sm text-base-content/60">{entry.detail}</span>
            </a>
          {/each}
        </div>
      {:else if $walletIsUnsupported}
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          Account activity is hidden while the selected chain is unsupported.
        </span>
      {:else}
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          No account activity is shown while disconnected. Connect a mocked Reown wallet to view funding, campaign, and market-making history.
        </span>
      {/if}
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="font-semibold">Account balances</span>
      {#if $balances.length > 0}
        <div class="grid gap-3 md:grid-cols-2">
          {#each $balances as balance}
            <div class="rounded-box border border-base-300 bg-base-200 p-4">
              <span class="font-semibold">{balance.symbol}</span>
              <span class="block text-sm text-base-content/60">
                {balance.amount} available · {balance.pendingAmount ?? '0'} pending · ${balance.usdValue}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">No account balances while disconnected or unsupported.</span>
      {/if}
    </div>
  </div>
</section>
