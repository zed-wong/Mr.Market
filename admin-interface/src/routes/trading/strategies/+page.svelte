<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import Sparkline from '../../components/Sparkline.svelte';

  type Status = 'healthy' | 'delayed' | 'paused' | 'error';

  interface Strategy {
    id: string;
    name: string;
    pair: string;
    exchange: string;
    status: Status;
    pnl24h: number;
    inventoryBps: number;
    fillsToday: number;
    spreadBps: number;
    lastTickMs: number;
    pnlSeries: number[];
  }

  const strategies: Strategy[] = [
    { id: '01', name: 'MM · BTC/USDT', pair: 'BTC/USDT', exchange: 'binance', status: 'healthy', pnl24h: 1284.5, inventoryBps: 12, fillsToday: 412, spreadBps: 6, lastTickMs: 84, pnlSeries: [200, 320, 410, 540, 680, 820, 950, 1080, 1140, 1200, 1240, 1284] },
    { id: '02', name: 'MM · ETH/USDT', pair: 'ETH/USDT', exchange: 'binance', status: 'healthy', pnl24h: 812.2, inventoryBps: -8, fillsToday: 327, spreadBps: 7, lastTickMs: 92, pnlSeries: [100, 180, 250, 340, 420, 510, 620, 700, 750, 780, 800, 812] },
    { id: '03', name: 'MM · SOL/USDT', pair: 'SOL/USDT', exchange: 'okx', status: 'delayed', pnl24h: 143.8, inventoryBps: 34, fillsToday: 188, spreadBps: 14, lastTickMs: 612, pnlSeries: [50, 70, 60, 80, 110, 100, 120, 130, 135, 140, 142, 143] },
    { id: '04', name: 'MM · USDC/USDT', pair: 'USDC/USDT', exchange: 'binance', status: 'error', pnl24h: -12.1, inventoryBps: 87, fillsToday: 56, spreadBps: 3, lastTickMs: 0, pnlSeries: [40, 30, 20, 10, -2, -5, -8, -9, -10, -11, -12, -12] },
    { id: '05', name: 'ARB · XIN bn/mx', pair: 'XIN/USDT', exchange: 'binance · mixin', status: 'paused', pnl24h: 0, inventoryBps: 0, fillsToday: 0, spreadBps: 0, lastTickMs: 0, pnlSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: '06', name: 'MM · BNB/USDT', pair: 'BNB/USDT', exchange: 'binance', status: 'healthy', pnl24h: 432.1, inventoryBps: 5, fillsToday: 201, spreadBps: 8, lastTickMs: 110, pnlSeries: [80, 130, 180, 230, 280, 320, 360, 390, 410, 420, 428, 432] },
    { id: '07', name: 'MM · LINK/USDT', pair: 'LINK/USDT', exchange: 'okx', status: 'healthy', pnl24h: 91.4, inventoryBps: -18, fillsToday: 73, spreadBps: 12, lastTickMs: 178, pnlSeries: [10, 20, 30, 45, 55, 62, 70, 75, 82, 86, 89, 91] },
    { id: '08', name: 'MM · ATOM/USDT', pair: 'ATOM/USDT', exchange: 'bitfinex', status: 'delayed', pnl24h: -38.9, inventoryBps: 42, fillsToday: 41, spreadBps: 21, lastTickMs: 854, pnlSeries: [20, 10, 0, -5, -12, -18, -22, -28, -32, -35, -37, -38] },
  ];

  const statusDot: Record<Status | 'ok', string> = {
    healthy: 'bg-success', delayed: 'bg-warning', paused: 'bg-base-content/30', error: 'bg-error', ok: 'bg-success',
  };

  let statusFilter = $state<'all' | Status>('all');
  let exchangeFilter = $state<'all' | string>('all');

  let filtered = $derived(
    strategies.filter((s) => (statusFilter === 'all' || s.status === statusFilter) && (exchangeFilter === 'all' || s.exchange === exchangeFilter)),
  );

  let totalPnl = $derived(filtered.reduce((sum, s) => sum + s.pnl24h, 0));
  let activeCount = $derived(strategies.filter((s) => s.status === 'healthy' || s.status === 'delayed').length);
  let pausedCount = $derived(strategies.filter((s) => s.status === 'paused').length);
  let errorCount = $derived(strategies.filter((s) => s.status === 'error').length);

  const exchanges = ['all', ...Array.from(new Set(strategies.map((s) => s.exchange)))];
  const statuses: Array<'all' | Status> = ['all', 'healthy', 'delayed', 'paused', 'error'];

  const fmt = (n: number) => (n >= 0 ? '+' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title="strategies"
    subtitle="Market-making and arbitrage strategy controllers. Tick-only views; intents dispatched by workers."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">export</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize">+ new strategy</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">total strategies</span>
        <span class="font-mono text-2xl font-semibold">{strategies.length}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">active</span>
        <span class="font-mono text-2xl font-semibold text-success">{activeCount}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">paused / error</span>
        <span class="font-mono text-2xl font-semibold">{pausedCount + errorCount}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">24h pnl (filtered)</span>
        <span
          class="font-mono text-2xl font-semibold"
          class:text-success={totalPnl > 0}
          class:text-error={totalPnl < 0}
        >
          {fmt(totalPnl)}
        </span>
      </div>
    </div>
  </div>

  <!-- Filters + Table -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="join">
          {#each statuses as s (s)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={statusFilter === s}
              onclick={() => (statusFilter = s)}
            >
              {s}
            </button>
          {/each}
        </div>

        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 capitalize"
          bind:value={exchangeFilter}
        >
          {#each exchanges as ex (ex)}
            <option value={ex}>{ex === 'all' ? 'all exchanges' : ex}</option>
          {/each}
        </select>

        <div class="ml-auto flex items-center gap-2">
          <span class="text-xs text-base-content/50 font-mono">{filtered.length} / {strategies.length}</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">strategy</th>
              <th class="font-medium">status</th>
              <th class="font-medium text-right">24h pnl</th>
              <th class="font-medium">trend</th>
              <th class="font-medium text-right">inv. bps</th>
              <th class="font-medium text-right">spread</th>
              <th class="font-medium text-right">fills</th>
              <th class="font-medium text-right">last tick</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as s (s.id)}
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
                    class:text-success={s.pnl24h > 0}
                    class:text-error={s.pnl24h < 0}
                    class:text-base-content={s.pnl24h === 0}
                  >
                    {fmt(s.pnl24h)}
                  </span>
                </td>
                <td>
                  <div class="h-6 w-24">
                    <Sparkline values={s.pnlSeries} width={96} height={24} positive={s.pnl24h >= 0} fill={false} />
                  </div>
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
                <td class="text-right font-mono text-sm text-base-content/80">{s.spreadBps || '—'}</td>
                <td class="text-right font-mono text-sm text-base-content/80">{s.fillsToday}</td>
                <td class="text-right">
                  <span
                    class="font-mono text-xs"
                    class:text-base-content={s.lastTickMs > 0 && s.lastTickMs < 200}
                    class:text-warning={s.lastTickMs >= 200 && s.lastTickMs < 500}
                    class:text-error={s.lastTickMs >= 500}
                    class:text-base-content-50={s.lastTickMs === 0}
                  >
                    {s.lastTickMs === 0 ? '—' : `${s.lastTickMs}ms`}
                  </span>
                </td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-xs rounded-full text-base-content/60">⋯</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if filtered.length === 0}
        <div class="flex flex-col items-center gap-1 py-12 text-center">
          <span class="text-sm text-base-content/60 capitalize">no strategies match the filters</span>
          <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={() => { statusFilter = 'all'; exchangeFilter = 'all'; }}>reset filters</button>
        </div>
      {/if}
    </div>
  </div>
</section>
