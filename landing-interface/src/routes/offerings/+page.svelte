<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';

  const mechanismSteps = [
    {
      label: '01',
      title: 'Campaign',
      body: 'A project posts pair, budget, depth target, and spread goal.',
    },
    {
      label: '02',
      title: 'Execution',
      body: 'Makers join through the open runtime; intents become exchange orders.',
    },
    {
      label: '03',
      title: 'Scoring',
      body: 'Spread, depth, uptime, and attributable volume are measured per epoch.',
    },
    {
      label: '04',
      title: 'Settlement',
      body: 'Rewards settle by score, with ledger entries and public leaderboard proof.',
    },
  ];

  const paths = [
    {
      label: 'For token projects',
      title: 'Launch liquidity',
      body: 'Open a public campaign instead of negotiating a private market-making deal.',
      href: '/offerings/token-projects',
      cta: 'Open project path',
    },
    {
      label: 'For makers',
      title: 'Compete for rewards',
      body: 'Run the engine, join campaigns, and earn by measurable market quality.',
      href: '/offerings/makers',
      cta: 'Open maker path',
    },
    {
      label: 'For treasuries',
      title: 'Audit execution',
      body: 'Track order-scoped funds, reservations, fills, fees, and settlement entries.',
      href: '/offerings/protocol-treasuries',
      cta: 'Open treasury path',
    },
    {
      label: 'For listings',
      title: 'Prove market quality',
      body: 'Show spread, depth, uptime, and ranking during the launch window.',
      href: '/offerings/exchange-listings',
      cta: 'Open listing path',
    },
  ];

  const systemLayers = [
    {
      name: 'Funding layer',
      items: ['campaign treasury', 'order-scoped ledger', 'reward pool'],
    },
    {
      name: 'Scheduling layer',
      items: ['tick loop', 'strategy controller', 'intent dispatch'],
    },
    {
      name: 'Trading layer',
      items: ['reservation', 'exchange orders', 'fills & reconciliation'],
    },
    {
      name: 'Proof layer',
      items: ['score inputs', 'epoch ranking', 'public settlement'],
    },
  ];
</script>

<svelte:head>
  <title>Mr.Market — How it works</title>
  <meta
    name="description"
    content="Mr.Market turns liquidity into an open market: campaigns, execution, scoring, settlement, and public leaderboard proof."
  />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <section class="relative overflow-hidden border-b quiet-rule">
    <span class="blueprint-grid pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-55" aria-hidden="true"></span>
    <div class="relative mx-auto flex max-w-7xl flex-col gap-14 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="offerings" />

      <div class="grid gap-10 pb-16 pt-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div class="flex max-w-[44rem] flex-col gap-6">
          <span class="micro-label text-base-content/46">Product map</span>
          <h1 class="balance-font m-0 text-[3.45em] font-bold leading-[0.98] tracking-[-0.055em] sm:text-[4.4em]">
            Mr.Market turns liquidity into an open market.
          </h1>
          <span class="max-w-[36rem] text-[1.02rem] leading-8 text-base-content/64">
            Projects post campaigns. Makers compete. The system measures market quality and settles rewards through public rules.
          </span>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a href="/leaderboard" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
              View public proof →
            </a>
            <a href="/offerings/public-liquidity-campaigns" class="rounded-full border border-base-content/16 bg-base-100/76 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
              Launch campaign →
            </a>
          </div>
        </div>

        <div class="premium-surface rounded-[1.75rem] p-4">
          <div class="relative min-h-[31rem] overflow-hidden rounded-[1.35rem] border border-base-content/10 bg-base-200/42 p-5 sm:p-6">
            <span class="ledger-grid pointer-events-none absolute inset-0 opacity-35" aria-hidden="true"></span>
            <div class="relative grid gap-4">
              <div class="rounded-[1.2rem] border border-base-content/12 bg-base-100/82 p-5 shadow-[0_20px_60px_rgba(17,17,17,0.05)]">
                <div class="flex items-start justify-between gap-6">
                  <span>
                    <span class="micro-label block text-base-content/42">Live campaign</span>
                    <span class="data-font mt-3 block text-3xl font-semibold leading-none">XIN / USDT</span>
                  </span>
                  <span class="rounded-full border border-base-content/12 px-3 py-1 text-[0.66rem] text-base-content/56">running</span>
                </div>
                <div class="mt-6 grid grid-cols-3 gap-3">
                  <span class="rounded-[0.9rem] border border-base-content/10 bg-base-200/52 p-3">
                    <span class="block text-[0.62rem] text-base-content/44">Reward pool</span>
                    <span class="data-font mt-2 block text-lg font-semibold">$12k</span>
                  </span>
                  <span class="rounded-[0.9rem] border border-base-content/10 bg-base-200/52 p-3">
                    <span class="block text-[0.62rem] text-base-content/44">Depth target</span>
                    <span class="data-font mt-2 block text-lg font-semibold">$500k</span>
                  </span>
                  <span class="rounded-[0.9rem] border border-base-content/10 bg-base-200/52 p-3">
                    <span class="block text-[0.62rem] text-base-content/44">Spread goal</span>
                    <span class="data-font mt-2 block text-lg font-semibold">≤20 bps</span>
                  </span>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
                <div class="rounded-[1.1rem] border border-base-content/12 bg-base-100/78 p-4">
                  <span class="micro-label text-base-content/40">Depth</span>
                  <div class="mt-5 grid gap-2">
                    {#each [78, 63, 44, 29] as width, index}
                      <span class="flex items-center gap-3">
                        <span class="data-font w-10 text-[0.68rem] text-base-content/44">B{index + 1}</span>
                        <span class="h-2 rounded-full bg-base-content/12" style={`width: ${width}%`}></span>
                      </span>
                    {/each}
                    {#each [31, 48, 67, 82] as width, index}
                      <span class="flex items-center gap-3">
                        <span class="data-font w-10 text-[0.68rem] text-base-content/44">A{index + 1}</span>
                        <span class="h-2 rounded-full bg-base-content/28" style={`width: ${width}%`}></span>
                      </span>
                    {/each}
                  </div>
                </div>

                <div class="rounded-[1.1rem] border border-base-content bg-base-content p-4 text-base-100">
                  <span class="micro-label text-base-100/48">Leaderboard</span>
                  <div class="mt-5 grid gap-3">
                    {#each ['Ledger North', 'Aperture MM', 'Vault Line'] as maker, index}
                      <span class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-base-100/10 pb-3 last:border-0 last:pb-0">
                        <span class="data-font text-base-100/42">0{index + 1}</span>
                        <span class="text-sm">{maker}</span>
                        <span class="data-font text-sm font-semibold">{[94.2, 88.7, 81.4][index]}</span>
                      </span>
                    {/each}
                  </div>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-4">
                {#each mechanismSteps as step}
                  <span class="rounded-[1rem] border border-base-content/10 bg-base-100/80 p-4">
                    <span class="data-font text-xs text-base-content/34">{step.label}</span>
                    <span class="mt-3 block text-sm font-semibold">{step.title}</span>
                  </span>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="border-b quiet-rule">
    <div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <div class="grid gap-10 lg:grid-cols-[0.62fr_1.38fr]">
        <div>
          <span class="micro-label text-base-content/48">Core mechanism</span>
          <span class="mt-5 block balance-font text-4xl font-bold leading-[1.05] sm:text-5xl">
            One loop, four system states.
          </span>
        </div>
        <div class="grid gap-3 md:grid-cols-4">
          {#each mechanismSteps as step}
            <div class="rounded-[1.25rem] border border-base-content/10 bg-base-200/44 p-5">
              <span class="data-font text-sm text-base-content/34">{step.label}</span>
              <span class="mt-8 block balance-font text-2xl font-bold leading-none">{step.title}</span>
              <span class="mt-4 block text-sm leading-6 text-base-content/60">{step.body}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="border-b quiet-rule bg-base-200/36">
    <div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <span>
          <span class="micro-label block text-base-content/48">Choose your path</span>
          <span class="mt-5 block balance-font text-4xl font-bold leading-[1.05] sm:text-5xl">
            Start from the job you need done.
          </span>
        </span>
        <span class="max-w-sm text-sm leading-6 text-base-content/58">
          Mr.Market has many functions, but users should enter through a concrete liquidity problem.
        </span>
      </div>

      <div class="mt-10 grid gap-4 lg:grid-cols-4">
        {#each paths as path}
          <a href={path.href} class="group rounded-[1.35rem] border border-base-content/10 bg-base-100 p-6 text-base-content no-underline transition duration-300 hover:-translate-y-1 hover:border-base-content/22 hover:no-underline">
            <span class="micro-label text-base-content/42">{path.label}</span>
            <span class="mt-10 block balance-font text-3xl font-bold leading-none">{path.title}</span>
            <span class="mt-5 block text-sm leading-6 text-base-content/62">{path.body}</span>
            <span class="mt-8 inline-flex text-[0.68rem] font-bold capitalize text-base-content/72 group-hover:text-base-content">
              {path.cta} →
            </span>
          </a>
        {/each}
      </div>
    </div>
  </section>

  <section class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
    <div class="rounded-[1.65rem] border border-base-content/10 bg-base-100 p-6 sm:p-8">
      <div class="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <span class="micro-label text-base-content/48">System map</span>
          <span class="mt-5 block balance-font text-4xl font-bold leading-[1.06]">
            The product is infrastructure, not a menu.
          </span>
          <span class="mt-5 block text-sm leading-7 text-base-content/60">
            The page now explains how funding, scheduling, trading, and public proof connect into one liquidity workflow.
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          {#each systemLayers as layer}
            <div class="rounded-[1.15rem] border border-base-content/10 bg-base-200/44 p-5">
              <span class="balance-font text-2xl font-bold">{layer.name}</span>
              <div class="mt-5 grid gap-2">
                {#each layer.items as item}
                  <span class="flex items-center justify-between gap-3 border-t border-base-content/10 pt-3 text-sm text-base-content/64">
                    <span>{item}</span>
                    <span class="text-base-content/30">›</span>
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>
</main>
