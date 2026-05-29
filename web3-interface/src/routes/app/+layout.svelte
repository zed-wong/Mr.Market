<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { initi18n } from '../../i18n/i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { toWeb3Theme } from '$lib/theme/themes';
  import {
    initWalletStore,
    openWalletModal,
    walletAddress,
    walletChainId,
    walletIsConnected,
    walletIsUnsupported,
  } from '$lib/stores/wallet';
  import { getAppKit } from '$lib/helpers/wallet/appkit';
  import { getNonce, login } from '$lib/helpers/api/auth';
  import { buildSiweMessage } from '$lib/helpers/siwe/siwe';
  import { clearAuth, isAuthed, showSessionExpired } from '$lib/stores/auth';
  import SessionExpiredDialog from '$lib/components/dialogs/SessionExpiredDialog.svelte';
  import TopBar from '$lib/components/topBar/TopBar.svelte';
  import SideNav from '$lib/components/sideNav/SideNav.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let web3Theme = $derived(toWeb3Theme($darkTheme));
  let authSequence = 0;
  let authenticatedWalletKey = '';

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

  const ensureWeb3Auth = async (address: string, chainId: string, sequence: number) => {
    try {
      const nonce = await getNonce(address, chainId);
      if (sequence !== authSequence) return;
      const message = buildSiweMessage(nonce.nonce, address, Number(chainId) || 0, nonce.domain, nonce.uri);
      await login(message, `demo-signature:${address}:${chainId}:${nonce.nonce}`);
    } catch {
      if (sequence === authSequence) {
        clearAuth();
        showSessionExpired.set(true);
      }
    }
  };

  $effect(() => {
    if (!i18nReady) return;

    const address = $walletAddress;
    const chainId = String($walletChainId ?? '0');

    if (!$walletIsConnected || $walletIsUnsupported || !address) {
      authSequence += 1;
      authenticatedWalletKey = '';
      clearAuth();
      return;
    }

    const walletKey = `${address}:${chainId}`;

    if (authenticatedWalletKey !== walletKey) {
      authenticatedWalletKey = walletKey;
      clearAuth();
    }
    if ($isAuthed) return;
    const sequence = ++authSequence;
    void ensureWeb3Auth(address, chainId, sequence);
  });

  const reconnectSession = () => {
    void goto('/app/login');
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
