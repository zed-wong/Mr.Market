<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  interface Position {
    id: string;
    asset: string;
    exchange: string;
    qty: number;
    avgCost: number;
    mark: number;
    pctPortfolio: number;
  }

  const positions: Position[] = [
    { id: '1', asset: 'BTC', exchange: 'binance', qty: 14.823, avgCost: 67_120, mark: 68_412.3, pctPortfolio: 32.4 },
    { id: '2', asset: 'BTC', exchange: 'okx', qty: 4.211, avgCost: 67_812, mark: 68_412.3, pctPortfolio: 9.2 },
    { id: '3', asset: 'ETH', exchange: 'binance', qty: 412.5, avgCost: 3_440.2, mark: 3_512.8, pctPortfolio: 16.1 },
    { id: '4', asset: 'ETH', exchange: 'bitfinex', qty: 88.1, avgCost: 3_502.5, mark: 3_512.8, pctPortfolio: 3.4 },
    { id: '5', asset: 'SOL', exchange: 'okx', qty: 8_120, avgCost: 142.4, mark: 138.9, pctPortfolio: 9.1 },
    { id: '6', asset: 'USDT', exchange: 'binance', qty: 1_204_512, avgCost: 1, mark: 1, pctPortfolio: 9.7 },
    { id: '7', asset: 'USDC', exchange: 'binance', qty: 480_220, avgCost: 1, mark: 0.9998, pctPortfolio: 3.9 },
    { id: '8', asset: 'BNB', exchange: 'binance', qty: 412.0, avgCost: 612.5, mark: 624.8, pctPortfolio: 2.1 },
    { id: '9', asset: 'XIN', exchange: 'mixin', qty: 1_240, avgCost: 220.0, mark: 234.5, pctPortfolio: 2.3 },
    { id: '10', asset: 'LINK', exchange: 'okx', qty: 12_400, avgCost: 14.2, mark: 14.81, pctPortfolio: 1.5 },
  ];

  const enriched = positions.map((p) => {
    const notional = p.qty * p.mark;
    const unreal = p.qty * (p.mark - p.avgCost);
    const unrealPct = ((p.mark - p.avgCost) / p.avgCost) * 100;
    return { ...p, notional, unreal, unrealPct };
  });

  const fmtMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const gross = enriched.reduce((s, p) => s + p.notional, 0);
  const unrealTotal = enriched.reduce((s, p) => s + p.unreal, 0);
  const realToday = 2_141.32; // mock realized PnL today
  const netExposureBps = 38; // mock long/short imbalance

  // Asset aggregation for inventory bar
  const assets = new Map<string, number>();
  enriched.forEach((p) => assets.set(p.asset, (assets.get(p.asset) ?? 0) + p.notional));
  const assetRows = [...assets.entries()].map(([a, n]) => ({ asset: a, notional: n, pct: (n / gross) * 100 })).sort((a, b) => b.notional - a.notional);

  let exchangeFilter = $state<'all' | string>('all');
  const exchanges = ['all', ...Array.from(new Set(positions.map((p) => p.exchange)))];
  let filtered = $derived(enriched.filter((p) => exchangeFilter === 'all' || p.exchange === exchangeFilter));
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title="positions"
    subtitle="Aggregated positions and unrealized PnL across exchanges. Mark prices refresh every 5s."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">snapshot</button>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">reconcile</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">gross exposure</span>
        <span class="font-mono text-2xl font-semibold">{fmtMoney(gross)}</span>
        <span class="text-xs text-base-content/40">USD</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">net exposure</span>
        <span class="font-mono text-2xl font-semibold">+{netExposureBps} bps</span>
        <span class="text-xs text-base-content/40">long skew</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">unrealized pnl</span>
        <span class="font-mono text-2xl font-semibold" class:text-success={unrealTotal > 0} class:text-error={unrealTotal < 0}>
          {unrealTotal > 0 ? '+' : ''}{fmtMoney(unrealTotal)}
        </span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">realized today</span>
        <span class="font-mono text-2xl font-semibold text-success">+{fmtMoney(realToday)}</span>
      </div>
    </div>
  </div>

  <!-- Asset inventory bar -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold tracking-tight capitalize">inventory by asset</span>
        <span class="text-xs text-base-content/50 font-mono">{assetRows.length} assets</span>
      </div>

      <!-- Stacked inventory bar -->
      <div class="flex h-2.5 w-full overflow-hidden rounded-full border border-base-300">
        {#each assetRows as a, i (a.asset)}
          <div
            class="h-full"
            class:bg-base-content={i === 0}
            class:bg-base-content-70={i === 1}
            class:bg-base-content-50={i === 2}
            class:bg-accent={i === 3}
            class:bg-info={i === 4}
            class:bg-secondary={i > 4}
            style="width: {a.pct}%; background-color: {['#111111', '#3b3b3b', '#5F6670', '#B88A3D', '#2563EB', '#9CA3AF'][Math.min(i, 5)]}"
            title="{a.asset} · {a.pct.toFixed(1)}%"
          ></div>
        {/each}
      </div>

      <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {#each assetRows as a, i (a.asset)}
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {['#111111', '#3b3b3b', '#5F6670', '#B88A3D', '#2563EB', '#9CA3AF'][Math.min(i, 5)]}"></span>
            <span class="text-xs text-base-content/70 capitalize">{a.asset}</span>
            <span class="font-mono text-xs text-base-content/50 ml-auto">{a.pct.toFixed(1)}%</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Positions table -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-lg font-semibold tracking-tight capitalize">positions</span>
        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 capitalize ml-auto"
          bind:value={exchangeFilter}
        >
          {#each exchanges as ex (ex)}
            <option value={ex}>{ex === 'all' ? 'all exchanges' : ex}</option>
          {/each}
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">asset</th>
              <th class="font-medium">exchange</th>
              <th class="font-medium text-right">qty</th>
              <th class="font-medium text-right">avg cost</th>
              <th class="font-medium text-right">mark</th>
              <th class="font-medium text-right">notional</th>
              <th class="font-medium text-right">unrealized</th>
              <th class="font-medium text-right">%</th>
              <th class="font-medium text-right">portfolio</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as p (p.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td>
                  <span class="font-mono text-sm font-medium text-base-content">{p.asset}</span>
                </td>
                <td class="text-sm text-base-content/70 capitalize">{p.exchange}</td>
                <td class="text-right font-mono text-sm">{fmtQty(p.qty)}</td>
                <td class="text-right font-mono text-sm text-base-content/70">{fmtMoney(p.avgCost)}</td>
                <td class="text-right font-mono text-sm">{fmtMoney(p.mark)}</td>
                <td class="text-right font-mono text-sm">{fmtMoney(p.notional)}</td>
                <td class="text-right font-mono text-sm" class:text-success={p.unreal > 0} class:text-error={p.unreal < 0} class:text-base-content={p.unreal === 0}>
                  {p.unreal > 0 ? '+' : ''}{fmtMoney(p.unreal)}
                </td>
                <td class="text-right font-mono text-xs" class:text-success={p.unrealPct > 0} class:text-error={p.unrealPct < 0} class:text-base-content-50={p.unrealPct === 0}>
                  {p.unrealPct > 0 ? '+' : ''}{p.unrealPct.toFixed(2)}%
                </td>
                <td class="text-right font-mono text-xs text-base-content/60">{p.pctPortfolio.toFixed(1)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
