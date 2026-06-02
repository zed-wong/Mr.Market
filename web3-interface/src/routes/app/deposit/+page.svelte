<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { fundingActivity } from '$lib/stores/balances';
  import {
    openNetworkModal,
    openMockWallet,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';
</script>

<div data-testid="web3-deposit" class="max-w-2xl">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-4xl md:text-5xl tracking-tight text-base-content">Fund an order</span>
    <span class="mt-4 block text-base-content/60">
      Web3 funding is now order-scoped. Create a market-making order draft, then your wallet routes ERC-20 funds through the Router to the server receiver.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="deposit-connect-gate">
      <span class="text-sm text-base-content/70">Connect a wallet before funding an order.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="deposit-unsupported-gate">
      <span>Wrong network selected. Router funding is blocked until a supported EVM chain is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="deposit-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="Router funding flow" eyebrow="Funding request first" caption={`${$walletNamespaceLabel} · ${$walletNetwork ?? 'not connected'} · ${$walletShortAddress || 'no wallet'}`}>
    <div class="border-t border-base-300 pt-6">
      <span class="block text-sm text-base-content/60">
        There is no generic Web3 wallet deposit. Funding starts from an order draft, creates a funding request, and then asks your wallet to approve and call Router `routeFunds`.
      </span>

      <div class="mt-6" data-testid="deposit-router-steps">
        {#each [
          { label: 'Create order draft', detail: 'Choose pair, strategy, funding token, and amount.' },
          { label: 'Prepare funding request', detail: 'Server returns requestId, payloadHash, token, amount, and Router address.' },
          { label: 'Approve and route funds', detail: 'Your wallet approves the token and calls Router routeFunds.' },
          { label: 'Server creates order', detail: 'Server verifies FundsRouted and credits the order-scoped ledger.' },
        ] as item}
          <div class="flex items-start gap-4 border-b border-base-300 py-4">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"></span>
            <div class="flex flex-col">
              <span class="font-medium text-base-content">{item.label}</span>
              <span class="text-xs text-base-content/55">{item.detail}</span>
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-6 flex flex-wrap gap-2">
        <a class="btn-pill-primary" href="/app/market-making/order/new" data-testid="deposit-create-order-link">Create order & fund</a>
        <a class="btn-pill-outline" href="/app/market-making">View orders</a>
      </div>
    </div>
  </Section>

  {#if $fundingActivity.length > 0}
    <Section title="Funding activity" eyebrow="Order ledger">
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
</div>
