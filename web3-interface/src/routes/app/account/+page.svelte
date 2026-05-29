<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { aggregateMockActivityEntries, mockAccountActivityForAccount } from '$lib/helpers/mock-web3';
  import { showSessionExpired } from '$lib/stores/auth';
  import { balances } from '$lib/stores/balances';
  import { fundingActivityForAccount, sessionFundingActivity } from '$lib/stores/funding';
  import { marketMakingActivityForAccount, sessionMarketMakingActivity } from '$lib/stores/market-making';
  import {
    disconnectWallet,
    openWalletModal,
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

<div data-testid="web3-account">
  <section class="pt-2">
    <span class="eyebrow">Account · {$walletStatus}</span>
    <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content font-mono-num">
      {$walletShortAddress || '—'}
    </span>
    <span class="mt-4 block text-base-content/60">
      {$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'} · {$walletAccount?.label || 'No wallet connected'}
    </span>

    <div class="mt-6 flex flex-wrap gap-2">
      <button class="btn-pill-primary" onclick={openWalletModal} data-testid="account-open-wallet">Open wallet</button>
      <button
        class="btn-pill border border-error/50 text-error hover:bg-error hover:text-error-content disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={() => void disconnectWallet()}
        disabled={!$walletIsConnected && !$walletIsUnsupported}
        data-testid="account-disconnect"
      >
        Disconnect
      </button>
    </div>
  </section>

  <Section title="Session" eyebrow="Mocked context">
    <div class="border-t border-base-300" data-testid="account-session-summary">
      <StatRow label="Address" value={$walletAddress ?? 'Disconnected'} />
      <StatRow label="Short address" value={$walletShortAddress || '—'} />
      <StatRow label="Namespace · network" value={`${$walletNamespaceLabel} · ${$walletNetwork ?? 'not selected'}`} />
      <StatRow label="Network label" value={$walletAccount?.label || 'No wallet connected'} />
      <StatRow label="Session status" value={$walletStatus} />
    </div>
  </Section>

  <Section title="Settings" eyebrow="Preferences">
    <div class="border-t border-base-300" data-testid="account-settings">
      <div class="flex flex-col gap-1 border-b border-base-300 py-5">
        <span class="font-medium">Mock session persistence</span>
        <span class="text-sm text-base-content/55">State is local to the current browser context. Fresh contexts start disconnected deterministically.</span>
      </div>
      <div class="flex flex-col gap-1 border-b border-base-300 py-5">
        <span class="font-medium">Funding & campaign notifications</span>
        <span class="text-sm text-base-content/55">Enabled for mocked deposit, withdraw, and market-making activity.</span>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 py-5">
        <div class="flex flex-col gap-1">
          <span class="font-medium">Session recovery preview</span>
          <span class="text-sm text-base-content/55">Open the deterministic session-expired dialog without making a backend request.</span>
        </div>
        <button class="btn-pill-outline" onclick={() => showSessionExpired.set(true)} data-testid="trigger-session-expired">
          Preview session expired
        </button>
      </div>
    </div>
  </Section>

  <Section title="Activity" eyebrow="Aggregated">
    <div data-testid="account-activity">
      {#if activityEntries.length > 0}
        <div class="border-t border-base-300">
          {#each activityEntries as entry}
            <StatRow
              label={entry.label}
              sublabel={entry.detail}
              value="→"
              href={entry.href}
              testid="account-activity-link"
            />
          {/each}
        </div>
      {:else if $walletIsUnsupported}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Account activity is hidden while the selected chain is unsupported.
        </div>
      {:else}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          No account activity while disconnected. Connect a wallet to view funding, campaign, and market-making history.
        </div>
      {/if}
    </div>
  </Section>

  <Section title="Balances" eyebrow="Account scoped">
    {#if $balances.length > 0}
      <div class="border-t border-base-300">
        {#each $balances as balance}
          <StatRow
            label={balance.symbol}
            sublabel={`${balance.pendingAmount ?? '0'} pending`}
            value={balance.amount}
            subvalue={`$${balance.usdValue}`}
          />
        {/each}
      </div>
    {:else}
      <div class="border-t border-base-300 py-10 text-base-content/55">
        No account balances while disconnected or unsupported.
      </div>
    {/if}
  </Section>
</div>
