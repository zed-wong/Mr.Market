<script lang="ts">
  import clsx from 'clsx';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { NAV_ITEMS, isActive } from './nav-items';

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
</script>

<button
  type="button"
  aria-label="close sidebar backdrop"
  class={clsx(
    'fixed inset-0 z-30 bg-base-content/40 transition-opacity duration-300 lg:hidden',
    open ? 'opacity-100' : 'pointer-events-none opacity-0',
  )}
  onclick={onClose}
></button>

<aside
  class={clsx(
    'fixed top-0 left-0 z-40 h-screen w-72 shrink-0 border-r border-base-300 bg-base-100 transition-transform duration-300 ease-in-out',
    open ? 'translate-x-0' : '-translate-x-full',
  )}
  aria-label="Sidebar"
>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
      <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
        {$_('admin.title')}
      </span>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-4">
      <ul class="menu menu-md w-full">
        {#each NAV_ITEMS as item (item.key)}
          <li>
            <button
              type="button"
              class={clsx('justify-start', isActive(item.href, pathname) && 'menu-active')}
              onclick={() => navigate(item.href)}
            >
              <span class="capitalize">{$_(item.label)}</span>
            </button>
            {#if item.children?.length}
              <ul>
                {#each item.children as child (child.key)}
                  <li>
                    <button
                      type="button"
                      class={clsx('justify-start', isActive(child.href, pathname) && 'menu-active')}
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

    <div class="border-t border-base-300 px-3 py-3">
      <button type="button" class="btn btn-ghost btn-sm w-full justify-start" onclick={onLogout}>
        <span class="capitalize">{$_('admin.logout')}</span>
      </button>
    </div>
  </div>
</aside>
