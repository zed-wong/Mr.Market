<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { langs, setLocale } from '../../../i18n/i18n';
  import { logout as logoutWeb3 } from '$lib/helpers/api/auth';
  import { isAuthed, showSessionExpired } from '$lib/stores/auth';
  import { balances, fundingActivity, refreshBalances } from '$lib/stores/balances';
  import { darkTheme, toggleTheme } from '$lib/stores/theme';
  import {
    disconnectWallet,
    openNetworkModal,
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

  onMount(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void refreshBalances();
    }
  });

  const logoutAndDisconnect = async () => {
    await logoutWeb3();
    await disconnectWallet();
  };
</script>

<div data-testid="web3-settings">
  <section class="pt-2">
    <span class="eyebrow">Settings · {$walletStatus}</span>
    <span class="mt-3 block font-display text-4xl md:text-5xl tracking-tight text-base-content font-mono-num">
      {$walletShortAddress || '—'}
    </span>
    <span class="mt-4 block text-base-content/60">
      {$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'} · {$walletAccount?.label || 'No wallet connected'}
    </span>

    <div class="mt-6 flex flex-wrap gap-2">
      <button class="btn-pill-primary" onclick={openWalletModal} data-testid="settings-open-wallet">Open wallet</button>
      <button class="btn-pill-outline" onclick={openNetworkModal} disabled={!$walletIsConnected} data-testid="settings-switch-network">Switch network</button>
      <button
        class="btn-pill border border-error/50 text-error hover:bg-error hover:text-error-content disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={() => void logoutAndDisconnect()}
        disabled={!$isAuthed && !$walletIsConnected && !$walletIsUnsupported}
        data-testid="settings-disconnect"
      >
        Disconnect
      </button>
    </div>
  </section>

  <Section title="Session" eyebrow="Mocked context">
    <div class="border-t border-base-300" data-testid="settings-session-summary">
      <StatRow label="Address" value={$walletAddress ?? 'Disconnected'} />
      <StatRow label="Short address" value={$walletShortAddress || '—'} />
      <StatRow label="Namespace · network" value={`${$walletNamespaceLabel} · ${$walletNetwork ?? 'not selected'}`} />
      <StatRow label="Network label" value={$walletAccount?.label || 'No wallet connected'} />
      <StatRow label="Session status" value={$walletStatus} />
    </div>
  </Section>

  <Section title="Settings" eyebrow="Preferences">
    <div class="border-t border-base-300" data-testid="settings-preferences">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 py-5">
        <div class="flex flex-col gap-1">
          <span class="font-medium">Language</span>
          <span class="text-sm text-base-content/55">Switch interface language between English and Chinese.</span>
        </div>
        <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" value={$locale ?? 'en-US'} onchange={(event) => setLocale(event.currentTarget.value)} data-testid="settings-language-toggle">
          {#each langs as lang}
            <option value={lang.key}>{lang.name}</option>
          {/each}
        </select>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 py-5">
        <div class="flex flex-col gap-1">
          <span class="font-medium">Theme</span>
          <span class="text-sm text-base-content/55">Current theme: {$darkTheme ? 'dark' : 'light'}.</span>
        </div>
        <button class="btn-pill-outline" onclick={toggleTheme} data-testid="settings-theme-toggle">
          Switch to {$darkTheme ? 'light' : 'dark'}
        </button>
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
    <div data-testid="settings-activity">
      {#if $fundingActivity.length > 0}
        <div class="border-t border-base-300">
          {#each $fundingActivity as entry}
            <StatRow
              label={entry.direction}
              sublabel={`${entry.assetId} · ${entry.scope} · ${entry.createdAt}`}
              value={entry.amount}
              testid="settings-activity-link"
            />
          {/each}
        </div>
      {:else if $walletIsUnsupported}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Wallet activity is hidden while the selected chain is unsupported.
        </div>
      {:else}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          No wallet funding activity yet. Connect and use deposit or withdraw to create ledger activity.
        </div>
      {/if}
    </div>
  </Section>

  <Section title="Balances" eyebrow="Wallet scoped">
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
        No wallet balances while disconnected or unsupported.
      </div>
    {/if}
  </Section>
</div>
