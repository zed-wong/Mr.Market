<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { initi18n } from '../i18n/i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { toWeb3Theme } from '$lib/theme/themes';
  import { checked, isAuthed, showSessionExpired } from '$lib/stores/auth';
  import { walletStatus } from '$lib/stores/wallet';
  import { checkSession } from '$lib/helpers/api/auth';
  import { initAppKit } from '$lib/helpers/wallet/appkit';
  import { getAccessToken } from '$lib/helpers/api/client';
  import TopBar from '$lib/components/topBar/TopBar.svelte';
  import BottomNav from '$lib/components/bottomNav/BottomNav.svelte';
  import SessionExpiredDialog from '$lib/components/dialogs/SessionExpiredDialog.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let bootstrapped = $state(false);

  let pathname = $derived($page.url.pathname);
  let onLoginRoute = $derived(pathname === '/login' || pathname.startsWith('/login/'));
  let web3Theme = $derived(toWeb3Theme($darkTheme));

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', web3Theme);
    }
  });

  const bootstrap = async () => {
    try {
      const token = getAccessToken();
      if (token) {
        const session = await checkSession();
        if (session?.authenticated) {
          isAuthed.set(true);
          checked.set(true);
        } else {
          isAuthed.set(false);
          checked.set(true);
        }
      } else {
        isAuthed.set(false);
        checked.set(true);
      }
    } catch (err) {
      console.warn('[web3-interface] session bootstrap failed:', err);
      isAuthed.set(false);
      checked.set(true);
    } finally {
      bootstrapped = true;
    }
  };

  onMount(() => {
    void (async () => {
      await initi18n();
      i18nReady = true;
      try {
        initAppKit();
      } catch (e) {
        console.warn('[web3-interface] AppKit init failed:', e);
      }
      await bootstrap();
    })();
  });

  $effect(() => {
    if (bootstrapped && i18nReady && !$isAuthed && !onLoginRoute) {
      goto('/login');
    }
    if (bootstrapped && i18nReady && $isAuthed && onLoginRoute) {
      goto('/');
    }
  });

  const handleSessionExpired = () => {
    isAuthed.set(false);
    goto('/login');
  };
</script>

{#if !i18nReady || !bootstrapped}
  <div class="flex min-h-screen items-center justify-center bg-base-100 text-base-content">
    <span class="loading loading-spinner loading-md"></span>
  </div>
{:else if onLoginRoute || !$isAuthed}
  {@render children?.()}
{:else}
  <main class="min-h-screen bg-base-200">
    <TopBar />
    <div class="pb-20">
      <div class="mx-auto max-w-screen-md p-4">
        {@render children?.()}
      </div>
    </div>
    <BottomNav />
  </main>
{/if}

{#if i18nReady}
  <SessionExpiredDialog onConfirm={handleSessionExpired} />
{/if}