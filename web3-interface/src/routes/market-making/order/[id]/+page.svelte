<script lang="ts">
  import { page } from '$app/stores';
  import { namespaceLabel } from '$lib/helpers/mock-web3';
  import { allCampaigns, allOrders, statusLabel } from '$lib/stores/market-making';

  let order = $derived($allOrders.find((item) => item.id === $page.params.id) ?? null);
  let campaign = $derived(order ? $allCampaigns.find((item) => item.id === order.campaignId) ?? null : null);
  let orderedLogs = $derived(order ? [...order.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : []);
</script>

<section class="space-y-6" data-testid="order-detail">
  {#if !order}
    <div class="alert alert-warning" data-testid="order-not-found">
      <span>Order not found in this mocked session. Open My Campaigns / Orders to select an in-scope order.</span>
      <a class="btn btn-sm btn-primary" href="/market-making">Open My Orders</a>
    </div>
  {:else}
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-2xl font-bold">{order.id}</span>
          <span class="text-base-content/70">{campaign?.name ?? 'Unknown campaign'} · {namespaceLabel(order.namespace)} · {order.assets}</span>
        </div>
        <span class="badge badge-outline">{statusLabel(order.status)}</span>
      </div>
      <div class="grid gap-3 md:grid-cols-4" data-testid="order-detail-summary">
        <span class="rounded-box border border-base-300 bg-base-200 p-3">Contribution<br /><strong>{order.contributionAmount}</strong></span>
        <span class="rounded-box border border-base-300 bg-base-200 p-3">Fee estimate<br /><strong>{order.feeEstimate}</strong></span>
        <span class="rounded-box border border-base-300 bg-base-200 p-3">Liquidity contribution<br /><strong>{order.liquidityContribution}</strong></span>
        <span class="rounded-box border border-base-300 bg-base-200 p-3">Participation<br /><strong>{order.participation}</strong></span>
      </div>
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-4" data-testid="order-metrics">
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Created volume<br /><strong>{order.createdVolume}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Profit<br /><strong>{order.profit}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Placed orders<br /><strong>{order.placedOrders}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Filled amount<br /><strong>{order.filledAmount}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Success count<br /><strong>{order.successCount}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Failure count<br /><strong>{order.failureCount}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Cancel count<br /><strong>{order.cancelCount}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Status<br /><strong>{statusLabel(order.status)}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Expected volume<br /><strong>{order.expectedVolume}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Expected profit<br /><strong>{order.expectedProfit}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Created at<br /><strong>{order.createdAt}</strong></span>
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Updated at<br /><strong>{order.updatedAt}</strong></span>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="order-lifecycle-actions">
    <div class="card-body gap-3">
      <span class="font-semibold">Lifecycle state actions</span>
      <span class="text-base-content/70">
        Status {statusLabel(order.status)} keeps actions deterministic for the UI-only prototype.
      </span>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline" disabled={order.status !== 'draft'}>Resume draft</button>
        <button class="btn btn-outline" disabled={order.status !== 'active'}>Pause mocked placement</button>
        <button class="btn btn-outline btn-error" disabled={order.status === 'completed' || order.status === 'failed' || order.status === 'cancelled'}>Cancel mocked order</button>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="order-log-timeline">
    <div class="card-body gap-3">
      <span class="font-semibold">Mock execution log timeline</span>
      <ul class="timeline timeline-vertical">
        {#each orderedLogs as log, index}
          <li data-testid="order-log-row">
            {#if index > 0}<hr />{/if}
            <div class="timeline-start">{log.timestamp}</div>
            <div class="timeline-middle">●</div>
            <div class="timeline-end">
              <span class="font-semibold">{log.label}</span>
              <span class="block text-sm text-base-content/60">{statusLabel(log.status)} · {log.outcome}</span>
            </div>
            {#if index < orderedLogs.length - 1}<hr />{/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
  {/if}
</section>
