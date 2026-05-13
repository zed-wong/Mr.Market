<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'home', icon: 'home' },
    { href: '/market', label: 'market', icon: 'chart' },
    { href: '/deposit', label: 'deposit', icon: 'arrow-down' },
    { href: '/withdraw', label: 'withdraw', icon: 'arrow-up' },
    { href: '/market-making', label: 'market_making', icon: 'activity' },
  ];

  const isActive = (href: string) => {
    const p = $page.url.pathname;
    if (href === '/') return p === '/';
    return p.startsWith(href);
  };
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 bg-base-100 border-t border-base-300">
  <div class="mx-auto flex max-w-screen-md items-center justify-around">
    {#each navItems as item}
      <a
        href={item.href}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs capitalize transition-colors {isActive(item.href) ? 'text-primary' : 'text-base-content/50'}"
      >
        {#if item.icon === 'home'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
            <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
            <path d="M12 5.432l8.159 8.159c.182.182.28.428.28.684v8.975a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75v4.5a.75.75 0 01-.75.75H4.551a.75.75 0 01-.75-.75v-8.974a.75.75 0 01.28-.684L12 5.432z" />
          </svg>
        {:else if item.icon === 'chart'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
            <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625C9.75 8.004 10.254 7.5 10.875 7.5h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125C16.5 3.504 17.004 3 17.625 3h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        {:else if item.icon === 'arrow-down'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
            <path fill-rule="evenodd" d="M12 2.25a.75.75 0 01.75.75v15.94l5.22-5.22a.75.75 0 011.06 1.06l-6.5 6.5a.75.75 0 01-1.06 0l-6.5-6.5a.75.75 0 111.06-1.06l5.22 5.22V3a.75.75 0 01.75-.75z" clip-rule="evenodd" />
          </svg>
        {:else if item.icon === 'arrow-up'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
            <path fill-rule="evenodd" d="M11.47 2.22a.75.75 0 011.06 0l6.5 6.5a.75.75 0 01-1.06 1.06L12.75 2.56v15.69a.75.75 0 01-1.5 0V2.56L6.03 9.78a.75.75 0 01-1.06-1.06l6.5-6.5z" clip-rule="evenodd" />
          </svg>
        {:else if item.icon === 'activity'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
            <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd" />
          </svg>
        {/if}
        <span>{$_(item.label)}</span>
      </a>
    {/each}
  </div>
</nav>