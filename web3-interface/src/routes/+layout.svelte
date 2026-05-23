<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { initi18n } from '../i18n/i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { toWeb3Theme } from '$lib/theme/themes';
  import { initWalletStore, openWalletModal } from '$lib/stores/wallet';
  import { getAppKit } from '$lib/helpers/wallet/appkit';
  import SessionExpiredDialog from '$lib/components/dialogs/SessionExpiredDialog.svelte';
  import TopBar from '$lib/components/topBar/TopBar.svelte';
  import SideNav from '$lib/components/sideNav/SideNav.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let web3Theme = $derived(toWeb3Theme($darkTheme));

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', web3Theme);
    }
    const appKit = getAppKit();
    appKit?.setThemeMode($darkTheme ? 'dark' : 'light');
  });

  onMount(() => {
    void (async () => {
      await initi18n();
      i18nReady = true;
      initWalletStore();
    })();
  });

  const reconnectSession = () => {
    void goto('/login');
    openWalletModal();
  };
</script>

{#if !i18nReady}
  <div class="flex min-h-screen items-center justify-center bg-base-100 text-base-content">
    <span class="loading loading-spinner loading-md"></span>
  </div>
{:else}
  <div class="flex min-h-screen bg-base-100 text-base-content">
    <SideNav />
    <main class="min-w-0 flex-1">
      <div class="mx-auto w-full max-w-5xl px-5 pt-6 pb-20 md:px-10 md:pt-10">
        <TopBar />
        {@render children?.()}
      </div>
    </main>
    <SessionExpiredDialog onConfirm={reconnectSession} />
  </div>
{/if}
