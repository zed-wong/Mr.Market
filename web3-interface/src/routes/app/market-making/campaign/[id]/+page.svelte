<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    void goto('/app/market-making', { replaceState: true });
  });
</script>

<section class="pt-2 max-w-xl" data-testid="legacy-detail-replaced">
  <span class="eyebrow">Replaced route</span>
  <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Open market-making orders instead</span>
  <span class="mt-4 block text-base-content/60">
    This old market-making URL has been replaced by server-backed order list, create, and detail flows.
  </span>
  <a class="btn-pill-primary mt-6 inline-flex" href="/app/market-making">Open orders →</a>
</section>
