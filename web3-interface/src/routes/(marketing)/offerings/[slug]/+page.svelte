<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';
  import { offeringPages } from '$lib/landing/data';

  export let data;

  $: page = data.page;

  const groupLabel: Record<string, string> = {
    audience: 'Who we serve',
    service: 'Services we offer',
    outcome: 'Outcomes you can pursue',
  };

  $: related = offeringPages
    .filter((p) => p.group === page.group && p.slug !== page.slug)
    .slice(0, 4);
</script>

<svelte:head>
  <title>{page.title} — Mr.Market</title>
  <meta name="description" content={page.tagline} />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <!-- TOP NAV + HERO -->
  <section class="border-b quiet-rule">
    <div class="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="offerings" />

      <div class="flex flex-col gap-7 pb-20 pt-10">
        <div class="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold text-base-content/52">
          <a href="/offerings" class="capitalize text-base-content/52 no-underline hover:text-base-content hover:no-underline">Offerings</a>
          <span aria-hidden="true">/</span>
          <span class="capitalize">{groupLabel[page.group]}</span>
        </div>

        <h1 class="balance-font m-0 max-w-4xl text-[3.25em] font-bold leading-[1.02] tracking-[-0.05em] sm:text-[4.25em] sm:leading-[0.98]">
          {page.title}
        </h1>

        <span class="max-w-2xl text-[1.06rem] leading-8 text-base-content/66">
          {page.tagline}
        </span>

        <div class="mt-1 flex flex-col gap-3 sm:flex-row">
          <a href="/app" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
            Talk to the team →
          </a>
          {#if page.cta}
            <a href={page.cta.href} class="rounded-full border border-base-content/18 bg-base-100/70 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
              {page.cta.text}
            </a>
          {:else}
            <a href="/offerings" class="rounded-full border border-base-content/18 bg-base-100/70 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
              ← All offerings
            </a>
          {/if}
        </div>

        {#if page.quote}
          <div class="mt-10 max-w-3xl border-l-2 border-base-content/22 pl-6">
            <span class="balance-font block text-[1.4rem] font-medium leading-[1.4] text-base-content/82 sm:text-[1.65rem]">
              "{page.quote.text}"
            </span>
            {#if page.quote.attribution}
              <span class="mt-3 block text-sm text-base-content/52">— {page.quote.attribution}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- DESCRIPTION (service / outcome only) -->
  {#if page.description}
    <section class="border-b quiet-rule">
      <div class="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.36fr_1fr] lg:px-10">
        <div class="flex flex-col gap-3">
          <span class="micro-label text-base-content/50">Overview</span>
        </div>
        <div class="flex flex-col gap-6">
          <h2 class="balance-font m-0 max-w-3xl text-[2rem] font-bold leading-[1.15] tracking-[-0.03em] sm:text-[2.4rem]">
            {page.description.heading}
          </h2>
          <span class="max-w-3xl text-[1.02rem] leading-8 text-base-content/72">
            {page.description.body}
          </span>
        </div>
      </div>
    </section>
  {/if}

  <!-- GRID (helps / highlights) -->
  <section class="border-b quiet-rule bg-base-200/42">
    <div class="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-20 sm:px-8 lg:px-10">
      <div class="flex flex-wrap items-end justify-between gap-6">
        <h2 class="balance-font m-0 max-w-3xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.6rem]">
          {page.grid.label}
        </h2>
        <span class="micro-label text-base-content/48">
          {page.grid.items.length} {page.grid.items.length === 1 ? 'point' : 'points'}
        </span>
      </div>

      <div class="grid gap-px overflow-hidden rounded-[1.45rem] border border-base-content/12 bg-base-content/12 sm:grid-cols-2 lg:grid-cols-3">
        {#each page.grid.items as item}
          <div class="flex flex-col gap-3 bg-base-100 p-7 sm:p-8">
            <h3 class="balance-font m-0 text-[1.25rem] font-bold leading-tight tracking-[-0.02em]">
              {item.heading}
            </h3>
            <span class="block text-[0.96rem] leading-7 text-base-content/68">
              {item.body}
            </span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- RELATED -->
  {#if related.length > 0}
    <section class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <div class="flex items-end justify-between gap-6">
        <div class="flex flex-col gap-3">
          <span class="micro-label text-base-content/50">More from {groupLabel[page.group].toLowerCase()}</span>
          <span class="balance-font text-3xl font-bold leading-tight">Explore related offerings.</span>
        </div>
        <a href="/offerings" class="hidden rounded-full border border-base-content/18 bg-base-100 px-5 py-2.5 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline sm:inline-flex">
          See all →
        </a>
      </div>

      <div class="mt-8 grid gap-3 border-t quiet-rule pt-4 md:grid-cols-2">
        {#each related as item}
          <a href={`/offerings/${item.slug}`} class="offering-list-row flex items-center justify-between gap-6 border-b quiet-rule py-5 text-base-content no-underline transition duration-300 hover:pl-2 hover:no-underline">
            <span class="text-[1.02rem] font-medium tracking-[-0.015em]">{item.label}</span>
            <span class="text-xl text-base-content/34">›</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <!-- CLOSING CTA (Titan-style "We'd love to work with you") -->
  <section class="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10">
    <div class="flex flex-col gap-8 rounded-[1.45rem] border border-base-content/12 bg-base-200/52 p-10 sm:p-14">
      <span class="balance-font max-w-4xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[3rem]">
        {#if page.group === 'audience'}
          We'd love to work with you.
        {:else if page.group === 'service'}
          Put this to work for your campaign.
        {:else}
          Start with this outcome in mind.
        {/if}
      </span>
      <div class="flex flex-col gap-3 sm:flex-row">
        <a href="/app" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
          Open the app →
        </a>
        <a href="/offerings" class="rounded-full border border-base-content/18 bg-base-100 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
          ← Back to offerings
        </a>
      </div>
    </div>
  </section>

  <footer class="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs opacity-54 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
    <span>Mr.Market · offerings</span>
    <span>Open · measurable · permissionless</span>
  </footer>
</main>
