<script lang="ts">
  import { page } from '$app/stores';
  import { closeMobileNav, mobileNavOpen } from '$lib/stores/ui';

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/market', label: 'Campaigns' },
    { href: '/market-making', label: 'Market making' },
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
  class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-base-100 px-5 py-8 md:flex"
  data-testid="desktop-primary-navigation"
>
  <a href="/" class="mb-10 flex items-center gap-2 px-2" onclick={closeMobileNav}>
    <img src="/mr-market-logo-bg.png" alt="Mr.Market logo" class="size-8 rounded-full" />
    <span class="font-display text-lg tracking-tight text-base-content">Mr.Market</span>
  </a>

  <nav class="flex flex-col gap-1">
    {#each navItems as item}
      <a
        href={item.href}
        class="group flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold {isActive(item.href) ? 'bg-base-200 text-base-content' : 'text-base-content/60 hover:bg-base-200/60 hover:text-base-content'}"
        style="transition: background-color var(--motion-base) var(--ease-smooth), color var(--motion-base) var(--ease-smooth);"
        data-testid={navTestId(item.href)}
      >
        <span class="capitalize">{item.label}</span>
        {#if isActive(item.href)}
          <span class="inline-block size-1.5 rounded-full bg-primary anim-pulse-dot"></span>
        {/if}
      </a>
    {/each}
  </nav>

  <div class="mt-auto flex flex-col gap-1 px-3 pt-10">
    <span class="eyebrow">v1 preview</span>
    <span class="text-xs text-base-content/40">Reown AppKit</span>
  </div>
</aside>

{#if $mobileNavOpen}
  <div
    class="fixed inset-0 z-50 bg-base-content/30 backdrop-blur-sm md:hidden anim-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close navigation"
    onclick={closeMobileNav}
    onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeMobileNav()}
  ></div>

  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-base-100 px-8 py-10 md:hidden anim-slide-in"
    data-testid="mobile-primary-navigation"
  >
    <div class="mb-10 flex items-start justify-between">
      <a href="/" class="flex items-center gap-2" onclick={closeMobileNav}>
        <img src="/mr-market-logo-bg.png" alt="Mr.Market logo" class="size-8 rounded-full" />
        <span class="font-display text-lg tracking-tight text-base-content">Mr.Market</span>
      </a>
      <button class="btn-pill-ghost" onclick={closeMobileNav} aria-label="Close navigation">
        <span class="text-lg leading-none">×</span>
      </button>
    </div>

    <nav class="flex flex-col gap-1">
      {#each navItems as item, i}
        <a
          href={item.href}
          class="rounded-2xl px-3 py-2.5 text-base font-semibold anim-card-enter {isActive(item.href) ? 'bg-base-200 text-base-content' : 'text-base-content/60'}"
          style="animation-delay: {i * 40}ms; transition: background-color var(--motion-base) var(--ease-smooth);"
          onclick={closeMobileNav}
          data-testid="mobile-{navTestId(item.href)}"
        >
          <span class="capitalize">{item.label}</span>
        </a>
      {/each}
    </nav>
  </aside>
{/if}

<style>
  @keyframes backdropFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  :global(.anim-backdrop) {
    animation: backdropFade var(--motion-base) var(--ease-smooth) both;
  }
  :global(.anim-slide-in) {
    animation: slideIn var(--motion-slow) var(--ease-snappy) both;
  }
</style>
