<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { isAuthed } from '$lib/stores/auth';
  import { walletChainId, walletIsConnected, walletShortAddress } from '$lib/stores/wallet';
  import { initAppKit } from '$lib/helpers/wallet/appkit';
  import { getChainById } from '$lib/helpers/utils';
  import ThemeToggle from './ThemeToggle.svelte';

  let chainInfo = $derived($walletChainId ? getChainById($walletChainId) : null);

  const handleConnect = () => {
    const appKit = initAppKit();
    if (appKit) {
      appKit.open();
    }
  };
</script>

<header class="sticky top-0 z-50 bg-base-100 border-b border-base-300">
  <div class="mx-auto flex max-w-screen-md items-center justify-between px-4 py-3">
    <span class="text-lg font-bold text-base-content capitalize">{$_('app_name')}</span>

    <div class="flex items-center gap-2">
      <ThemeToggle />

      {#if $walletIsConnected && $isAuthed}
        <span class="badge badge-outline capitalize text-xs">{chainInfo?.name ?? ''}</span>
        <button class="btn btn-sm btn-outline capitalize" onclick={handleConnect}>
          {$walletShortAddress}
        </button>
      {:else}
        <button class="btn btn-sm btn-primary capitalize" onclick={handleConnect}>
          {$_('connect_wallet')}
        </button>
      {/if}
    </div>
  </div>
</header>