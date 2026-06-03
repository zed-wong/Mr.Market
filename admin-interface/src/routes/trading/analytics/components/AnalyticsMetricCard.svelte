<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { MetricCardView } from '../analytics-view-model';

  interface Props {
    card: MetricCardView;
  }

  let { card }: Props = $props();
</script>

<div
  class="card border bg-base-100 shadow-none"
  class:border-base-300={card.status === 'available'}
  class:border-warning={card.status === 'unavailable'}
  data-testid={`analytics-card-${card.key}`}
>
  <div class="card-body gap-2 p-4">
    <span class="text-xs font-medium text-base-content/60 capitalize">{$_(card.labelKey)}</span>
    <span
      class="font-mono text-2xl font-semibold"
      class:text-base-content={card.status === 'available'}
      class:text-warning={card.status === 'unavailable'}
    >
      {card.displayValue}
    </span>
    <span class="min-h-4 text-xs text-base-content/50">
      {#if card.status === 'unavailable'}
        {$_('admin_analytics_unavailable_reason', { values: { reason: card.reason || $_('admin_unavailable') } })}
      {:else}
        {card.caption || card.currency}
      {/if}
    </span>
  </div>
</div>
