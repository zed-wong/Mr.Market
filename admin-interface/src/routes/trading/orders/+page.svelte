<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Side = 'buy' | 'sell';
  type Kind = 'limit' | 'market' | 'maker' | 'taker';
  type Status = 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';

  interface Order {
    id: string;
    ts: string;
    pair: string;
    side: Side;
    kind: Kind;
    qty: number;
    filled: number;
    price: number;
    exchange: string;
    strategy: string;
    status: Status;
  }

  const orders: Order[] = [
    { id: 'ord_01HX0082', ts: '12:04:11', pair: 'BTC/USDT',  side: 'buy',  kind: 'maker',  qty: 0.025, filled: 0.0,    price: 68410.50, exchange: 'binance', strategy: 'mm-btc-usdt',  status: 'open' },
    { id: 'ord_01HX0081', ts: '12:04:08', pair: 'ETH/USDT',  side: 'sell', kind: 'maker',  qty: 1.250, filled: 0.840,  price: 3512.80,  exchange: 'binance', strategy: 'mm-eth-usdt',  status: 'partial' },
    { id: 'ord_01HX0080', ts: '12:04:05', pair: 'ETH/USDT',  side: 'buy',  kind: 'maker',  qty: 1.250, filled: 1.250,  price: 3511.20,  exchange: 'binance', strategy: 'mm-eth-usdt',  status: 'filled' },
    { id: 'ord_01HX0079', ts: '12:03:58', pair: 'SOL/USDT',  side: 'buy',  kind: 'limit',  qty: 24.00, filled: 0.0,    price: 138.40,   exchange: 'okx',     strategy: 'mm-sol-usdt',  status: 'cancelled' },
    { id: 'ord_01HX0078', ts: '12:03:42', pair: 'BTC/USDT',  side: 'sell', kind: 'maker',  qty: 0.018, filled: 0.018,  price: 68420.10, exchange: 'binance', strategy: 'mm-btc-usdt',  status: 'filled' },
    { id: 'ord_01HX0077', ts: '12:03:31', pair: 'USDC/USDT', side: 'buy',  kind: 'limit',  qty: 5000,  filled: 0.0,    price: 0.9998,   exchange: 'binance', strategy: 'mm-usdc-usdt', status: 'rejected' },
    { id: 'ord_01HX0076', ts: '12:03:15', pair: 'BNB/USDT',  side: 'sell', kind: 'maker',  qty: 12.4,  filled: 8.20,   price: 624.50,   exchange: 'binance', strategy: 'mm-bnb-usdt',  status: 'partial' },
    { id: 'ord_01HX0075', ts: '12:02:58', pair: 'LINK/USDT', side: 'buy',  kind: 'limit',  qty: 240,   filled: 240,    price: 14.78,    exchange: 'okx',     strategy: 'mm-link-usdt', status: 'filled' },
    { id: 'ord_01HX0074', ts: '12:02:41', pair: 'XIN/USDT',  side: 'buy',  kind: 'taker',  qty: 5.00,  filled: 5.00,   price: 234.20,   exchange: 'mixin',   strategy: 'arb-xin',      status: 'filled' },
    { id: 'ord_01HX0073', ts: '12:02:22', pair: 'ATOM/USDT', side: 'sell', kind: 'limit',  qty: 80.0,  filled: 0.0,    price: 7.18,     exchange: 'bitfinex', strategy: 'mm-atom-usdt', status: 'open' },
    { id: 'ord_01HX0072', ts: '12:01:55', pair: 'BTC/USDT',  side: 'sell', kind: 'maker',  qty: 0.040, filled: 0.0,    price: 68450.00, exchange: 'okx',     strategy: 'mm-btc-usdt',  status: 'cancelled' },
  ];

  const statusTone: Record<Status, string> = {
    open:      'bg-info/10 text-info',
    partial:   'bg-warning/10 text-warning',
    filled:    'bg-success/10 text-success',
    cancelled: 'bg-base-content/5 text-base-content/60',
    rejected:  'bg-error/10 text-error',
  };

  let statusFilter = $state<'all' | Status>('all');
  let sideFilter = $state<'all' | Side>('all');
  let query = $state('');

  let filtered = $derived(
    orders.filter(
      (o) =>
        (statusFilter === 'all' || o.status === statusFilter) &&
        (sideFilter === 'all' || o.side === sideFilter) &&
        (query === '' || o.id.includes(query) || o.pair.toLowerCase().includes(query.toLowerCase()) || o.strategy.includes(query)),
    ),
  );

  const counts = {
    open: orders.filter((o) => o.status === 'open' || o.status === 'partial').length,
    filled: orders.filter((o) => o.status === 'filled').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
  };
  const fillRate = ((counts.filled / orders.length) * 100).toFixed(1);

  const statuses: Array<'all' | Status> = ['all', 'open', 'partial', 'filled', 'cancelled', 'rejected'];
  const sides: Array<'all' | Side> = ['all', 'buy', 'sell'];

  const fmtQty = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtPx = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.min(100, (a / b) * 100));
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title="orders"
    subtitle="Exchange-tracked orders attributable to a strategy. Reservations are held in the ledger until fill or cancel."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">export</button>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">cancel all open</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">open + partial</span>
        <span class="font-mono text-2xl font-semibold text-info">{counts.open}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">filled today</span>
        <span class="font-mono text-2xl font-semibold text-success">{counts.filled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">cancelled</span>
        <span class="font-mono text-2xl font-semibold">{counts.cancelled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">fill rate</span>
        <span class="font-mono text-2xl font-semibold">{fillRate}%</span>
      </div>
    </div>
  </div>

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
            >{s}</button>
          {/each}
        </div>

        <div class="join">
          {#each sides as s (s)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={sideFilter === s}
              onclick={() => (sideFilter = s)}
            >{s}</button>
          {/each}
        </div>

        <input
          type="text"
          placeholder="order id, pair or strategy…"
          class="input input-sm input-bordered border-base-300 bg-base-100 flex-1 min-w-[200px] font-mono text-xs"
          bind:value={query}
        />

        <span class="font-mono text-xs text-base-content/50">{filtered.length} / {orders.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">time</th>
              <th class="font-medium">order id</th>
              <th class="font-medium">pair</th>
              <th class="font-medium">side</th>
              <th class="font-medium">type</th>
              <th class="font-medium text-right">qty</th>
              <th class="font-medium text-right">price</th>
              <th class="font-medium">fill</th>
              <th class="font-medium">status</th>
              <th class="font-medium">strategy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as o (o.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td class="font-mono text-xs text-base-content/70">{o.ts}</td>
                <td class="font-mono text-xs text-base-content">{o.id}</td>
                <td class="font-mono text-sm">{o.pair}</td>
                <td>
                  <span
                    class="text-xs font-medium uppercase"
                    class:text-success={o.side === 'buy'}
                    class:text-error={o.side === 'sell'}
                  >{o.side}</span>
                </td>
                <td class="text-xs text-base-content/70 capitalize">{o.kind}</td>
                <td class="text-right font-mono text-sm">{fmtQty(o.qty)}</td>
                <td class="text-right font-mono text-sm">{fmtPx(o.price)}</td>
                <td>
                  <div class="flex w-24 flex-col gap-1">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-[10px] text-base-content/60">{fmtQty(o.filled)}</span>
                      <span class="font-mono text-[10px] text-base-content/40">{pct(o.filled, o.qty).toFixed(0)}%</span>
                    </div>
                    <div class="h-1 w-full overflow-hidden rounded-full bg-base-300">
                      <div class="h-full bg-base-content" style="width: {pct(o.filled, o.qty)}%"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {statusTone[o.status]}">
                    {o.status}
                  </span>
                </td>
                <td class="font-mono text-xs text-base-content/70">{o.strategy}</td>
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
          <span class="text-sm text-base-content/60 capitalize">no orders match</span>
          <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={() => { statusFilter = 'all'; sideFilter = 'all'; query = ''; }}>reset</button>
        </div>
      {/if}
    </div>
  </div>
</section>
