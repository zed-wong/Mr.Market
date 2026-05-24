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
    'fixed inset-0 z-30 bg-base-content/30 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
    open ? 'opacity-100' : 'pointer-events-none opacity-0',
  )}
  onclick={onClose}
></button>

<aside
  class={clsx(
    'fixed top-0 left-0 z-40 h-screen w-72 shrink-0 transition-transform duration-300 ease-in-out lg:w-64',
    open ? 'translate-x-0' : '-translate-x-full',
  )}
  aria-label={$_('sidebar')}
  data-testid="old-admin-sidebar"
>
  <div class="relative flex h-full flex-1 flex-col bg-base-100 px-5 py-7">
    <div class="mb-8 flex items-center justify-between">
      <button type="button" class="flex items-center gap-3" onclick={() => navigate('/')}>
        <span class="flex h-9 w-9 items-center justify-center rounded-full border border-base-300 bg-base-200">
          <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-7 w-7" />
        </span>
        <span class="font-display text-lg text-base-content">Mr.Market</span>
      </button>

      <button
        type="button"
        class="btn-pill-ghost lg:hidden"
        onclick={onClose}
        aria-label={$_('close_sidebar')}
      >
        <span class="text-lg leading-none">×</span>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto">
      <div class="mb-3 px-2">
        <span class="eyebrow">{$_('menu')}</span>
      </div>
      <ul class="space-y-4">
        {#each NAV_ITEMS as item (item.key)}
          {@const groupActive = isGroupActive(item, pathname)}
          {@const groupDirectActive = Boolean(item.href && isActive(item.href, pathname))}
          <li>
            <button
              type="button"
              class={clsx(
                'mb-1 flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
              )}
              onclick={() => item.href && navigate(item.href)}
              aria-current={groupDirectActive ? 'page' : groupActive ? 'location' : undefined}
            >
              <span class="flex min-w-0 items-center gap-3">
                <SideBarIcons name={iconName(item.key)} />
                <span class="truncate capitalize">{$_(item.label)}</span>
              </span>
            </button>
            <ul class="space-y-1 pl-5">
              {#each item.children as child (child.key)}
                {@const childActive = isActive(child.href, pathname)}
                <li>
                  <button
                    type="button"
                    class={clsx(
                      'min-h-9 w-full rounded-2xl px-4 py-2 text-left text-sm font-medium transition-colors',
                      childActive
                        ? 'bg-base-200 text-base-content'
                        : 'text-base-content/55 hover:bg-base-200/60 hover:text-base-content',
                    )}
                    onclick={() => navigate(child.href)}
                    aria-current={childActive ? 'page' : undefined}
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

    <div class="mt-auto px-3 pt-8">
      <div class="mb-3 flex flex-col gap-0.5">
        <span class="eyebrow">admin console</span>
        <span class="text-xs text-base-content/40">Operational preview</span>
      </div>
      <button
        type="button"
        class="btn-pill-ghost w-full justify-start gap-3 text-error hover:bg-error/10"
        onclick={requestLogout}
      >
        <SideBarIcons name="exit" />
        <span class="capitalize">{$_('admin.logout')}</span>
      </button>
    </div>
  </div>
</aside>
