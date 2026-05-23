<script lang="ts">
  import clsx from 'clsx';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { NAV_ITEMS, isActive, isGroupActive } from './nav-items';
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
    if (key === 'overview') return 'dashboard';
    if (key === 'setup') return 'settings';
    if (key === 'trading') return 'revenue';
    if (key === 'system-health') return 'health';
    if (key === 'diagnostics') return 'message';
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
    'fixed inset-0 z-30 bg-base-content/30 transition-opacity duration-300 lg:hidden',
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
    <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
      <button type="button" class="flex items-center gap-3" onclick={() => navigate('/')}>
        <span class="flex h-10 w-10 items-center justify-center rounded-full border border-base-300 bg-base-100">
          <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-8 w-8" />
        </span>
        <span class="text-lg font-semibold tracking-tight text-base-content">Mr.Market</span>
      </button>

      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full lg:hidden"
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
        <span class="text-xs font-medium text-base-content/50 capitalize">{$_('menu')}</span>
      </div>
      <ul class="space-y-5">
        {#each NAV_ITEMS as item (item.key)}
          {@const groupActive = isGroupActive(item, pathname)}
          <li>
            <button
              type="button"
              class={clsx(
                'mb-1 flex min-h-10 w-full items-center gap-3 rounded-full px-3 py-2 text-left text-sm transition-colors',
                groupActive
                  ? 'bg-primary text-primary-content'
                  : 'text-base-content/70 hover:bg-neutral hover:text-base-content',
              )}
              onclick={() => item.href && navigate(item.href)}
              aria-current={item.href && isActive(item.href, pathname) ? 'page' : groupActive ? 'location' : undefined}
            >
              <SideBarIcons name={iconName(item.key)} />
              <span class="font-medium capitalize">{$_(item.label)}</span>
            </button>
            <ul class="space-y-1 pl-3">
              {#each item.children as child (child.key)}
                <li>
                  <button
                    type="button"
                    class={clsx(
                      'min-h-9 w-full rounded-full px-4 py-2 text-left text-sm transition-colors',
                      isActive(child.href, pathname)
                        ? 'bg-primary text-primary-content'
                        : 'text-base-content/60 hover:bg-neutral hover:text-base-content',
                    )}
                    onclick={() => navigate(child.href)}
                    aria-current={isActive(child.href, pathname) ? 'page' : undefined}
                  >
                    <span class="capitalize">{$_(child.label)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="border-t border-base-300 px-3 py-4">
      <button
        type="button"
        class="btn btn-ghost btn-sm w-full justify-start gap-3 rounded-full text-error hover:bg-error/10"
        onclick={requestLogout}
      >
        <SideBarIcons name="exit" />
        <span class="capitalize">{$_('admin.logout')}</span>
      </button>
    </div>
  </div>
</aside>
