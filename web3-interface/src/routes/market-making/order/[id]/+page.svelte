<script lang="ts">
  import { page } from '$app/stores';
  import { mockCampaigns, mockOrders, namespaceLabel } from '$lib/helpers/mock-web3';

  let order = $derived(mockOrders.find((item) => item.id === $page.params.id) ?? mockOrders[0]);
  let campaign = $derived(mockCampaigns.find((item) => item.id === order.campaignId) ?? mockCampaigns[0]);
</script>

<section class="space-y-6" data-testid="order-detail">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-2xl font-bold">{order.id}</span>
          <span class="text-base-content/70">{campaign.name} · {namespaceLabel(order.namespace)} · {order.assets}</span>
        </div>
        <span class="badge badge-outline">{order.status}</span>
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
    <span class="rounded-box border border-base-300 bg-base-100 p-4">Status<br /><strong>{order.status}</strong></span>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="order-log-timeline">
    <div class="card-body gap-3">
      <span class="font-semibold">Mock execution log timeline</span>
      <ul class="timeline timeline-vertical">
        <li><div class="timeline-start">09:00</div><div class="timeline-middle">●</div><div class="timeline-end">Order created</div><hr /></li>
        <li><hr /><div class="timeline-start">09:01</div><div class="timeline-middle">●</div><div class="timeline-end">Mock approval and signing completed</div><hr /></li>
        <li><hr /><div class="timeline-start">09:05</div><div class="timeline-middle">●</div><div class="timeline-end">Placement cycle updated status to {order.status}</div></li>
      </ul>
    </div>
  </div>
</section>
