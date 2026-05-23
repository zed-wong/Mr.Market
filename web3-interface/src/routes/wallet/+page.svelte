<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { openMockWallet, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespaceLabel, walletNetwork } from '$lib/stores/wallet';

  let fundingActivity = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity)
      : []
  );
</script>

<div class="anim-page-enter" data-testid="web3-wallet-funding">
  <section class="card-surface p-6 md:p-8">
    <span class="eyebrow">Wallet balance</span>
    <div class="mt-2 flex items-baseline gap-3">
      <span class="text-display text-base-content font-mono-num">${$totalBalanceUsd}</span>
    </div>
    <span class="mt-3 block text-body-muted">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>

    <div class="mt-5 flex flex-wrap gap-2">
      <a href="/deposit" class="btn-pill-primary" data-testid="deposit-entry">Deposit</a>
      <a href="/withdraw" class="btn-pill-outline" data-testid="withdraw-entry">Withdraw</a>
    </div>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-6 card-surface flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="wallet-disconnected-gate">
      <span class="text-body-muted">Connect a wallet to show account-specific balances and funding.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-6 rounded-2xl bg-warning/10 border border-warning/30 px-5 py-4 text-body-muted" data-testid="wallet-unsupported-gate">
      Unsupported chain selected. Deposit and withdraw submission are blocked until EVM or Solana is selected.
    </section>
  {/if}

  <Section title="Assets" eyebrow="Account scoped">
    {#if $balances.length > 0}
      {#each $balances as balance}
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
      {#if fundingActivity.length > 0}
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
