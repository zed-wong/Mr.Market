<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import Sparkline from '../../components/Sparkline.svelte';

  type Status = 'healthy' | 'degraded' | 'down';

  interface Service {
    id: string;
    name: string;
    group: string;
    status: Status;
    uptime30d: number; // %
    p50: number;
    p95: number;
    p99: number;
    errorRate: number; // %
    rps: number;
    series: number[]; // requests/sec
    lastIncident?: string;
  }

  interface Incident {
    id: string;
    started: string;
    duration: string;
    service: string;
    severity: 'minor' | 'major' | 'critical';
    summary: string;
    resolved: boolean;
  }

  const services: Service[] = [
    { id: 'api',         name: 'API gateway',       group: 'edge',     status: 'healthy',  uptime30d: 99.992, p50: 4,   p95: 28,  p99: 84,  errorRate: 0.02, rps: 184, series: [120,140,150,160,158,170,182,184,180,182,184] },
    { id: 'scheduler',   name: 'Scheduler',         group: 'core',     status: 'degraded', uptime30d: 99.812, p50: 84,  p95: 220, p99: 612, errorRate: 0.40, rps: 12, series: [10,12,11,13,14,12,15,16,18,14,12], lastIncident: '12:04 tick drift 120ms' },
    { id: 'mm-worker',   name: 'MM workers',        group: 'core',     status: 'healthy',  uptime30d: 99.998, p50: 9,   p95: 42,  p99: 128, errorRate: 0.01, rps: 92, series: [60,70,80,84,88,90,89,92,94,90,92] },
    { id: 'reconciler',  name: 'Reconciler',        group: 'core',     status: 'healthy',  uptime30d: 99.999, p50: 1420,p95: 1810,p99: 2240,errorRate: 0.00, rps: 0.02, series: [1,1,1,1,1,1,1,1,1,1,1] },
    { id: 'binance',     name: 'Binance adapter',   group: 'adapter',  status: 'healthy',  uptime30d: 99.94,  p50: 28,  p95: 84,  p99: 220, errorRate: 0.12, rps: 64, series: [40,50,55,60,62,64,68,66,64,62,64] },
    { id: 'okx',         name: 'OKX adapter',       group: 'adapter',  status: 'healthy',  uptime30d: 99.88,  p50: 102, p95: 240, p99: 410, errorRate: 0.34, rps: 28, series: [20,22,26,28,30,28,32,30,28,26,28] },
    { id: 'bitfinex',    name: 'Bitfinex adapter',  group: 'adapter',  status: 'degraded', uptime30d: 98.42,  p50: 612, p95: 1240,p99: 2810,errorRate: 4.20, rps: 4,  series: [6,8,5,4,6,4,3,2,4,5,4], lastIncident: '11:42 high latency' },
    { id: 'mixin',       name: 'Mixin SDK',         group: 'adapter',  status: 'healthy',  uptime30d: 99.99,  p50: 76,  p95: 180, p99: 320, errorRate: 0.04, rps: 18, series: [14,16,18,20,18,16,18,20,18,16,18] },
    { id: 'db-primary',  name: 'DB primary',        group: 'data',     status: 'healthy',  uptime30d: 99.999, p50: 2,   p95: 8,   p99: 24,  errorRate: 0.00, rps: 412, series: [380,390,400,410,408,412,420,418,412,410,412] },
    { id: 'db-replica',  name: 'DB replica',        group: 'data',     status: 'healthy',  uptime30d: 99.996, p50: 2,   p95: 6,   p99: 18,  errorRate: 0.00, rps: 240, series: [220,230,240,238,242,240,244,240,238,240,240] },
    { id: 'redis',       name: 'Redis',             group: 'data',     status: 'healthy',  uptime30d: 99.999, p50: 1,   p95: 2,   p99: 4,   errorRate: 0.00, rps: 1820, series: [1700,1750,1800,1820,1810,1820,1830,1820,1810,1820,1820] },
    { id: 'queue',       name: 'Job queue',         group: 'data',     status: 'healthy',  uptime30d: 99.998, p50: 2,   p95: 12,  p99: 38,  errorRate: 0.02, rps: 88, series: [70,75,80,85,84,88,90,88,86,88,88] },
  ];

  const incidents: Incident[] = [
    { id: 'inc_42', started: '12:04', duration: '2m',  service: 'scheduler',         severity: 'minor',    summary: 'tick drift 120ms — recovered automatically', resolved: false },
    { id: 'inc_41', started: '11:42', duration: '22m', service: 'bitfinex',          severity: 'major',    summary: 'API latency >1s for sustained period',       resolved: false },
    { id: 'inc_40', started: '09:18', duration: '4m',  service: 'okx',               severity: 'minor',    summary: 'rate limit usage spike to 92%',              resolved: true  },
    { id: 'inc_39', started: '08:02', duration: '1m',  service: 'mm-usdc-usdt',      severity: 'major',    summary: 'strategy halted on risk check failure',      resolved: true  },
    { id: 'inc_38', started: '06:30', duration: '8m',  service: 'db-replica',        severity: 'minor',    summary: 'replication lag 4s (recovered)',             resolved: true  },
  ];

  const statusDot: Record<Status, string> = {
    healthy: 'bg-success', degraded: 'bg-warning', down: 'bg-error',
  };

  const severityTone: Record<Incident['severity'], string> = {
    minor:    'bg-warning/10 text-warning',
    major:    'bg-error/10 text-error',
    critical: 'bg-error text-error-content',
  };

  let groupFilter = $state<'all' | string>('all');
  const groups = ['all', ...Array.from(new Set(services.map((s) => s.group)))];
  let filtered = $derived(services.filter((s) => groupFilter === 'all' || s.group === groupFilter));

  const counts = {
    healthy: services.filter((s) => s.status === 'healthy').length,
    degraded: services.filter((s) => s.status === 'degraded').length,
    down: services.filter((s) => s.status === 'down').length,
    open: incidents.filter((i) => !i.resolved).length,
  };

  const overallUptime = (services.reduce((s, x) => s + x.uptime30d, 0) / services.length).toFixed(3);
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="health"
    subtitle="Service-level uptime, latency percentiles, and open incidents. 30-day SLO targets."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">runbook</button>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">silence alerts</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">overall uptime (30d)</span>
        <span class="font-mono text-2xl font-semibold text-success">{overallUptime}%</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">healthy</span>
        <span class="font-mono text-2xl font-semibold text-success">{counts.healthy}</span>
        <span class="text-xs text-base-content/40">of {services.length}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">degraded</span>
        <span class="font-mono text-2xl font-semibold text-warning">{counts.degraded}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">open incidents</span>
        <span class="font-mono text-2xl font-semibold" class:text-warning={counts.open > 0}>{counts.open}</span>
      </div>
    </div>
  </div>

  <!-- Services -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-lg font-semibold tracking-tight text-base-content capitalize">services</span>
        <div class="join">
          {#each groups as g (g)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={groupFilter === g}
              onclick={() => (groupFilter = g)}
            >{g}</button>
          {/each}
        </div>
        <span class="ml-auto font-mono text-xs text-base-content/50">{filtered.length} / {services.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">service</th>
              <th class="font-medium">status</th>
              <th class="font-medium text-right">uptime (30d)</th>
              <th class="font-medium text-right">p50</th>
              <th class="font-medium text-right">p95</th>
              <th class="font-medium text-right">p99</th>
              <th class="font-medium text-right">err %</th>
              <th class="font-medium text-right">rps</th>
              <th class="font-medium">trend</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as s (s.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-base-content">{s.name}</span>
                    <span class="text-xs text-base-content/50 capitalize">{s.group}{s.lastIncident ? ' · ' + s.lastIncident : ''}</span>
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
                    class:text-success={s.uptime30d >= 99.9}
                    class:text-warning={s.uptime30d >= 99 && s.uptime30d < 99.9}
                    class:text-error={s.uptime30d < 99}
                  >
                    {s.uptime30d.toFixed(3)}%
                  </span>
                </td>
                <td class="text-right font-mono text-sm text-base-content/70">{s.p50}ms</td>
                <td class="text-right font-mono text-sm">{s.p95}ms</td>
                <td class="text-right font-mono text-sm text-base-content/70">{s.p99}ms</td>
                <td class="text-right">
                  <span class="font-mono text-sm" class:text-success={s.errorRate < 0.1} class:text-warning={s.errorRate >= 0.1 && s.errorRate < 1} class:text-error={s.errorRate >= 1}>
                    {s.errorRate.toFixed(2)}%
                  </span>
                </td>
                <td class="text-right font-mono text-sm text-base-content/80">{s.rps}</td>
                <td>
                  <div class="h-6 w-24">
                    <Sparkline values={s.series} width={96} height={24} positive={s.status === 'healthy'} fill={false} />
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Incidents -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold tracking-tight text-base-content capitalize">recent incidents</span>
        <span class="font-mono text-xs text-base-content/50">{incidents.length} total · {counts.open} open</span>
      </div>

      <ul class="divide-y divide-base-300">
        {#each incidents as inc (inc.id)}
          <li class="flex items-start gap-3 py-3">
            <span class="font-mono text-xs text-base-content/50 w-14 shrink-0">{inc.started}</span>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {severityTone[inc.severity]}">
              {inc.severity}
            </span>
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm text-base-content">{inc.summary}</span>
              <span class="text-xs text-base-content/50 capitalize">{inc.service} · {inc.duration}</span>
            </div>
            {#if inc.resolved}
              <span class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">resolved</span>
            {:else}
              <span class="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">open</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
