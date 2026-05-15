<script lang="ts">
  export let active: 'landing' | 'offerings' | 'leaderboard' = 'landing';

  const navItems = [
    { key: 'landing', label: 'Overview', href: '/' },
    { key: 'offerings', label: 'Offerings', href: '/offerings' },
    { key: 'leaderboard', label: 'Leaderboard', href: '/leaderboard' },
  ];
</script>

<nav class="landing-topbar group relative z-20 rounded-full border border-base-content/10 bg-base-100/88 px-3 py-3 backdrop-blur-md sm:px-4">
  <span class="topbar-scan" aria-hidden="true"></span>

  <div class="flex items-center justify-between gap-4">
    <a href="/" class="flex items-center gap-3 text-base-content no-underline hover:no-underline">
      <span class="topbar-mark flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-base-content/12 bg-base-100">
        <img src="/mr-market-logo-bg.png" alt="Mr.Market" class="h-full w-full object-cover" />
      </span>
      <span class="hidden flex-col leading-none sm:flex">
        <span class="brand-title-font text-sm font-semibold capitalize">Mr.Market</span>
      </span>
    </a>

    <div class="titan-pill hidden items-center gap-1 p-1 text-[0.74rem] font-semibold text-base-content/68 md:flex">
      {#each navItems as item}
        <a
          href={item.href}
          class="rounded-full px-4 py-2 text-base-content no-underline transition duration-300 hover:bg-base-100 hover:no-underline {active === item.key ? 'bg-base-100 text-base-content shadow-[0_8px_24px_rgba(17,17,15,0.06)]' : ''}"
        >{item.label}</a>
      {/each}
    </div>

    <a href="https://mr-market-app.onrender.com" class="rounded-full border border-base-content bg-base-content px-5 py-2.5 text-[0.68rem] font-bold tracking-[0.15em] text-base-100 capitalize no-underline transition duration-300 hover:-translate-y-0.5 hover:no-underline">
      <span>Open App</span>
    </a>
  </div>
</nav>
