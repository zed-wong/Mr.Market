<script lang="ts">
  import { page } from '$app/stores';
  import { closeMobileNav, mobileNavOpen } from '$lib/stores/ui';

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/market', label: 'Markets' },
    { href: '/market-making', label: 'Pools' },
    { href: '/wallet', label: 'Wallet' },
    { href: '/account', label: 'Account' },
  ];

  const isActive = (href: string) => {
    const p = $page.url.pathname;
    if (href === '/') return p === '/';
    return p === href || p.startsWith(href + '/');
  };

  const navTestId = (href: string) =>
    href === '/' ? 'nav-home' : `nav-${href.slice(1).replace('/', '-')}`;
</script>

<aside
  class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-base-300 bg-base-100 px-8 py-10 md:flex"
  data-testid="desktop-primary-navigation"
>
  <a href="/" class="mb-12 flex flex-col gap-0.5" onclick={closeMobileNav}>
    <span class="font-display text-2xl tracking-tight text-base-content">Mr.Market</span>
    <span class="eyebrow">web3</span>
  </a>

  <nav class="flex flex-col gap-1">
    {#each navItems as item}
      <a
        href={item.href}
        class="group relative -ml-3 flex items-center rounded-full px-3 py-2 text-sm transition-colors {isActive(item.href) ? 'text-base-content' : 'text-base-content/55 hover:text-base-content'}"
        data-testid={navTestId(item.href)}
      >
        {#if isActive(item.href)}
          <span class="absolute -left-3 top-1/2 h-4 w-px -translate-y-1/2 bg-base-content"></span>
        {/if}
        <span class="capitalize">{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="mt-auto flex flex-col gap-1 pt-10">
    <span class="eyebrow">v1 preview</span>
    <span class="text-xs text-base-content/40">Reown AppKit</span>
  </div>
</aside>

{#if $mobileNavOpen}
  <div
    class="fixed inset-0 z-50 bg-base-content/20 md:hidden"
    role="button"
    tabindex="0"
    aria-label="Close navigation"
    onclick={closeMobileNav}
    onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeMobileNav()}
  ></div>

  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-base-100 px-8 py-10 md:hidden"
    data-testid="mobile-primary-navigation"
  >
    <div class="mb-10 flex items-start justify-between">
      <a href="/" class="flex flex-col gap-0.5" onclick={closeMobileNav}>
        <span class="font-display text-2xl tracking-tight text-base-content">Mr.Market</span>
        <span class="eyebrow">web3</span>
      </a>
      <button class="btn-pill-ghost" onclick={closeMobileNav} aria-label="Close navigation">
        <span class="text-lg leading-none">×</span>
      </button>
    </div>

    <nav class="flex flex-col gap-2">
      {#each navItems as item}
        <a
          href={item.href}
          class="rounded-full px-3 py-2 text-base transition-colors {isActive(item.href) ? 'text-base-content' : 'text-base-content/55'}"
          onclick={closeMobileNav}
          data-testid="mobile-{navTestId(item.href)}"
        >
          <span class="capitalize">{item.label}</span>
        </a>
      {/each}
    </nav>
  </aside>
{/if}
