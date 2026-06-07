<script lang="ts">
  import { AreaChart } from 'layerchart';
  import { scalePoint } from 'd3-scale';
  import { _ } from 'svelte-i18n';
  import type { ChartSectionView } from '../analytics-view-model';

  interface Props {
    section: ChartSectionView;
  }

  let { section }: Props = $props();

  const palette: Record<ChartSectionView['key'], string> = {
    pnl: 'var(--color-success)',
    inventory: 'var(--color-info)',
    drawdown: 'var(--color-warning)',
    timeline: 'var(--color-primary)',
  };

  let chartData = $derived(section.points);
</script>

<div class="card border border-base-300 bg-base-100 shadow-none" data-testid={`analytics-chart-${section.key}`}>
  <div class="card-body gap-4 p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-lg font-semibold text-base-content capitalize">{$_(section.titleKey)}</span>
        <span class="text-xs text-base-content/50">{section.summary}</span>
      </div>
      {#if section.status === 'unavailable'}
        <span class="badge badge-warning badge-outline capitalize">{$_('admin_unavailable')}</span>
      {/if}
    </div>

    {#if chartData.length === 0}
      <div class="flex h-[220px] items-center justify-center rounded-xl border border-base-300 bg-base-200">
        <span class="text-sm text-base-content/60">
          {section.unavailableReason || $_('admin_analytics_empty_chart')}
        </span>
      </div>
    {:else}
      <div class="h-[220px]" aria-label={`${$_(section.titleKey)} · ${section.summary}`}>
        <AreaChart
          data={chartData}
          x="index"
          xScale={scalePoint()}
          y="value"
          yBaseline={0}
          yNice
          series={[
            {
              key: section.key,
              value: 'value',
              color: palette[section.key],
            },
          ]}
          props={{
            area: { fillOpacity: 0.12 },
            line: { strokeWidth: 2.5 },
          }}
          axis={false}
          grid={false}
          rule={false}
          legend={false}
          tooltipContext={false}
          highlight={false}
        />
      </div>
    {/if}

    {#if section.events && section.events.length > 0}
      <div class="overflow-x-auto rounded-xl border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>{$_('admin_analytics_timeline_type')}</th>
              <th>{$_('admin_analytics_timeline_time')}</th>
              <th>{$_('admin_analytics_timeline_status')}</th>
              <th>{$_('admin_analytics_timeline_source')}</th>
            </tr>
          </thead>
          <tbody>
            {#each section.events as event (event.id)}
              <tr>
                <td><span class="badge badge-ghost capitalize">{event.type}</span></td>
                <td class="font-mono text-xs">{event.at || $_('admin_unavailable')}</td>
                <td class="capitalize">{event.status || $_('admin_unavailable')}</td>
                <td class="font-mono text-xs">{event.sourceRef.type}:{event.sourceRef.id}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
