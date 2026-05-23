<script lang="ts">
  import {
    openNetworkModal,
    openWalletModal,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';
</script>

<section class="flex min-h-[70vh] flex-col justify-center" data-testid="web3-login">
  <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
    <div class="max-w-xl">
      <span class="eyebrow mb-3">web3 · sign in</span>
      <span class="font-display text-5xl md:text-6xl tracking-tight text-base-content">Connect to Mr.Market</span>
      <span class="mt-4 block text-base-content/60">
        Use Reown AppKit for wallet identity. Portfolio, balances, campaign eligibility, and activity are deterministic demo state scoped to your connected namespace.
      </span>

      <div class="mt-10 flex flex-wrap items-center gap-3">
        <button class="btn-pill-primary" onclick={openWalletModal} data-testid="login-connect-wallet">Connect wallet</button>
        <a href="/" class="btn-pill-ghost" data-testid="login-continue-without-wallet">Continue without connecting →</a>
      </div>
    </div>

    <div class="card-surface p-6" data-testid="login-session-card">
      <span class="eyebrow">Session state</span>
      {#if $walletIsConnected}
        <span class="mt-3 block text-lg font-semibold text-base-content">Wallet connected</span>
        <span class="mt-2 block text-sm text-base-content/60">
          {$walletNamespaceLabel} · {$walletNetwork ?? 'supported network'} · <span class="font-mono-num">{$walletShortAddress}</span>
        </span>
        <a href="/" class="btn-pill-primary mt-5 inline-flex" data-testid="login-open-dashboard">Open dashboard →</a>
      {:else if $walletIsUnsupported}
        <span class="mt-3 block text-lg font-semibold text-base-content">Wrong network selected</span>
        <span class="mt-2 block text-sm text-base-content/60">
          Switch to Ethereum, Sepolia, or Solana to unlock funding and market-making actions.
        </span>
        <button class="btn-pill-primary mt-5" onclick={openNetworkModal} data-testid="login-switch-network">Switch network</button>
      {:else}
        <span class="mt-3 block text-lg font-semibold text-base-content">Ready to connect</span>
        <span class="mt-2 block text-sm text-base-content/60">
          Disconnected visitors can still browse public campaign discovery, then connect when a risk action is needed.
        </span>
      {/if}
    </div>
  </div>
</section>
