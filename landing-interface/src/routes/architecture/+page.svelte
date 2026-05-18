<script lang="ts">
  import LandingNav from '$lib/landing/LandingNav.svelte';
  import { architectureInvariants, architectureLayers } from '$lib/landing/data';
</script>

<svelte:head>
  <title>Mr.Market — Architecture</title>
  <meta
    name="description"
    content="Mr.Market architecture: three layers — funding, scheduling, trading — bound by an immutable, order-scoped ledger and strict execution boundaries."
  />
</svelte:head>

<main class="min-h-screen bg-base-100 text-base-content" data-theme="landing-light">
  <!-- HERO -->
  <section class="border-b quiet-rule">
    <div class="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-6 sm:px-8 lg:px-10">
      <LandingNav active="architecture" />

      <div class="grid gap-10 pb-16 pt-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <div class="flex flex-col gap-6">
          <span class="micro-label text-base-content/46">The architecture</span>
          <h1 class="balance-font m-0 max-w-2xl text-[3.75em] font-bold leading-[0.98] tracking-[-0.055em]">
            How Mr.Market is built.
          </h1>
          <span class="max-w-xl text-[1.06rem] leading-8 text-base-content/66">
            Three layers. One ledger. Strict boundaries between intent and execution. The system that turns liquidity into a public workflow.
          </span>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a href="https://mr-market-app.onrender.com" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
              Open App
            </a>
            <a href="/offerings" class="rounded-full border border-base-content/18 bg-base-100/70 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
              View offerings →
            </a>
          </div>
        </div>

        <div class="flex justify-start lg:justify-end">
          <div class="relative h-[18rem] w-full max-w-[32rem] overflow-hidden rounded-[1.6rem] border border-base-content/10 bg-[#f3efeb]">
            <span class="absolute inset-0 opacity-70 ledger-grid" aria-hidden="true"></span>

            <!-- three stacked layer rails -->
            <span class="absolute left-10 right-10 top-[3.25rem] flex items-center justify-between text-[0.6rem] font-semibold tracking-[0.18em] text-base-content/40">
              <span>funding</span><span>scheduling</span><span>trading</span>
            </span>
            <span class="absolute left-10 right-10 top-[4.75rem] h-px bg-base-content/14" aria-hidden="true"></span>
            <span class="absolute left-10 right-10 top-[8.75rem] h-px bg-base-content/14" aria-hidden="true"></span>
            <span class="absolute left-10 right-10 top-[12.75rem] h-px bg-base-content/14" aria-hidden="true"></span>

            <!-- single ledger spine -->
            <span class="absolute bottom-6 left-10 right-10 h-3 rounded-full border border-base-content/14 bg-base-100/72" aria-hidden="true"></span>
            <span class="absolute bottom-[2.4rem] left-10 right-10 text-center text-[0.6rem] font-semibold tracking-[0.22em] text-base-content/44">
              ledger · order-scoped
            </span>

            <!-- intent ticks -->
            <span class="absolute left-[24%] top-[5.4rem] h-[6.5rem] w-px bg-base-content/22" aria-hidden="true"></span>
            <span class="absolute left-[50%] top-[5.4rem] h-[6.5rem] w-px bg-base-content/22" aria-hidden="true"></span>
            <span class="absolute left-[76%] top-[5.4rem] h-[6.5rem] w-px bg-base-content/22" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- THREE LAYERS — sparse list rows -->
  <section class="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
    <div class="border-b quiet-rule py-14">
      <div class="flex items-end justify-between gap-6">
        <span>
          <span class="micro-label block text-base-content/50">The three layers</span>
          <span class="mt-4 block balance-font text-3xl font-bold leading-tight sm:text-4xl">A pipeline you can read top to bottom.</span>
        </span>
        <span class="hidden text-xs text-base-content/44 sm:block">03 layers</span>
      </div>

      <div class="mt-10 border-t quiet-rule">
        {#each architectureLayers as layer}
          <div class="grid gap-4 border-b quiet-rule py-7 sm:grid-cols-[4rem_1fr_1.4fr] sm:items-start sm:gap-10">
            <span class="data-font text-3xl font-semibold text-base-content/32">{layer.index}</span>
            <span>
              <span class="block balance-font text-[1.4rem] font-bold leading-tight tracking-[-0.02em]">{layer.name}</span>
              <span class="mt-2 block text-sm text-base-content/56">{layer.role}</span>
            </span>
            <span class="text-[0.98rem] leading-7 text-base-content/68">{layer.detail}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- INVARIANTS -->
  <section class="border-b quiet-rule bg-base-200/42">
    <div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <div class="flex flex-col gap-5">
        <span class="micro-label text-base-content/50">Invariants</span>
        <span class="balance-font max-w-3xl text-4xl font-bold leading-[1.06] sm:text-5xl">
          Rules the system never breaks.
        </span>
        <span class="max-w-2xl text-sm leading-7 text-base-content/62">
          Each invariant is enforced in code, not in convention. They are why every balance, every fill, and every reward can be traced back to a specific order.
        </span>
      </div>

      <div class="mt-10 grid gap-px overflow-hidden rounded-[1.45rem] border border-base-content/12 bg-base-content/12 sm:grid-cols-2 lg:grid-cols-3">
        {#each architectureInvariants as item, index}
          <div class="flex flex-col gap-3 bg-base-100 p-7 sm:p-8">
            <span class="data-font text-sm text-base-content/34">0{index + 1}</span>
            <span class="balance-font block text-[1.2rem] font-bold leading-tight tracking-[-0.02em]">{item.heading}</span>
            <span class="text-[0.96rem] leading-7 text-base-content/68">{item.body}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- CLOSING CTA -->
  <section class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
    <div class="flex flex-col gap-8 rounded-[1.45rem] border border-base-content/12 bg-base-200/52 p-10 sm:p-14">
      <span class="balance-font max-w-3xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.6rem]">
        An engine you can audit. A market you can rely on.
      </span>
      <div class="flex flex-col gap-3 sm:flex-row">
        <a href="https://mr-market-app.onrender.com" class="rounded-full border border-base-content bg-base-content px-6 py-3 text-[0.68rem] font-bold text-base-100 capitalize no-underline hover:no-underline">
          Open App
        </a>
        <a href="/offerings" class="rounded-full border border-base-content/18 bg-base-100 px-6 py-3 text-[0.68rem] font-bold text-base-content capitalize no-underline hover:no-underline">
          View offerings →
        </a>
      </div>
    </div>
  </section>

  <footer class="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs opacity-54 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
    <span>Mr.Market · architecture</span>
    <span>Open · measurable · permissionless</span>
  </footer>
</main>
