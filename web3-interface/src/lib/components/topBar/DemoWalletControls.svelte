<script lang="ts">
  import { expireAuthSession } from '$lib/stores/auth';
  import { connectDemoWallet, disconnectWallet } from '$lib/stores/wallet';

  let menuOpen = $state(false);

  const useDemoWallet = (preset: 'evm' | 'solana' | 'wrong-network') => {
    connectDemoWallet(preset);
    menuOpen = false;
  };

  const triggerSessionExpired = () => {
    expireAuthSession();
    menuOpen = false;
  };

  const resetDemoWallet = () => {
    void disconnectWallet();
    menuOpen = false;
  };
</script>

<div class="dropdown dropdown-end">
  <button class="btn-pill-outline" onclick={() => { menuOpen = !menuOpen; }} aria-label="Demo controls" data-testid="demo-wallet-controls">
    <span>Demo</span>
    <span class="hidden sm:inline">controls</span>
  </button>
  {#if menuOpen}
    <div class="dropdown-content z-20 mt-3 w-72 rounded-2xl border border-base-300 bg-base-100 p-3 shadow-xl">
      <span class="eyebrow">Browser validation safe</span>
      <span class="mt-2 block text-xs text-base-content/60">
        Sets local deterministic wallet/session state only. No backend, RPC, signature, or secret is used.
      </span>

      <div class="mt-4 grid gap-2">
        <button class="btn-pill-ghost justify-start" onclick={() => useDemoWallet('evm')} data-testid="demo-wallet-evm">
          Supported EVM demo
        </button>
        <button class="btn-pill-ghost justify-start" onclick={() => useDemoWallet('solana')} data-testid="demo-wallet-solana">
          Supported Solana demo
        </button>
        <button class="btn-pill-ghost justify-start" onclick={() => useDemoWallet('wrong-network')} data-testid="demo-wallet-wrong-network">
          Wrong-network demo
        </button>
        <button class="btn-pill-ghost justify-start" onclick={triggerSessionExpired} data-testid="demo-session-expired">
          Trigger session expired
        </button>
        <button class="btn-pill-ghost justify-start" onclick={resetDemoWallet} data-testid="demo-wallet-disconnect">
          Reset wallet state
        </button>
      </div>
    </div>
  {/if}
</div>
