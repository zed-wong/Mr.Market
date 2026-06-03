<script lang="ts">
  import '../app.css';
  import clsx from 'clsx';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Toaster } from 'svelte-sonner';
  import { _ } from 'svelte-i18n';
  import { initi18n } from '../i18n/i18n';
  import { toAdminTheme } from '$lib/theme/themes';
  import { darkTheme, initTheme } from '$lib/stores/theme';
  import { checkSession, logout } from '$lib/helpers/api/auth';
  import { fetchSetupStatus } from '$lib/helpers/api/setup';
  import { getAuthLayoutState } from '$lib/helpers/admin/auth-layout-state';
  import {
    correct,
    checked,
    submitted,
    showSessionExpired,
  } from '$lib/stores/auth';
  import { setupStatus } from '$lib/stores/setup';
  import Sidebar from '$lib/components/shell/Sidebar.svelte';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import SessionExpiredDialog from '$lib/components/shell/SessionExpiredDialog.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let bootstrapped = $state(false);
  let sidebarOpen = $state(false);

  let pathname = $derived($page.url.pathname);
  let authLayoutState = $derived(
    getAuthLayoutState({
      pathname,
      i18nReady,
      bootstrapped,
      authenticated: $correct,
    }),
  );

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', toAdminTheme($darkTheme));
    }
  });

  const bootstrap = async () => {
    try {
      const status = await fetchSetupStatus();
      setupStatus.set(status);

      if (!status.initialized) {
        correct.set(false);
        checked.set(true);
        return;
      }

      const session = await checkSession();
      if (session?.authenticated) {
        correct.set(true);
        checked.set(true);
      } else {
        correct.set(false);
        checked.set(true);
      }
    } catch (err) {
      console.warn('[admin-interface] session bootstrap failed:', err);
      setupStatus.set(null);
      correct.set(false);
      checked.set(true);
    } finally {
      bootstrapped = true;
    }
  };

  onMount(() => {
    void (async () => {
      await initi18n();
      i18nReady = true;
      await bootstrap();
    })();

    if (typeof window === 'undefined') return;
    initTheme();
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    sidebarOpen = mediaQuery.matches;
    const sync = () => {
      sidebarOpen = mediaQuery.matches;
    };
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  });

  $effect(() => {
    if (bootstrapped && $setupStatus && !$setupStatus.initialized && pathname !== '/setup') {
      goto('/setup');
      return;
    }
    if (bootstrapped && $setupStatus?.completedAt && pathname === '/setup') {
      goto('/');
      return;
    }
    if (authLayoutState === 'auth-blocked') {
      goto('/login');
    }
    if (authLayoutState === 'login' && $correct) {
      goto('/');
    }
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      correct.set(false);
      checked.set(true);
      submitted.set(false);
      goto('/login');
    }
  };

  const handleSessionExpired = async () => {
    correct.set(false);
    submitted.set(false);
    goto('/login');
  };
</script>

{#if authLayoutState === 'bootstrapping'}
  <div class="flex min-h-screen items-center justify-center bg-base-100 text-base-content">
    <span class="loading loading-spinner loading-md"></span>
  </div>
{:else if authLayoutState === 'login'}
  {@render children?.()}
{:else if authLayoutState === 'setup'}
  {@render children?.()}
{:else if authLayoutState === 'auth-blocked'}
  <div
    class="flex min-h-screen items-center justify-center bg-base-100 text-base-content"
    data-testid="auth-redirect-blocker"
    aria-live="polite"
  >
    <span class="loading loading-spinner loading-md" aria-hidden="true"></span>
    <span class="sr-only">{$_('admin.loading')}</span>
  </div>
{:else if authLayoutState === 'protected'}
  <main class="min-h-screen bg-base-100">
    <div class="flex h-screen overflow-hidden bg-base-100">
      <Sidebar
        open={sidebarOpen}
        setupCompleted={Boolean($setupStatus?.completedAt)}
        onClose={() => (sidebarOpen = false)}
        onLogout={handleLogout}
      />

      <div
        class={clsx(
          'relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-[margin] duration-300',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-0',
        )}
      >
        <TopBar onToggleSidebar={() => (sidebarOpen = !sidebarOpen)} />
        <div class="flex-1">
          <div class="mx-auto w-full max-w-screen-2xl p-5 pb-12 md:p-8">
            {@render children?.()}
          </div>
        </div>
      </div>
    </div>
  </main>
{/if}

{#if i18nReady}
  <SessionExpiredDialog onConfirm={handleSessionExpired} />
{/if}

<Toaster />
