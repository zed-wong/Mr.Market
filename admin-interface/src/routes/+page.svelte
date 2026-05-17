<script lang="ts">
  import { _ } from 'svelte-i18n';
  import KpiCard from './components/KpiCard.svelte';
  import Sparkline from './components/Sparkline.svelte';
  import {
    kpis,
    strategies,
    intents,
    system,
    allocations,
    flowSeries,
    lastUpdated,
  } from './components/dashboard-mock';

  let timeRange = $state<'1h' | '24h' | '7d' | '30d'>('24h');

  const statusDot: Record<string, string> = {
    healthy: 'bg-success',
    delayed: 'bg-warning',
    paused: 'bg-base-content/30',
    error: 'bg-error',
    ok: 'bg-success',
    pending: 'bg-warning',
    failed: 'bg-error',
    warn: 'bg-warning',
  };

  const intentTone: Record<string, string> = {
    fill: 'bg-success/10 text-success',
    place: 'bg-info/10 text-info',
    cancel: 'bg-base-content/5 text-base-content/60',
    rebalance: 'bg-warning/10 text-warning',
    reward: 'bg-accent/15 text-accent',
    withdraw: 'bg-error/10 text-error',
  };

  const ranges: Array<'1h' | '24h' | '7d' | '30d'> = ['1h', '24h', '7d', '30d'];
</script>

<section class="space-y-6" data-testid="admin-dashboard-shell">
  <!-- Header -->
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-base-content/50 capitalize tracking-wide">
        {$_('admin.nav.dashboard')}
      </span>
      <span class="text-2xl font-semibold tracking-tight text-base-content md:text-3xl capitalize">
        {$_('admin.dashboard_overview')}
      </span>
      <span class="text-sm text-base-content/60">
        {$_('admin.dashboard_subtitle')}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <div class="join">
        {#each ranges as r (r)}
          <button
            type="button"
            class="btn btn-sm join-item border-base-300 bg-base-100 font-mono text-xs"
            class:btn-primary={timeRange === r}
            onclick={() => (timeRange = r)}
          >
            {r}
          </button>
        {/each}
      </div>
      <button type="button" class="btn btn-ghost btn-sm rounded-full gap-2 capitalize">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="h-4 w-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        <span>refresh</span>
      </button>
      <span class="hidden text-xs text-base-content/50 md:inline">
        updated <span class="font-mono">{lastUpdated}</span>
      </span>
    </div>
  </div>

  <!-- KPI row -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {#each kpis as kpi (kpi.key)}
      <KpiCard
        label={kpi.label}
        value={kpi.value}
        unit={kpi.unit}
        deltaPct={kpi.deltaPct}
        series={kpi.series}
      />
    {/each}
  </div>

  <!-- Strategy Health + Recent Intents -->
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <!-- Strategy Health (spans 3) -->
    <div class="card border border-base-300 bg-base-100 shadow-none xl:col-span-3">
      <div class="card-body gap-4 p-5">
        <div class="flex items-center justify-between">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
            strategy health
          </span>
          <button class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/60">
            view all →
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="text-xs font-medium uppercase tracking-wide text-base-content/50 border-b border-base-300">
                <th class="font-medium">strategy</th>
                <th class="font-medium">status</th>
                <th class="font-medium text-right">24h pnl</th>
                <th class="font-medium text-right">inv. bps</th>
                <th class="font-medium text-right">spread</th>
                <th class="font-medium text-right">fills</th>
              </tr>
            </thead>
            <tbody>
              {#each strategies as s (s.id)}
                <tr class="border-b border-base-300 hover:bg-neutral">
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-base-content capitalize">{s.name}</span>
                      <span class="text-xs text-base-content/50 capitalize">{s.exchange}</span>
                    </div>
                  </td>
                  <td>
                    <div class="flex items-center gap-2">
                      <span class="h-1.5 w-1.5 rounded-full {statusDot[s.status]}"></span>
                      <span class="text-xs text-base-content/70 capitalize">{s.status}</span>
                    </div>
                  </td>
                  <td class="text-right">
                    <span
                      class="font-mono text-sm"
                      class:text-success={s.pnl24hPositive && s.pnl24h !== '0.00'}
                      class:text-error={!s.pnl24hPositive}
                      class:text-base-content={s.pnl24h === '0.00'}
                    >
                      {s.pnl24h}
                    </span>
                  </td>
                  <td class="text-right">
                    <span
                      class="font-mono text-sm"
                      class:text-base-content={Math.abs(s.inventoryBps) < 30}
                      class:text-warning={Math.abs(s.inventoryBps) >= 30 && Math.abs(s.inventoryBps) < 60}
                      class:text-error={Math.abs(s.inventoryBps) >= 60}
                    >
                      {s.inventoryBps > 0 ? '+' : ''}{s.inventoryBps}
                    </span>
                  </td>
                  <td class="text-right">
                    <span class="font-mono text-sm text-base-content/80">
                      {s.spreadBps === 0 ? '—' : s.spreadBps}
                    </span>
                  </td>
                  <td class="text-right">
                    <span class="font-mono text-sm text-base-content/80">{s.fillsToday}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Recent Intents (spans 2) -->
    <div class="card border border-base-300 bg-base-100 shadow-none xl:col-span-2">
      <div class="card-body gap-3 p-5">
        <div class="flex items-center justify-between">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
            recent intents
          </span>
          <span class="text-xs text-base-content/50 capitalize">live · last 8</span>
        </div>

        <ul class="divide-y divide-base-300">
          {#each intents as it (it.id)}
            <li class="flex items-center gap-3 py-2.5">
              <span class="font-mono text-xs text-base-content/50 w-16 shrink-0">{it.ts}</span>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {intentTone[it.kind]}"
              >
                {it.kind}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  {#if it.side}
                    <span
                      class="text-xs font-medium uppercase"
                      class:text-success={it.side === 'buy'}
                      class:text-error={it.side === 'sell'}
                    >
                      {it.side}
                    </span>
                  {/if}
                  <span class="font-mono text-sm text-base-content">{it.symbol}</span>
                  <span class="font-mono text-xs text-base-content/60">{it.qty}</span>
                  {#if it.price}
                    <span class="font-mono text-xs text-base-content/40">@ {it.price}</span>
                  {/if}
                </div>
                <span class="text-xs text-base-content/50 capitalize">{it.exchange}</span>
              </div>
              <span class="h-1.5 w-1.5 rounded-full {statusDot[it.status]}"></span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>

  <!-- Capital Distribution + Order Flow -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex items-center justify-between">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
            capital by exchange
          </span>
          <span class="font-mono text-xs text-base-content/50">USD</span>
        </div>

        <ul class="space-y-3">
          {#each allocations as a (a.exchange)}
            <li class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <span class="text-sm text-base-content capitalize">{a.exchange}</span>
                <div class="flex items-center gap-3">
                  <span class="font-mono text-sm text-base-content">{a.amount.toLocaleString()}</span>
                  <span class="font-mono text-xs text-base-content/50 w-12 text-right">{a.pct.toFixed(1)}%</span>
                </div>
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-300">
                <div class="h-full bg-base-content" style="width: {a.pct}%"></div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              order flow
            </span>
            <span class="text-xs text-base-content/50 capitalize">orders / minute · last hour</span>
          </div>
          <div class="flex flex-col items-end">
            <span class="font-mono text-2xl font-semibold text-base-content">92</span>
            <span class="font-mono text-xs text-success">+14.8%</span>
          </div>
        </div>

        <div class="-mx-1">
          <Sparkline values={flowSeries} width={520} height={120} positive={true} />
        </div>

        <div class="grid grid-cols-3 gap-3 border-t border-base-300 pt-3">
          <div class="flex flex-col">
            <span class="text-xs text-base-content/50 capitalize">avg / min</span>
            <span class="font-mono text-sm text-base-content">52.4</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs text-base-content/50 capitalize">peak</span>
            <span class="font-mono text-sm text-base-content">92</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs text-base-content/50 capitalize">failed</span>
            <span class="font-mono text-sm text-error">0.8%</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- System Status -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
          system status
        </span>
        <span class="text-xs text-base-content/50">all systems operational</span>
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {#each system as s (s.key)}
          <div class="flex items-start gap-3 rounded-lg border border-base-300 p-3">
            <span class="mt-1 h-2 w-2 shrink-0 rounded-full {statusDot[s.status]}"></span>
            <div class="flex min-w-0 flex-col">
              <span class="text-sm font-medium text-base-content capitalize">{s.label}</span>
              <span class="font-mono text-xs text-base-content/50 truncate">{s.meta}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

</section>
