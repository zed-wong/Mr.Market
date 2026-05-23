<script lang="ts">
  import { openWalletModal, walletIsConnected, walletNamespaceLabel, walletShortAddress } from '$lib/stores/wallet';
</script>

<section class="flex min-h-[70vh] flex-col items-start justify-center max-w-md" data-testid="web3-login">
  <span class="eyebrow mb-3">web3 · sign in</span>
  <span class="font-display text-5xl md:text-6xl tracking-tight text-base-content">Sign in</span>
  <span class="mt-4 text-base-content/60">
    Connect any supported wallet via Reown AppKit. SIWE authentication is wired in a follow-up step.
  </span>

  {#if $walletIsConnected}
    <div class="mt-8 flex items-center gap-2 border-t border-base-300 pt-6">
      <span class="eyebrow">Connected</span>
      <span class="font-mono-num text-sm">{$walletNamespaceLabel} · {$walletShortAddress}</span>
    </div>
  {/if}

  <div class="mt-10 flex flex-wrap items-center gap-3">
    <button class="btn-pill-primary" onclick={openWalletModal}>Connect wallet</button>
    <a href="/" class="btn-pill-ghost">Continue without connecting →</a>
  </div>
</section>
