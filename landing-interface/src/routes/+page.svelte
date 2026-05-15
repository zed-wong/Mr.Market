<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';
  import { epochStats, makers } from '$lib/landing/data';

  const coreSteps = [
    {
      name: 'Campaign',
      label: 'capital mandate',
      text: 'A project opens a public liquidity target, reward pool, and scoring rule.',
    },
    {
      name: 'Competition',
      label: 'maker quality',
      text: 'Makers compete on durable spread, useful depth, uptime, and settled volume.',
    },
    {
      name: 'Leaderboard',
      label: 'public attribution',
      text: 'Market quality becomes visible before rewards are distributed.',
    },
  ];

  const coreClaims = [
    'Public campaigns for markets that need real liquidity',
    'Maker ranking based on measurable quality, not private access',
    'Rewards connected to attributed depth, spread, uptime, and fills',
  ];

  const topMakers = makers.slice(0, 3);
</script>

<svelte:head>
  <title>Mr.Market — Liquidity Access Layer</title>
  <meta
    name="description"
    content="Mr.Market turns liquidity campaigns into visible, measurable market-making infrastructure."
  />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <section class="relative overflow-hidden border-b quiet-rule">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_74%_10%,rgba(17,17,17,0.035),transparent_30%)]"></div>
    <div class="relative mx-auto flex max-w-7xl flex-col gap-16 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="landing" />

      <div class="grid gap-12 pb-16 pt-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div class="flex max-w-[43rem] flex-col gap-7">
          <span class="micro-label w-fit text-base-content/52">
            Market-making engine
          </span>
          <h1 class="balance-font m-0 block text-[3.75em] font-bold leading-[0.96] tracking-[-0.055em]">
            Democratized market-making engine.
          </h1>
          <span class="max-w-[38rem] text-[1.06rem] leading-8 text-base-content/66">
            Permissionless liquidity campaigns. Automated market-making execution. Open-source runtime, protected by TEE.
          </span>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a href="/leaderboard" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold tracking-[0.16em] text-base-100 capitalize no-underline hover:no-underline">
              View leaderboard →
            </a>
            <a href="/offerings" class="rounded-full border border-base-content/18 bg-base-100/70 px-6 py-3 text-[0.68rem] font-bold tracking-[0.16em] text-base-content capitalize no-underline hover:no-underline">
              View offerings →
            </a>
          </div>
        </div>

        <div class="premium-surface overflow-hidden rounded-[1.75rem] p-4 sm:p-5">
          <div class="liquidity-object relative min-h-[30rem] overflow-hidden rounded-[1.35rem] p-6 text-base-100 sm:p-8">
            <span class="ledger-grid pointer-events-none absolute inset-0 opacity-20"></span>
            <span class="pointer-events-none absolute inset-x-8 top-1/2 border-t border-base-100/12"></span>
            <span class="pointer-events-none absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-base-content to-transparent opacity-80"></span>

            <div class="relative flex items-start justify-between gap-6">
              <span>
                <span class="micro-label block text-base-100/50">live campaign</span>
                <span class="data-font mt-3 block text-4xl font-semibold leading-none">XIN / USDT</span>
              </span>
              <span class="rounded-full border border-base-100/18 px-3 py-1 text-[0.68rem] text-base-100/62">epoch 04</span>
            </div>

            <div class="relative mt-14 grid gap-5 sm:grid-cols-[1fr_0.86fr] sm:items-end">
              <div class="rounded-[1.2rem] border border-base-100/14 bg-base-100/8 p-5 backdrop-blur-sm">
                <div class="flex items-center justify-between text-xs text-base-100/56">
                  <span>market depth</span>
                  <span>target zone</span>
                </div>
                <div class="relative mt-8 h-40 overflow-hidden rounded-[1rem] border border-base-100/10 bg-base-content/55">
                  <span class="absolute inset-x-0 top-1/2 border-t border-base-100/16"></span>
                  <span class="depth-curve absolute inset-x-0 bottom-0 h-36 bg-base-100/72"></span>
                  <span class="depth-curve absolute inset-x-0 bottom-0 h-28 translate-y-5 bg-base-100/22"></span>
                  <span class="absolute left-1/2 top-5 h-28 border-l border-base-100/28"></span>
                </div>
              </div>

              <div class="grid gap-3">
                <div class="rounded-[1rem] border border-base-100/14 bg-base-100/8 p-4">
                  <span class="text-xs text-base-100/50">capital target</span>
                  <span class="data-font mt-2 block text-3xl font-semibold">$500k</span>
                </div>
                <div class="rounded-[1rem] border border-base-100/14 bg-base-100/8 p-4">
                  <span class="text-xs text-base-100/50">spread goal</span>
                  <span class="data-font mt-2 block text-3xl font-semibold">≤20 bps</span>
                </div>
              </div>
            </div>

            <div class="relative mt-8 grid gap-3 sm:grid-cols-3">
              {#each coreSteps as step, index}
                <span class="rounded-full border border-base-100/14 bg-base-100/8 px-4 py-3 text-sm text-base-100/78 backdrop-blur-sm">
                  <span class="data-font mr-2 font-semibold text-base-100">0{index + 1}</span>{step.name}
                </span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="border-b quiet-rule">
    <div class="mx-auto grid max-w-7xl gap-3 px-5 py-6 sm:px-8 lg:grid-cols-3 lg:px-10">
      {#each coreClaims as claim}
        <span class="border-b quiet-rule py-4 text-sm leading-6 text-base-content/68 lg:border-b-0 lg:border-r lg:pr-8 last:lg:border-r-0">
          {claim}
        </span>
      {/each}
    </div>
  </section>

  <section id="how" class="border-b quiet-rule bg-base-200/42">
    <div class="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10">
      <div class="flex flex-col gap-5">
        <span class="micro-label text-base-content/50">The core loop</span>
        <span class="balance-font text-5xl font-bold leading-[1.04]">Capital becomes measurable liquidity.</span>
        <span class="max-w-sm text-sm leading-7 text-base-content/62">
          A campaign is not a private deal. It is a public mandate with market-quality attribution.
        </span>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        {#each coreSteps as step, index}
          <div class="rounded-[1.45rem] border border-base-content/12 bg-base-100/72 p-6 {index === 1 ? 'shadow-[0_24px_70px_rgba(17,17,15,0.08)]' : ''}">
            <span class="data-font text-4xl font-semibold text-base-content/28">0{index + 1}</span>
            <span class="mt-10 block balance-font text-3xl font-bold leading-none">{step.name}</span>
            <span class="mt-3 block text-xs text-base-content/46">{step.label}</span>
            <span class="mt-5 block text-sm leading-6 text-base-content/62">{step.text}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_20rem] lg:px-10">
    <div class="overflow-hidden rounded-[1.45rem] border border-base-content/12 bg-base-100">
      <div class="grid gap-3 border-b quiet-rule p-6 md:grid-cols-[1fr_auto] md:items-end">
        <span>
          <span class="micro-label block text-base-content/50">Public proof</span>
          <span class="mt-4 block balance-font text-4xl font-bold leading-none">Top makers this epoch</span>
        </span>
        <a href="/leaderboard" class="rounded-full border border-base-content bg-base-content px-5 py-2.5 text-[0.68rem] font-bold tracking-[0.16em] text-base-100 capitalize no-underline hover:no-underline">
          Open leaderboard →
        </a>
      </div>
      <div class="divide-y divide-base-content/10">
        {#each topMakers as maker}
          <div class="grid gap-4 p-5 sm:grid-cols-[4rem_1fr_5rem_6rem_6rem] sm:items-center">
            <span class="data-font text-4xl font-semibold text-base-content/28">{maker.rank}</span>
            <span>
              <span class="block font-semibold">{maker.name}</span>
              <span class="text-xs text-base-content/50">{maker.pair}</span>
            </span>
            <span class="data-font text-xl font-semibold sm:text-right">{maker.score}</span>
            <span class="data-font text-xl font-semibold sm:text-right">{maker.spread}</span>
            <span class="data-font text-xl font-semibold sm:text-right">{maker.rewards}</span>
          </div>
        {/each}
      </div>
    </div>

    <aside class="grid gap-4">
      {#each epochStats as stat}
        <div class="rounded-[1.25rem] border border-base-content/10 bg-base-200/54 p-5">
          <span class="text-xs text-base-content/48">{stat.label}</span>
          <span class="data-font mt-4 block text-3xl font-semibold leading-none">{stat.value}</span>
        </div>
      {/each}
    </aside>
  </section>

  <section id="mechanism" class="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10">
    <div class="rounded-[1.45rem] border border-base-content/12 bg-base-200/52 p-7 sm:p-9">
      <span class="micro-label block text-base-content/48">One-sentence thesis</span>
      <span class="mt-6 block max-w-5xl balance-font text-4xl font-bold leading-[1.06] sm:text-5xl">
        Liquidity access should be earned and measured in public, not allocated by private relationships.
      </span>
    </div>
  </section>

  <footer class="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs opacity-54 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
    <span>Mr.Market · landing-interface</span>
    <span>Campaigns · makers · scores · rewards</span>
  </footer>
</main>
