<script lang="ts">
  import clsx from 'clsx';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { NAV_ITEMS, isActive } from './nav-items';
  import SideBarIcons from '$lib/components/admin/dashboard/sideBarIcons.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    onLogout: () => void;
  }

  let { open, onClose, onLogout }: Props = $props();

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      onClose();
    }
  };

  const navigate = (href: string) => {
    goto(href);
    closeOnMobile();
  };

  let pathname = $derived($page.url.pathname.replace(/\/+$/, '') || '/');

  const iconName = (key: string) => {
    if (key === 'market_making') return 'settings';
    return key.replaceAll('.', '_');
  };

  const requestLogout = () => {
    closeOnMobile();
    onLogout();
  };
</script>

<button
  type="button"
  aria-label={$_('close_sidebar_backdrop')}
  class={clsx(
    'fixed inset-0 z-30 bg-base-content/40 transition-opacity duration-300 lg:hidden',
    open ? 'opacity-100' : 'pointer-events-none opacity-0',
  )}
  onclick={onClose}
></button>

<aside
  class={clsx(
    'fixed top-0 left-0 z-40 h-screen w-72 shrink-0 transition-transform duration-300 ease-in-out',
    open ? 'translate-x-0' : '-translate-x-full',
  )}
  aria-label={$_('sidebar')}
  data-testid="old-admin-sidebar"
>
  <div class="relative flex h-full flex-1 flex-col border-r border-base-300 bg-base-100">
    <div class="flex items-center justify-between border-base-300 px-5 py-4">
      <button type="button" class="flex items-center gap-3" onclick={() => navigate('/settings')}>
        <div class="avatar placeholder">
          <div class="flex w-10 items-center justify-center rounded-lg text-primary-content">
            <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-10 w-10" />
          </div>
        </div>
        <span class="text-lg font-bold text-base-content">Mr.Market</span>
      </button>

      <button
        type="button"
        class="btn btn-ghost btn-sm lg:hidden"
        onclick={onClose}
        aria-label={$_('close_sidebar')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="h-5 w-5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-4">
      <div class="mb-3 px-2">
        <span class="text-xs font-semibold text-base-content/50 capitalize">{$_('menu')}</span>
      </div>
      <ul class="menu menu-sm gap-1">
        {#each NAV_ITEMS as item (item.key)}
          <li>
            <button
              type="button"
              class={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-base-content/70 transition-colors',
                isActive(item.href, pathname)
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-base-200 hover:text-base-content',
              )}
              onclick={() => navigate(item.href)}
            >
              <SideBarIcons name={iconName(item.key)} />
              <span class="font-medium capitalize">{$_(item.label)}</span>
            </button>
            {#if item.children?.length}
              <ul class="mt-1 space-y-1 pl-10">
                {#each item.children as child (child.key)}
                  <li>
                    <button
                      type="button"
                      class={clsx(
                        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        isActive(child.href, pathname)
                          ? 'bg-primary/10 text-primary'
                          : 'text-base-content/60 hover:bg-base-200 hover:text-base-content',
                      )}
                      onclick={() => navigate(child.href)}
                    >
                      <span class="capitalize">{$_(child.label)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>

    <div class="border-t border-base-300 px-3 py-4">
      <button
        type="button"
        class="btn btn-ghost btn-sm w-full justify-start gap-3 text-error hover:bg-error/10"
        onclick={requestLogout}
      >
        <SideBarIcons name="exit" />
        <span class="capitalize">{$_('admin.logout')}</span>
      </button>
    </div>
  </div>
</aside>
