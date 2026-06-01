<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { initi18n } from '../../i18n/i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { toWeb3Theme } from '$lib/theme/themes';
  import {
    initWalletStore,
    openWalletModal,
    setWalletThemeMode,
    walletAddress,
    walletChainId,
    walletIsConnected,
  } from '$lib/stores/wallet';
  import { checkSession } from '$lib/helpers/api/auth';
  import { authState, checked, clearAuth, getAccessToken, isAuthed, showSessionExpired } from '$lib/stores/auth';
  import SessionExpiredDialog from '$lib/components/dialogs/SessionExpiredDialog.svelte';
  import TopBar from '$lib/components/topBar/TopBar.svelte';
  import SideNav from '$lib/components/sideNav/SideNav.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let web3Theme = $derived(toWeb3Theme($darkTheme));
  let authenticatedWalletKey = '';
  const loginHref = () => `/app/login?next=${encodeURIComponent(`${page.url.pathname}${page.url.search}`)}`;

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', web3Theme);
    }
    setWalletThemeMode($darkTheme ? 'dark' : 'light');
  });

  onMount(() => {
    void (async () => {
      await initi18n();
      initWalletStore();
      const hadToken = Boolean(getAccessToken());
      checked.set(false);
      try {
        const session = await checkSession();
        if (!session?.authenticated) {
          clearAuth();
          if (hadToken) {
            showSessionExpired.set(true);
          }
        }
      } catch {
        clearAuth();
        if (hadToken) {
          showSessionExpired.set(true);
        }
      } finally {
        checked.set(true);
        i18nReady = true;
      }
    })();
  });

  $effect(() => {
    if (!i18nReady) return;

    const address = $walletAddress;
    const chainId = String($walletChainId ?? '0');

    if (!$walletIsConnected || !address) {
      authenticatedWalletKey = '';
      return;
    }

    const walletKey = `${address}:${chainId}`;
    const authedWalletKey =
      $authState.address && $authState.chainId ? `${$authState.address}:${$authState.chainId}` : '';

    if ($isAuthed && authedWalletKey && authedWalletKey.toLowerCase() !== walletKey.toLowerCase()) {
      authenticatedWalletKey = walletKey;
      clearAuth();
      showSessionExpired.set(true);
      return;
    }

    if (authenticatedWalletKey && authenticatedWalletKey !== walletKey) {
      authenticatedWalletKey = walletKey;
      if ($isAuthed) {
        clearAuth();
        showSessionExpired.set(true);
      }
    } else {
      authenticatedWalletKey = walletKey;
    }
  });

  const reconnectSession = () => {
    void goto(loginHref());
    openWalletModal();
  };
</script>

<svelte:head>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

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
