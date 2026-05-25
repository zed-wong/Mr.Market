<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    connectDemoWallet,
    openNetworkModal,
    openWalletModal,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  const continueWithDemoWallet = () => {
    connectDemoWallet('evm');
    void goto('/');
  };

  const continueWithWrongNetwork = () => {
    connectDemoWallet('wrong-network');
    void goto('/market-making');
  };
</script>

<section class="flex min-h-[70vh] flex-col justify-center" data-testid="web3-login">
  <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
    <div class="max-w-xl">
      <span class="font-display text-5xl md:text-6xl tracking-tight text-base-content">Connect to Mr.Market</span>
      <span class="mt-4 block text-base-content/60">
        Use Reown AppKit for wallet identity. Portfolio, balances, campaign eligibility, and activity are deterministic demo state scoped to your connected namespace.
      </span>

      <div class="mt-10 flex flex-wrap items-center gap-3">
        <button class="btn-pill-primary" onclick={openWalletModal} data-testid="login-connect-wallet">Connect wallet</button>
        <button class="btn-pill-ghost" onclick={continueWithDemoWallet} data-testid="login-continue-without-wallet">
          Continue with demo wallet →
        </button>
        <button class="btn-pill-ghost" onclick={continueWithWrongNetwork} data-testid="login-demo-wrong-network">
          Preview wrong network →
        </button>
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
          Browser demos can continue with a deterministic wallet that uses fixture balances and activity without requiring a real extension.
        </span>
      {/if}
    </div>
  </div>
</section>
