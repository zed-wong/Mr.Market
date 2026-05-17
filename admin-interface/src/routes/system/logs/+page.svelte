<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Level = 'debug' | 'info' | 'warn' | 'error';

  interface LogEntry {
    id: string;
    ts: string; // HH:MM:SS.mmm
    level: Level;
    source: string;
    msg: string;
    reqId?: string;
  }

  const sources = ['scheduler', 'mm-worker', 'intent-worker', 'reconciler', 'mixin', 'api', 'binance-adapter', 'okx-adapter'];

  const logs: LogEntry[] = [
    { id: 'l01', ts: '12:04:11.302', level: 'info',  source: 'mm-worker',      msg: 'intent placed orderId=ord_01HX082 pair=BTC/USDT side=buy qty=0.025 price=68410.50', reqId: 'r_8a12' },
    { id: 'l02', ts: '12:04:11.298', level: 'debug', source: 'intent-worker',  msg: 'reservation acquired orderId=ord_01HX082 asset=USDT amount=1710.27', reqId: 'r_8a12' },
    { id: 'l03', ts: '12:04:11.244', level: 'info',  source: 'binance-adapter', msg: 'fill received ord_01HX075 qty=0.018 fee=0.000018 BTC', reqId: 'r_8a08' },
    { id: 'l04', ts: '12:04:10.892', level: 'warn',  source: 'scheduler',      msg: 'tick drift detected ms=120 strategy=arb-xin (recovered)' },
    { id: 'l05', ts: '12:04:10.661', level: 'info',  source: 'reconciler',     msg: 'reconciliation pass complete duration=1.42s diff=0' },
    { id: 'l06', ts: '12:04:10.510', level: 'debug', source: 'mixin',          msg: 'snapshot S_91204 processed amount=12.4 USDT' },
    { id: 'l07', ts: '12:04:10.221', level: 'error', source: 'okx-adapter',    msg: 'order place rejected code=-2010 reason="insufficient balance" pair=SOL/USDT', reqId: 'r_8a05' },
    { id: 'l08', ts: '12:04:10.097', level: 'info',  source: 'mm-worker',      msg: 'intent placed orderId=ord_01HX080 pair=ETH/USDT side=sell qty=1.25 price=3512.80', reqId: 'r_8a04' },
    { id: 'l09', ts: '12:04:09.812', level: 'info',  source: 'intent-worker',  msg: 'order cancelled orderId=ord_01HX072 reason="expired"' },
    { id: 'l10', ts: '12:04:09.604', level: 'debug', source: 'api',            msg: 'GET /v1/admin/strategies 200 4ms ip=10.0.0.12' },
    { id: 'l11', ts: '12:04:09.331', level: 'warn',  source: 'binance-adapter', msg: 'rate limit usage 78% of 1200/min' },
    { id: 'l12', ts: '12:04:09.102', level: 'info',  source: 'reconciler',     msg: 'snapshot ledger=12,438,920.45 exchange=12,438,920.45 match=true' },
    { id: 'l13', ts: '12:04:08.844', level: 'info',  source: 'mm-worker',      msg: 'spread adjusted pair=USDC/USDT old=3bps new=4bps' },
    { id: 'l14', ts: '12:04:08.502', level: 'debug', source: 'scheduler',      msg: 'tick #129482 elapsed=84ms strategies=8' },
    { id: 'l15', ts: '12:04:08.211', level: 'error', source: 'mm-worker',      msg: 'strategy halted id=mm-usdc-usdt reason="risk_check_failed: inventory bps 87 > 80"' },
  ];

  const levelTone: Record<Level, string> = {
    debug: 'bg-base-content/5 text-base-content/60',
    info: 'bg-info/10 text-info',
    warn: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  };

  let levelFilter = $state<'all' | Level>('all');
  let sourceFilter = $state<'all' | string>('all');
  let query = $state('');
  let tail = $state(true);

  let filtered = $derived(
    logs.filter(
      (l) =>
        (levelFilter === 'all' || l.level === levelFilter) &&
        (sourceFilter === 'all' || l.source === sourceFilter) &&
        (query === '' || l.msg.toLowerCase().includes(query.toLowerCase()) || (l.reqId?.toLowerCase().includes(query.toLowerCase()) ?? false)),
    ),
  );

  const levels: Array<'all' | Level> = ['all', 'debug', 'info', 'warn', 'error'];
  const sourceOpts = ['all', ...sources];

  const counts = {
    debug: logs.filter((l) => l.level === 'debug').length,
    info: logs.filter((l) => l.level === 'info').length,
    warn: logs.filter((l) => l.level === 'warn').length,
    error: logs.filter((l) => l.level === 'error').length,
  };
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="logs"
    subtitle="Realtime application logs across schedulers, workers, adapters, and the API."
  >
    {#snippet actions()}
      <label class="label cursor-pointer gap-2">
        <span class="label-text text-xs text-base-content/70 capitalize">live tail</span>
        <input type="checkbox" class="toggle toggle-sm" bind:checked={tail} />
      </label>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">download</button>
    {/snippet}
  </PageHeader>

  <!-- Level summary -->
  <div class="grid grid-cols-4 gap-3">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-3">
        <span class="text-xs text-base-content/60 capitalize">debug</span>
        <span class="font-mono text-xl font-semibold text-base-content/60">{counts.debug}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-3">
        <span class="text-xs text-base-content/60 capitalize">info</span>
        <span class="font-mono text-xl font-semibold text-info">{counts.info}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-3">
        <span class="text-xs text-base-content/60 capitalize">warn</span>
        <span class="font-mono text-xl font-semibold text-warning">{counts.warn}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-3">
        <span class="text-xs text-base-content/60 capitalize">error</span>
        <span class="font-mono text-xl font-semibold text-error">{counts.error}</span>
      </div>
    </div>
  </div>

  <!-- Filters + log stream -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="join">
          {#each levels as l (l)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={levelFilter === l}
              onclick={() => (levelFilter = l)}
            >
              {l}
            </button>
          {/each}
        </div>

        <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={sourceFilter}>
          {#each sourceOpts as s (s)}
            <option value={s}>{s === 'all' ? 'all sources' : s}</option>
          {/each}
        </select>

        <input
          type="text"
          placeholder="filter message or request id…"
          class="input input-sm input-bordered border-base-300 bg-base-100 flex-1 min-w-[220px] font-mono text-xs"
          bind:value={query}
        />

        <span class="font-mono text-xs text-base-content/50">{filtered.length} / {logs.length}</span>
      </div>

      <!-- Log stream -->
      <div class="rounded-lg border border-base-300 bg-base-100">
        <ul class="divide-y divide-base-300">
          {#each filtered as l (l.id)}
            <li class="flex items-start gap-3 px-4 py-2 hover:bg-neutral">
              <span class="font-mono text-xs text-base-content/50 w-28 shrink-0">{l.ts}</span>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0 {levelTone[l.level]}">
                {l.level}
              </span>
              <span class="font-mono text-xs text-base-content/60 w-32 shrink-0 truncate">{l.source}</span>
              <span class="font-mono text-xs text-base-content flex-1 break-all">{l.msg}</span>
              {#if l.reqId}
                <span class="font-mono text-[10px] text-base-content/40 shrink-0">{l.reqId}</span>
              {/if}
            </li>
          {/each}
        </ul>

        {#if filtered.length === 0}
          <div class="flex items-center justify-center py-12">
            <span class="text-sm text-base-content/60 capitalize">no logs match the filters</span>
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-between">
        <span class="text-xs text-base-content/50 capitalize">
          {tail ? 'tailing live stream' : 'paused — showing snapshot'}
        </span>
        <span class="font-mono text-xs text-base-content/50">retention 7d · ~12.4M lines</span>
      </div>
    </div>
  </div>
</section>
