<script lang="ts">
  import {
    walletIsConnected,
    walletIsUnsupported,
    walletShortAddress,
    walletNetwork,
    openWalletModal,
  } from '$lib/stores/wallet';

  const handle = () => openWalletModal();
</script>

{#if $walletIsConnected || $walletIsUnsupported}
  <button class="btn-connected" onclick={handle} data-testid="connect-wallet-button">
    <span class="dot {$walletIsUnsupported ? 'dot-warning' : 'dot-success'}"></span>
    <span class="font-mono-num">{$walletShortAddress}</span>
    {#if $walletNetwork}
      <span class="text-xs text-base-content/55">· {$walletNetwork}</span>
    {/if}
  </button>
{:else}
  <button class="btn-disconnected" onclick={handle} data-testid="connect-wallet-button">
    Connect
  </button>
{/if}

<style>
  .btn-connected {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 1rem;
    background-color: var(--color-base-200);
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    transition: transform var(--motion-base) var(--ease-spring),
                background-color var(--motion-base) var(--ease-smooth);
  }
  .btn-connected:hover {
    background-color: var(--color-base-300);
    transform: translateY(-1px);
  }
  .btn-connected:active {
    transform: scale(0.97);
    transition-duration: var(--motion-fast);
  }
  .btn-disconnected {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 1rem;
    background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary);
    transition: transform var(--motion-base) var(--ease-spring),
                background-color var(--motion-base) var(--ease-smooth),
                box-shadow var(--motion-base) var(--ease-smooth);
  }
  .btn-disconnected:hover {
    background-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }
  .btn-disconnected:active {
    transform: scale(0.97);
    transition-duration: var(--motion-fast);
  }
  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    position: relative;
  }
  .dot-success { background-color: var(--color-success); }
  .dot-warning { background-color: var(--color-warning); }
  .dot::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    background-color: inherit;
    animation: dotPulse 2.2s var(--ease-smooth) infinite;
    opacity: 0.6;
  }
  @keyframes dotPulse {
    0% { transform: scale(1); opacity: 0.55; }
    100% { transform: scale(2.8); opacity: 0; }
  }
</style>
