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

  const heroCapabilities = [
    {
      label: '01',
      title: 'Create campaign',
      body: 'Pair, budget, depth target, spread goal.',
    },
    {
      label: '02',
      title: 'Makers compete',
      body: 'Quote depth, keep uptime, fill useful volume.',
    },
    {
      label: '03',
      title: 'Settle proof',
      body: 'Rank quality and pay rewards by public rules.',
    },
  ];

  const paths = [
    {
      label: 'For token projects',
      title: 'Launch community liquidity',
      body: 'Create HuFi campaigns when your token needs transparent rewards for holding, trading, and durable market depth.',
      href: '/offerings/token-projects',
      cta: 'Open project path',
    },
    {
      label: 'For exchanges',
      title: 'Bring activity to listings',
      body: 'Use campaigns when a market needs more depth, tighter spreads, and visible user participation around public rules.',
      href: '/offerings/exchange-listings',
      cta: 'Open exchange path',
    },
    {
      label: 'For traders',
      title: 'Find reward opportunities',
      body: 'Join campaigns when you want to support markets through holding and trading while earning from measured contributions.',
      href: '/offerings/public-liquidity-campaigns',
      cta: 'Open trader path',
    },
    {
      label: 'For market makers',
      title: 'Work measurable demand',
      body: 'Create Mr.Market orders for campaigns that define the pair, budget, depth target, spread goal, and reward logic upfront.',
      href: '/offerings/makers',
      cta: 'Open maker path',
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
          <span class="micro-label text-base-content/46">What we offer</span>
          <span class="balance-font m-0 text-[3em] font-bold leading-[0.98] tracking-[-0.055em] sm:text-[3.85em]">
            Supply your token's liquidity within minutes
          </span>
          <span class="max-w-[36rem] text-[1.02rem] leading-8 text-base-content/64">
            HuFi is the decentralized tradeathon layer where anyone can create campaigns. Mr.Market orders work on those campaigns, measure market quality, and settle rewards through public rules.
          </span>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a href="/leaderboard" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
              View public proof →
            </a>
            <a href="#hufi-flow" class="rounded-full border border-base-content/16 bg-base-100/76 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
              Learn about HuFi →
            </a>
          </div>
        </div>

        <div class="premium-surface rounded-[1.75rem] p-3 lg:mx-auto lg:max-w-[34rem]">
          <div class="relative overflow-hidden rounded-[1.35rem] border border-base-content/10 bg-base-200/42 p-4 sm:p-5">
            <span class="ledger-grid pointer-events-none absolute inset-0 opacity-35" aria-hidden="true"></span>
            <div class="relative grid gap-3">
              <div class="rounded-[1.15rem] border border-base-content/10 bg-base-100/82 p-5 shadow-[0_20px_60px_rgba(17,17,17,0.04)]">
                <span class="micro-label block text-base-content/42">What Mr.Market provides</span>
                <span class="mt-3 block balance-font text-[2rem] font-bold leading-[0.98] tracking-[-0.045em]">
                  Turn a reward pool into measured liquidity.
                </span>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <span class="rounded-[0.85rem] border border-base-content/10 bg-base-100/86 p-3">
                  <span class="block text-[0.58rem] text-base-content/42">Pair</span>
                  <span class="data-font mt-1 block text-base font-semibold">XIN / USDT</span>
                </span>
                <span class="rounded-[0.85rem] border border-base-content/10 bg-base-100/86 p-3">
                  <span class="block text-[0.58rem] text-base-content/42">Budget</span>
                  <span class="data-font mt-1 block text-base font-semibold">$100</span>
                </span>
                <span class="rounded-[0.85rem] border border-base-content/10 bg-base-100/86 p-3">
                  <span class="block text-[0.58rem] text-base-content/42">Target</span>
                  <span class="data-font mt-1 block text-base font-semibold">$100k</span>
                </span>
              </div>

              <div class="grid gap-2">
                {#each heroCapabilities as item}
                  <article class="grid grid-cols-[2.35rem_1fr] gap-3 rounded-[1rem] border border-base-content/10 bg-base-100/86 p-3">
                    <span class="grid h-9 w-9 place-items-center rounded-full bg-base-200 data-font text-xs font-semibold text-base-content/54">
                      {item.label}
                    </span>
                    <span>
                      <span class="block text-base font-semibold leading-tight">{item.title}</span>
                      <span class="mt-1 block text-xs leading-5 text-base-content/58">{item.body}</span>
                    </span>
                  </article>
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
            Meet the product through your market need.
          </span>
        </span>
        <span class="max-w-sm text-sm leading-6 text-base-content/58">
          HuFi campaigns start the flow, Mr.Market orders work on them, and each audience enters through a different demand.
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
</main>
