<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';
  import { offeringGroups, offeringHeroStats, strategyOfferings } from '$lib/landing/data';
</script>

<svelte:head>
  <title>Mr.Market — Offerings</title>
  <meta
    name="description"
    content="Mr.Market offerings: who we serve, the services we run, and the liquidity outcomes you can pursue — from bootstrapping a new market to operating as a competitive maker."
  />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <section class="border-b quiet-rule">
    <div class="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="offerings" />

      <div class="grid gap-10 pb-16 pt-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <div class="flex flex-col gap-6">
          <span class="micro-label text-base-content/46">All offerings</span>
          <h1 class="balance-font m-0 max-w-2xl text-[3.75em] font-bold leading-[0.98] tracking-[-0.055em]">
            Here’s what we do
          </h1>
        </div>

        <div class="flex justify-start lg:justify-end">
          <div class="temple-engraving relative h-[18rem] w-full max-w-[32rem] overflow-hidden rounded-[1.6rem] border border-base-content/10 bg-[#f3efeb]">
            <span class="absolute inset-0 opacity-70 ledger-grid" aria-hidden="true"></span>
            <span class="absolute inset-x-10 bottom-10 h-3 rounded-full border border-base-content/12 bg-base-100/70" aria-hidden="true"></span>
            <span class="absolute bottom-[3.25rem] left-1/2 h-32 w-[72%] -translate-x-1/2 border-x border-base-content/14" aria-hidden="true"></span>
            <span class="absolute bottom-[11.25rem] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[10rem] border-b-[4.2rem] border-x-transparent border-b-base-content/10" aria-hidden="true"></span>
            <span class="absolute bottom-[10.95rem] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[8.8rem] border-b-[3.65rem] border-x-transparent border-b-[#f3efeb]" aria-hidden="true"></span>
            <span class="absolute bottom-[14.1rem] left-1/2 h-px w-52 -translate-x-1/2 bg-base-content/18" aria-hidden="true"></span>

            <span class="absolute bottom-[4rem] left-[21%] h-28 w-6 rounded-full border border-base-content/18 bg-base-100/72" aria-hidden="true"></span>
            <span class="absolute bottom-[4rem] left-[34%] h-28 w-6 rounded-full border border-base-content/18 bg-base-100/72" aria-hidden="true"></span>
            <span class="absolute bottom-[4rem] left-[47%] h-28 w-6 rounded-full border border-base-content/18 bg-base-100/72" aria-hidden="true"></span>
            <span class="absolute bottom-[4rem] left-[60%] h-28 w-6 rounded-full border border-base-content/18 bg-base-100/72" aria-hidden="true"></span>
            <span class="absolute bottom-[4rem] left-[73%] h-28 w-6 rounded-full border border-base-content/18 bg-base-100/72" aria-hidden="true"></span>

            <div class="absolute right-6 top-6 grid grid-cols-3 gap-2">
              {#each offeringHeroStats as stat}
                <span class="rounded-[0.8rem] border border-base-content/10 bg-base-100/72 px-3 py-2">
                  <span class="data-font block text-sm font-semibold">{stat.value}</span>
                  <span class="mt-1 block text-[0.58rem] text-base-content/44">{stat.label}</span>
                </span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
    <div class="grid border-b quiet-rule lg:grid-cols-[0.94fr_1.06fr]">
      <div class="border-b quiet-rule py-12 lg:border-b-0 lg:border-r lg:pr-12">
        {#each offeringGroups as group, groupIndex}
          <div class={groupIndex > 0 ? 'mt-14' : ''}>
            <h2 class="m-0 text-2xl font-semibold tracking-[-0.025em]">{group.title}</h2>
            <div class="mt-8 border-t quiet-rule">
              {#each group.items as item}
                <a href={`/offerings/${item.slug}`} class="offering-list-row flex items-center justify-between gap-6 border-b quiet-rule py-5 text-base-content no-underline transition duration-300 hover:pl-2 hover:no-underline">
                  <span class="text-[1.02rem] font-medium tracking-[-0.015em]">{item.label}</span>
                  <span class="text-xl text-base-content/34">›</span>
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="py-12 lg:pl-12">
        <h2 class="m-0 text-2xl font-semibold tracking-[-0.025em]">Outcomes you can pursue</h2>
        <div class="mt-8 border-t quiet-rule">
          {#each strategyOfferings as item}
            <a href={`/offerings/${item.slug}`} class="offering-list-row flex items-center justify-between gap-6 border-b quiet-rule py-5 text-base-content no-underline transition duration-300 hover:pl-2 hover:no-underline">
              <span class="text-[1.02rem] font-medium tracking-[-0.015em]">{item.label}</span>
              <span class="text-xl text-base-content/34">›</span>
            </a>
          {/each}
        </div>
      </div>
    </div>
  </section>
</main>
