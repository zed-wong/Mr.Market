<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Status = 'pending' | 'in-flight' | 'settled' | 'failed';

  interface Imbalance {
    asset: string;
    target: string; // exchange where it should be
    source: string;
    needed: number;
    available: number;
    deltaUsd: number;
    severity: 'low' | 'med' | 'high';
  }

  interface Transfer {
    id: string;
    ts: string;
    asset: string;
    amount: number;
    from: string;
    to: string;
    network: string;
    feeUsd: number;
    status: Status;
    etaMin?: number;
  }

  const imbalances: Imbalance[] = [
    { asset: 'USDT', target: 'okx',      source: 'binance',  needed: 320_000, available: 60_000,  deltaUsd: 260_000, severity: 'high' },
    { asset: 'BTC',  target: 'binance',  source: 'okx',      needed: 8.4,     available: 4.2,     deltaUsd: 287_500, severity: 'med'  },
    { asset: 'ETH',  target: 'bitfinex', source: 'binance',  needed: 120,     available: 88.1,    deltaUsd: 112_124, severity: 'med'  },
    { asset: 'SOL',  target: 'binance',  source: 'okx',      needed: 2_400,   available: 0,       deltaUsd: 333_360, severity: 'high' },
    { asset: 'USDC', target: 'mixin',    source: 'binance',  needed: 24_000,  available: 12_000,  deltaUsd:  12_000, severity: 'low'  },
  ];

  const transfers: Transfer[] = [
    { id: 'tx_91244', ts: '12:03:18', asset: 'USDT', amount: 120_000, from: 'binance', to: 'okx',      network: 'arb',    feeUsd: 0.42,  status: 'in-flight', etaMin: 4 },
    { id: 'tx_91243', ts: '12:01:02', asset: 'ETH',  amount: 24.0,    from: 'binance', to: 'bitfinex', network: 'erc20',  feeUsd: 8.20,  status: 'in-flight', etaMin: 12 },
    { id: 'tx_91242', ts: '11:58:44', asset: 'USDT', amount: 200_000, from: 'okx',     to: 'binance',  network: 'arb',    feeUsd: 0.42,  status: 'settled' },
    { id: 'tx_91241', ts: '11:48:11', asset: 'BTC',  amount: 1.2,     from: 'okx',     to: 'binance',  network: 'btc',    feeUsd: 4.10,  status: 'settled' },
    { id: 'tx_91240', ts: '11:30:55', asset: 'USDC', amount: 12_000,  from: 'binance', to: 'mixin',    network: 'mixin',  feeUsd: 0.00,  status: 'settled' },
    { id: 'tx_91239', ts: '10:42:08', asset: 'SOL',  amount: 800,     from: 'okx',     to: 'binance',  network: 'sol',    feeUsd: 0.05,  status: 'failed' },
    { id: 'tx_91238', ts: '10:22:00', asset: 'USDT', amount: 80_000,  from: 'binance', to: 'okx',      network: 'arb',    feeUsd: 0.42,  status: 'settled' },
  ];

  const severityTone: Record<Imbalance['severity'], string> = {
    low:  'bg-base-content/5 text-base-content/60',
    med:  'bg-warning/10 text-warning',
    high: 'bg-error/10 text-error',
  };

  const statusTone: Record<Status, string> = {
    pending:     'bg-info/10 text-info',
    'in-flight': 'bg-warning/10 text-warning',
    settled:     'bg-success/10 text-success',
    failed:      'bg-error/10 text-error',
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const totals = {
    rebalanced24h: 532_000,
    inflight: transfers.filter((t) => t.status === 'in-flight').length,
    feesPaid: transfers.reduce((s, t) => s + t.feeUsd, 0),
    nextRun: 'in 4m 12s',
  };
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title="rebalance"
    subtitle="Cross-venue asset rebalancing. Funded by treasury, executed by the rebalance worker."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">pause auto</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize">+ manual transfer</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">rebalanced (24h)</span>
        <span class="font-mono text-2xl font-semibold">{fmt(totals.rebalanced24h)}</span>
        <span class="text-xs text-base-content/40">USD</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">in flight</span>
        <span class="font-mono text-2xl font-semibold text-warning">{totals.inflight}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">network fees (24h)</span>
        <span class="font-mono text-2xl font-semibold">{fmt(totals.feesPaid)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">next auto run</span>
        <span class="font-mono text-2xl font-semibold">{totals.nextRun}</span>
      </div>
    </div>
  </div>

  <!-- Imbalance table -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">current imbalances</span>
          <span class="text-xs text-base-content/50">Assets below their target inventory threshold</span>
        </div>
        <span class="font-mono text-xs text-base-content/50">{imbalances.length} flagged</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">asset</th>
              <th class="font-medium">route</th>
              <th class="font-medium text-right">available</th>
              <th class="font-medium text-right">needed</th>
              <th class="font-medium text-right">delta (USD)</th>
              <th class="font-medium">severity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each imbalances as i (i.asset + i.target)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td><span class="font-mono text-sm font-medium">{i.asset}</span></td>
                <td>
                  <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-base-content/70 capitalize">{i.source}</span>
                    <span class="text-base-content/40">→</span>
                    <span class="text-base-content capitalize">{i.target}</span>
                  </div>
                </td>
                <td class="text-right font-mono text-sm text-base-content/70">{fmtQty(i.available)}</td>
                <td class="text-right font-mono text-sm">{fmtQty(i.needed)}</td>
                <td class="text-right font-mono text-sm">{fmt(i.deltaUsd)}</td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {severityTone[i.severity]}">
                    {i.severity}
                  </span>
                </td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/70">rebalance →</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Recent transfers -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold tracking-tight text-base-content capitalize">recent transfers</span>
        <button class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/60">view all →</button>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">time</th>
              <th class="font-medium">tx id</th>
              <th class="font-medium">asset</th>
              <th class="font-medium text-right">amount</th>
              <th class="font-medium">route</th>
              <th class="font-medium">network</th>
              <th class="font-medium text-right">fee</th>
              <th class="font-medium">status</th>
              <th class="font-medium">eta</th>
            </tr>
          </thead>
          <tbody>
            {#each transfers as t (t.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td class="font-mono text-xs text-base-content/70">{t.ts}</td>
                <td class="font-mono text-xs text-base-content">{t.id}</td>
                <td><span class="font-mono text-sm">{t.asset}</span></td>
                <td class="text-right font-mono text-sm">{fmtQty(t.amount)}</td>
                <td>
                  <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-base-content/70 capitalize">{t.from}</span>
                    <span class="text-base-content/40">→</span>
                    <span class="text-base-content capitalize">{t.to}</span>
                  </div>
                </td>
                <td><span class="font-mono text-xs text-base-content/70 uppercase">{t.network}</span></td>
                <td class="text-right font-mono text-sm text-base-content/70">{fmt(t.feeUsd)}</td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {statusTone[t.status]}">
                    {t.status}
                  </span>
                </td>
                <td class="font-mono text-xs text-base-content/70">
                  {t.etaMin ? `~${t.etaMin}m` : '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
