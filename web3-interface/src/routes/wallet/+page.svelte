<script lang="ts">
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { openMockWallet, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespaceLabel, walletNetwork } from '$lib/stores/wallet';

  let fundingActivity = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity)
      : []
  );
</script>

<section class="space-y-6" data-testid="web3-wallet-funding">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold">Wallet / Funding</span>
      <span class="text-base-content/70">
        Mock balances, deposit entry points, and withdraw entry points are available without server data.
      </span>
      <div class="flex flex-wrap gap-2">
        <a href="/deposit" class="btn btn-primary" data-testid="deposit-entry">Deposit</a>
        <a href="/withdraw" class="btn btn-outline" data-testid="withdraw-entry">Withdraw</a>
      </div>
    </div>
  </div>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <div class="alert alert-info" data-testid="wallet-disconnected-gate">
      <span>Connect a mocked Reown wallet to show account-specific balances and funding instructions.</span>
      <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
    </div>
  {:else if $walletIsUnsupported}
    <div class="alert alert-warning" data-testid="wallet-unsupported-gate">
      <span>Unsupported chain selected. Deposit and withdraw submission are blocked until EVM or Solana is selected.</span>
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body">
        <span class="text-sm text-base-content/60">Connected funding context</span>
        <span class="text-3xl font-bold">${$totalBalanceUsd}</span>
        <span class="text-base-content/70">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-3">
        <span class="font-semibold">Assets</span>
        {#if $balances.length > 0}
          <div class="grid gap-3 md:grid-cols-2">
            {#each $balances as balance}
              <div class="rounded-box border border-base-300 bg-base-200 p-4">
                <div class="flex items-center justify-between">
                  <span class="font-semibold">{balance.symbol}</span>
                  <span class="badge badge-outline">{balance.chainNamespace === 'evm' ? 'EVM' : 'Solana'}</span>
                </div>
                <span class="mt-2 block text-2xl font-bold">{balance.amount}</span>
                <span class="text-sm text-base-content/60">${balance.usdValue}</span>
                <span class="mt-1 block text-xs text-base-content/60">
                  Pending withdrawal: {balance.pendingAmount ?? '0'} {balance.symbol}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="rounded-box border border-base-300 bg-base-200 p-5 text-base-content/70">
            <span>No available balances for the current mocked session.</span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="funding-activity">
    <div class="card-body gap-3">
      <span class="font-semibold">Recent funding activity</span>
      {#if fundingActivity.length > 0}
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {#each fundingActivity as entry}
                <tr>
                  <td>{entry.label}</td>
                  <td>{entry.detail}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if $walletIsUnsupported}
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          Funding activity is hidden while the selected chain is unsupported.
        </span>
      {:else}
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          Connect a mocked Reown wallet to view account-specific funding activity.
        </span>
      {/if}
    </div>
  </div>
</section>
