<script lang="ts">
  import { page } from '$app/stores';
  import Section from '$lib/components/common/Section.svelte';
  import { namespaceLabel } from '$lib/helpers/mock-web3';
  import {
    allCampaigns,
    allOrders,
    canPauseOrder,
    canResumeOrder,
    canStopOrder,
    statusLabel,
    transitionOrderLifecycle,
    type OrderLifecycleAction,
  } from '$lib/stores/market-making';

  let order = $derived($allOrders.find((item) => item.id === $page.params.id) ?? null);
  let campaign = $derived(order ? $allCampaigns.find((item) => item.id === order.campaignId) ?? null : null);
  let orderedLogs = $derived(order ? [...order.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : []);

  const runLifecycleAction = (action: OrderLifecycleAction) => {
    if (!order) return;
    transitionOrderLifecycle(order.id, action);
  };
</script>

<div data-testid="order-detail">
  {#if !order}
    <section class="pt-2 max-w-xl" data-testid="order-not-found">
      <span class="eyebrow">Not found</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Order not found</span>
      <span class="mt-4 block text-base-content/60">
        Open My Campaigns / Orders to select an in-scope order.
      </span>
      <a class="btn-pill-primary mt-6 inline-flex" href="/market-making">My orders</a>
    </section>
  {:else}
    <section class="pt-2">
      <span class="eyebrow">{statusLabel(order.status)}</span>
      <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content font-mono-num">{order.id}</span>
      <span class="mt-4 block text-base-content/60">
        {campaign?.name ?? 'Unknown campaign'} · {namespaceLabel(order.namespace)} · {order.assets}
      </span>

      <div class="mt-8 grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-2 lg:grid-cols-4" data-testid="order-detail-summary">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Contribution</span>
          <span class="mt-2 block font-mono-num text-xl">{order.contributionAmount}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Fee estimate</span>
          <span class="mt-2 block font-mono-num text-xl">{order.feeEstimate}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Liquidity</span>
          <span class="mt-2 block font-mono-num text-xl">{order.liquidityContribution}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Participation</span>
          <span class="mt-2 block text-xl capitalize">{order.participation}</span>
        </div>
      </div>
    </section>

    <Section title="Metrics" eyebrow="Execution">
      <div class="grid gap-x-6 gap-y-5 border-t border-base-300 pt-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="order-metrics">
        {#each [
          ['Created volume', order.createdVolume],
          ['Profit', order.profit],
          ['Placed orders', order.placedOrders],
          ['Filled amount', order.filledAmount],
          ['Success count', order.successCount],
          ['Failure count', order.failureCount],
          ['Cancel count', order.cancelCount],
          ['Status', statusLabel(order.status)],
          ['Expected volume', order.expectedVolume],
          ['Expected profit', order.expectedProfit],
          ['Created at', order.createdAt],
          ['Updated at', order.updatedAt],
        ] as [label, value]}
          <div class="flex flex-col">
            <span class="eyebrow">{label}</span>
            <span class="mt-1 font-mono-num text-sm text-base-content">{value}</span>
          </div>
        {/each}
      </div>
    </Section>

    <Section title="Lifecycle" eyebrow="Actions" caption={`Status ${statusLabel(order.status)} keeps actions deterministic for the UI-only prototype and records each local transition.`}>
      <div class="flex flex-wrap gap-2 border-t border-base-300 pt-6" data-testid="order-lifecycle-actions">
        <button
          class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canResumeOrder(order.status)}
          onclick={() => runLifecycleAction('resume')}
          data-testid="order-resume-action"
        >
          Resume placement
        </button>
        <button
          class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canPauseOrder(order.status)}
          onclick={() => runLifecycleAction('pause')}
          data-testid="order-pause-action"
        >
          Pause placement
        </button>
        <button
          class="btn-pill disabled:opacity-40 disabled:cursor-not-allowed border border-error/50 text-error hover:bg-error hover:text-error-content"
          disabled={!canStopOrder(order.status)}
          onclick={() => runLifecycleAction('stop')}
          data-testid="order-stop-action"
        >
          Stop order
        </button>
      </div>
    </Section>

    <Section title="Log timeline" eyebrow="Mock execution">
      <div class="border-t border-base-300" data-testid="order-log-timeline">
        {#each orderedLogs as log}
          <div class="flex items-start gap-4 border-b border-base-300 py-4" data-testid="order-log-row">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"></span>
            <div class="flex flex-1 flex-wrap items-baseline justify-between gap-2">
              <div class="flex flex-col">
                <span class="font-medium text-base-content">{log.label}</span>
                <span class="text-xs text-base-content/55">{statusLabel(log.status)} · {log.outcome}</span>
              </div>
              <span class="font-mono-num text-xs text-base-content/50">{log.timestamp}</span>
            </div>
          </div>
        {/each}
      </div>
    </Section>
  {/if}
</div>
