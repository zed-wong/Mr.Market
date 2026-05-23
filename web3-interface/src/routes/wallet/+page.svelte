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

<div data-testid="web3-wallet-funding">
  <section class="pt-2">
    <span class="eyebrow">Wallet</span>
    <div class="mt-3 flex items-baseline gap-3">
      <span class="font-display text-5xl md:text-7xl tracking-tight text-base-content font-mono-num">${$totalBalanceUsd}</span>
    </div>
    <span class="mt-4 block text-base-content/60">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>

    <div class="mt-6 flex flex-wrap gap-2">
      <a href="/deposit" class="btn-pill-primary" data-testid="deposit-entry">Deposit</a>
      <a href="/withdraw" class="btn-pill-outline" data-testid="withdraw-entry">Withdraw</a>
    </div>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="wallet-disconnected-gate">
      <span class="text-sm text-base-content/70">Connect a wallet to show account-specific balances and funding.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="wallet-unsupported-gate">
      Unsupported chain selected. Deposit and withdraw submission are blocked until EVM or Solana is selected.
    </section>
  {/if}

  <Section title="Assets" eyebrow="Account scoped">
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
        No available balances for the current mocked session.
      </div>
    {/if}
  </Section>

  <Section title="Funding activity" eyebrow="Recent">
    <div data-testid="funding-activity">
      {#if fundingActivity.length > 0}
        <div class="border-t border-base-300">
          {#each fundingActivity as entry}
            <StatRow label={entry.label} sublabel={entry.detail} value="→" />
          {/each}
        </div>
      {:else if $walletIsUnsupported}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Funding activity is hidden while the selected chain is unsupported.
        </div>
      {:else}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Connect a wallet to view account-specific funding activity.
        </div>
      {/if}
    </div>
  </Section>
</div>
