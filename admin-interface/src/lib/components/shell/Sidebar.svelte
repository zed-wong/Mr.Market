<script lang="ts">
  import clsx from 'clsx';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { NAV_ITEMS, isActive, isGroupActive } from './nav-items';
  import SideBarIcons from '$lib/components/admin/dashboard/sideBarIcons.svelte';

  interface Props {
    open: boolean;
    setupCompleted?: boolean;
    onClose: () => void;
    onLogout: () => void;
  }

  let { open, setupCompleted = false, onClose, onLogout }: Props = $props();

  let pathname = $derived($page.url.pathname.replace(/\/+$/, '') || '/');
  let visibleNavItems = $derived(
    setupCompleted ? NAV_ITEMS.filter((item) => item.key !== 'setup') : NAV_ITEMS,
  );

  // Track which sections are expanded; auto-expand the active group
  let expandedSections = $state<Record<string, boolean>>({});

  // Auto-expand the section containing the active page
  $effect(() => {
    for (const item of visibleNavItems) {
      if (item.children.length > 0 && isGroupActive(item, pathname)) {
        expandedSections[item.key] = true;
      }
    }
  });

  const isSectionExpanded = (key: string): boolean => {
    return expandedSections[key] ?? false;
  };

  const toggleSection = (item: (typeof NAV_ITEMS)[0]) => {
    if (item.children.length === 0 && item.href) {
      navigate(item.href);
      return;
    }
    expandedSections[item.key] = !isSectionExpanded(item.key);
  };

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      onClose();
    }
  };

  const navigate = (href: string) => {
    goto(href);
    closeOnMobile();
  };

  const iconName = (key: string) => {
    if (key === 'overview') return 'dashboard';
    if (key === 'setup') return 'settings';
    if (key === 'trading') return 'revenue';
    if (key === 'connectivity') return 'exchanges';
    if (key === 'system') return 'health';
    if (key === 'diagnostics') return 'message';
    return key.replaceAll('.', '_');
  };

  const requestLogout = () => {
    closeOnMobile();
    onLogout();
  };

  // Scroll shadow state
  let navEl: HTMLElement | undefined = $state();
  let showTopShadow = $state(false);
  let showBottomShadow = $state(false);

  const updateScrollShadows = () => {
    if (!navEl) return;
    showTopShadow = navEl.scrollTop > 4;
    showBottomShadow = navEl.scrollTop + navEl.clientHeight < navEl.scrollHeight - 4;
  };

  $effect(() => {
    if (!navEl) return;
    updateScrollShadows();
    const ro = new ResizeObserver(updateScrollShadows);
    ro.observe(navEl);
    return () => ro.disconnect();
  });
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
    <!-- Logo -->
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

    <!-- Navigation -->
    <div class="relative flex-1 overflow-hidden">
      <!-- Top scroll shadow -->
      <div
        class={clsx(
          'pointer-events-none absolute top-0 right-0 left-0 z-10 h-6 bg-gradient-to-b from-base-100 to-transparent transition-opacity duration-200',
          showTopShadow ? 'opacity-100' : 'opacity-0',
        )}
      ></div>

      <nav
        class="h-full overflow-y-auto"
        bind:this={navEl}
        onscroll={updateScrollShadows}
      >
        <div class="mb-3 px-2">
          <span class="eyebrow">{$_('menu')}</span>
        </div>
        <ul class="space-y-1">
          {#each visibleNavItems as item (item.key)}
            {@const groupActive = isGroupActive(item, pathname)}
            {@const groupDirectActive = Boolean(item.href && isActive(item.href, pathname))}
            {@const hasChildren = item.children.length > 0}
            {@const expanded = hasChildren ? isSectionExpanded(item.key) : false}
            <li>
              <!-- Group header -->
              <button
                type="button"
                class={clsx(
                  'mb-0.5 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                  groupActive
                    ? 'bg-primary/8 text-primary'
                    : 'text-base-content/70 hover:bg-base-200/60 hover:text-base-content',
                )}
                onclick={() => {
                  if (!hasChildren && item.href) {
                    navigate(item.href);
                  } else {
                    toggleSection(item);
                  }
                }}
                aria-current={groupDirectActive ? 'page' : groupActive ? 'location' : undefined}
                aria-expanded={hasChildren ? expanded : undefined}
              >
                <span class="flex min-w-0 items-center gap-3">
                  <SideBarIcons name={iconName(item.key)} />
                  <span class="truncate capitalize">{$_(item.label)}</span>
                </span>

                <!-- Chevron for collapsible groups -->
                {#if hasChildren}
                  <svg
                    class={clsx(
                      'h-4 w-4 shrink-0 transition-transform duration-200',
                      expanded ? 'rotate-90' : 'rotate-0',
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                {/if}
              </button>

              <!-- Collapsible children -->
              {#if hasChildren}
                <div
                  class={clsx(
                    'overflow-hidden transition-all duration-200',
                    expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
                  )}
                >
                  <ul class="space-y-0.5 py-1 pl-5">
                    {#each item.children as child (child.key)}
                      {@const childActive = isActive(child.href, pathname)}
                      <li>
                        <button
                          type="button"
                          class={clsx(
                            'min-h-9 w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors',
                            childActive
                              ? 'border-l-2 border-primary bg-primary/8 text-primary'
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
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </nav>

      <!-- Bottom scroll shadow -->
      <div
        class={clsx(
          'pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-6 bg-gradient-to-t from-base-100 to-transparent transition-opacity duration-200',
          showBottomShadow ? 'opacity-100' : 'opacity-0',
        )}
      ></div>
    </div>

    <!-- Footer -->
    <div class="mt-auto border-t border-base-300 px-3 pt-5">
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
