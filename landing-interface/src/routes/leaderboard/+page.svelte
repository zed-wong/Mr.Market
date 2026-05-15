<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';
  import { campaigns, epochStats, makers } from '$lib/landing/data';
</script>

<svelte:head>
  <title>Mr.Market — Maker Leaderboard</title>
  <meta
    name="description"
    content="Public leaderboard for Mr.Market market-making campaigns: maker score, spread quality, uptime, attributable volume, and rewards."
  />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <section class="relative overflow-hidden border-b quiet-rule">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_74%_10%,rgba(17,17,17,0.035),transparent_30%)]"></div>
    <div class="relative mx-auto flex max-w-7xl flex-col gap-14 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="leaderboard" />

      <div class="grid gap-10 pb-14 pt-4 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
        <div class="flex flex-col gap-6">
          <span class="micro-label w-fit text-base-content/52">
            Campaign epoch · public scoring
          </span>
          <h1 class="balance-font m-0 text-[3.75em] font-bold leading-[0.96] tracking-[-0.055em]">
            Maker leaderboard.
          </h1>
          <span class="max-w-xl text-base leading-7 text-base-content/64">
            Performance report for liquidity campaigns: spread quality, uptime, useful depth, attributed volume, and rewards.
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-4">
          {#each epochStats as stat}
            <div class="rounded-[1.15rem] border border-base-content/10 bg-base-100/72 p-4 shadow-[0_18px_48px_rgba(17,17,15,0.04)]">
              <span class="block text-xs text-base-content/48">{stat.label}</span>
              <span class="data-font mt-4 block text-3xl font-semibold leading-none">{stat.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_19rem] lg:px-10">
    <div class="overflow-hidden rounded-[1.45rem] border border-base-content/12 bg-base-100 shadow-[0_26px_80px_rgba(17,17,15,0.05)]">
      <div class="grid gap-4 border-b quiet-rule p-6 md:grid-cols-[1fr_auto] md:items-end">
        <span class="flex flex-col gap-2">
          <span class="balance-font text-4xl font-bold">Current epoch ranking</span>
          <span class="text-sm text-base-content/54">Preview data; layout prepared for API-backed campaign epochs.</span>
        </span>
        <span class="flex flex-wrap gap-2 text-xs">
          <span class="rounded-full border border-base-content/10 px-3 py-2">all pairs</span>
          <span class="rounded-full border border-base-content/10 px-3 py-2">spread + uptime</span>
          <span class="rounded-full border border-base-content bg-base-content px-3 py-2 text-base-100">rewards</span>
        </span>
      </div>

      <div class="micro-label hidden grid-cols-[4rem_1fr_5.5rem_5.5rem_5.5rem_6rem_6rem] border-b quiet-rule px-5 py-3 text-base-content/45 md:grid">
        <span>rank</span>
        <span>maker</span>
        <span class="text-right">score</span>
        <span class="text-right">spread</span>
        <span class="text-right">uptime</span>
        <span class="text-right">volume</span>
        <span class="text-right">rewards</span>
      </div>

      <div class="divide-y divide-base-content/10">
        {#each makers as maker}
          <div class="grid gap-4 p-5 md:grid-cols-[4rem_1fr_5.5rem_5.5rem_5.5rem_6rem_6rem] md:items-center">
            <span class="data-font text-4xl font-semibold text-base-content/26">{maker.rank}</span>
            <span class="flex flex-col gap-1">
              <span class="font-semibold">{maker.name}</span>
              <span class="text-xs text-base-content/50">{maker.pair} · order-scoped balance</span>
            </span>
            <span class="flex flex-col md:text-right"><span class="text-xs text-base-content/50 md:hidden">score</span><span class="data-font text-xl font-semibold">{maker.score}</span></span>
            <span class="flex flex-col md:text-right"><span class="text-xs text-base-content/50 md:hidden">spread</span><span class="data-font text-xl font-semibold">{maker.spread}</span></span>
            <span class="flex flex-col md:text-right"><span class="text-xs text-base-content/50 md:hidden">uptime</span><span class="data-font text-xl font-semibold">{maker.uptime}</span></span>
            <span class="flex flex-col md:text-right"><span class="text-xs text-base-content/50 md:hidden">volume</span><span class="data-font text-xl font-semibold">{maker.volume}</span></span>
            <span class="flex flex-col md:text-right"><span class="text-xs text-base-content/50 md:hidden">rewards</span><span class="data-font text-xl font-semibold">{maker.rewards}</span></span>
          </div>
        {/each}
      </div>
    </div>

    <aside class="flex flex-col gap-6">
      <div class="overflow-hidden rounded-[1.45rem] border border-base-content/12 bg-base-100">
        <div class="border-b quiet-rule p-5">
          <span class="micro-label block text-base-content/52">Active campaigns</span>
          <span class="mt-4 block balance-font text-4xl font-bold leading-tight">Reward pools</span>
        </div>
        <div class="divide-y divide-base-content/10">
          {#each campaigns as campaign}
            <div class="p-5">
              <div class="flex items-center justify-between gap-4">
                <span class="font-semibold">{campaign.pair}</span>
                <span class="text-xs text-base-content/50">{campaign.status}</span>
              </div>
              <div class="mt-3 flex items-end justify-between gap-4">
                <span class="text-xs text-base-content/50">{campaign.exchange}<br />target {campaign.target}</span>
                <span class="data-font text-2xl font-semibold">{campaign.pool}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="rounded-[1.45rem] border border-base-content/10 bg-base-200/52 p-5">
        <span class="micro-label block text-base-content/50">Scoring trace</span>
        <span class="mt-5 block text-sm leading-7 text-base-content/64">
          Scores should be explainable from ledger entries, reservation references, fills, uptime windows, and campaign reward rules.
        </span>
      </div>
    </aside>
  </section>
</main>
