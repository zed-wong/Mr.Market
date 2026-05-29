<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    void goto('/app/market-making/order/new', { replaceState: true });
  });
</script>

<section class="pt-2 max-w-xl" data-testid="legacy-create-replaced">
  <span class="eyebrow">Replaced route</span>
  <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Opening the new order form</span>
  <span class="mt-4 block text-base-content/60">
    Market-making setup now starts with an order, strategy, pair/spec, and order-attributed deposit.
  </span>
  <a class="btn-pill-primary mt-6 inline-flex" href="/app/market-making/order/new">Create order →</a>
</section>
