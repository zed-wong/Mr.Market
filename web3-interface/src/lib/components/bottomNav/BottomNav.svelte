<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'Home', hint: 'Portfolio summary' },
    { href: '/market-making', label: 'Campaigns / Market Making', hint: 'Campaign discovery' },
    { href: '/wallet', label: 'Wallet / Funding', hint: 'Balances, deposit, withdraw' },
    { href: '/account', label: 'Account', hint: 'Session and activity' },
  ];

  const isActive = (href: string) => {
    const p = $page.url.pathname;
    if (href === '/') return p === '/';
    return p.startsWith(href);
  };
</script>

<nav
  class="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-base-300 bg-base-100 p-4 lg:flex"
  data-testid="desktop-primary-navigation"
>
  <div class="mb-8 flex flex-col gap-1">
    <span class="text-xl font-bold text-base-content">Mr.Market</span>
    <span class="text-sm text-base-content/60">Web3 interface prototype</span>
  </div>

  <div class="flex flex-col gap-2">
    {#each navItems as item}
      <a
        href={item.href}
        class="rounded-box border px-4 py-3 transition-colors {isActive(item.href) ? 'border-primary bg-primary text-primary-content' : 'border-base-300 bg-base-100 text-base-content hover:bg-base-200'}"
        data-testid="nav-{item.href === '/' ? 'home' : item.href.slice(1).replace('/', '-')}"
      >
        <span class="block font-semibold">{item.label}</span>
        <span class="block text-xs opacity-70">{item.hint}</span>
      </a>
    {/each}
  </div>
</nav>

<nav class="fixed bottom-0 left-0 right-0 z-30 border-t border-base-300 bg-base-100 lg:hidden">
  <div class="grid grid-cols-4">
    {#each navItems as item}
      <a
        href={item.href}
        class="px-2 py-3 text-center text-xs {isActive(item.href) ? 'text-primary' : 'text-base-content/60'}"
      >
        {item.label.split(' / ')[0]}
      </a>
    {/each}
  </div>
</nav>