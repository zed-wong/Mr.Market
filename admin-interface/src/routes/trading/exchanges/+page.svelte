<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Status = 'connected' | 'degraded' | 'disconnected';

  interface Exchange {
    id: string;
    name: string;
    status: Status;
    totalUsd: number;
    balances: { asset: string; amount: number; usd: number }[];
    keyCount: number;
    keyExpiresIn: string; // human readable
    latencyMs: number;
    rateLimitPct: number;
    lastSync: string;
  }

  const exchanges: Exchange[] = [
    {
      id: 'binance', name: 'binance', status: 'connected', totalUsd: 7_812_400,
      balances: [
        { asset: 'BTC',  amount: 14.823, usd: 1_014_120 },
        { asset: 'ETH',  amount: 412.5,  usd: 1_449_054 },
        { asset: 'USDT', amount: 1_204_512, usd: 1_204_512 },
        { asset: 'USDC', amount: 480_220, usd: 480_124 },
        { asset: 'BNB',  amount: 412.0,  usd: 257_417 },
      ],
      keyCount: 2, keyExpiresIn: '89d', latencyMs: 28, rateLimitPct: 78, lastSync: '2s ago',
    },
    {
      id: 'okx', name: 'okx', status: 'connected', totalUsd: 2_410_100,
      balances: [
        { asset: 'BTC',  amount: 4.211, usd: 288_122 },
        { asset: 'SOL',  amount: 8_120, usd: 1_127_868 },
        { asset: 'USDT', amount: 480_220, usd: 480_220 },
        { asset: 'LINK', amount: 12_400, usd: 183_644 },
      ],
      keyCount: 1, keyExpiresIn: '14d', latencyMs: 102, rateLimitPct: 42, lastSync: '4s ago',
    },
    {
      id: 'bitfinex', name: 'bitfinex', status: 'degraded', totalUsd: 1_204_200,
      balances: [
        { asset: 'ETH',  amount: 88.1, usd: 309_478 },
        { asset: 'ATOM', amount: 18_400, usd: 132_112 },
        { asset: 'USDT', amount: 760_000, usd: 760_000 },
      ],
      keyCount: 1, keyExpiresIn: '212d', latencyMs: 612, rateLimitPct: 22, lastSync: '38s ago',
    },
    {
      id: 'mixin', name: 'mixin', status: 'connected', totalUsd: 1_012_220,
      balances: [
        { asset: 'XIN',  amount: 1_240, usd: 290_780 },
        { asset: 'USDT', amount: 712_000, usd: 712_000 },
        { asset: 'BTC',  amount: 0.135,  usd: 9_240 },
      ],
      keyCount: 1, keyExpiresIn: '∞', latencyMs: 76, rateLimitPct: 0, lastSync: '1s ago',
    },
    {
      id: 'gate', name: 'gate.io', status: 'disconnected', totalUsd: 0,
      balances: [],
      keyCount: 0, keyExpiresIn: '—', latencyMs: 0, rateLimitPct: 0, lastSync: 'never',
    },
  ];

  const statusDot: Record<Status, string> = {
    connected: 'bg-success', degraded: 'bg-warning', disconnected: 'bg-error',
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totals = {
    usd: exchanges.reduce((s, e) => s + e.totalUsd, 0),
    connected: exchanges.filter((e) => e.status === 'connected').length,
    keys: exchanges.reduce((s, e) => s + e.keyCount, 0),
    avgLatency: Math.round(exchanges.filter((e) => e.latencyMs > 0).reduce((s, e) => s + e.latencyMs, 0) / exchanges.filter((e) => e.latencyMs > 0).length),
  };
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title="exchanges"
    subtitle="Exchange connections, balances per venue, key health, and rate-limit budgets."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">resync all</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize">+ add exchange</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">total balance</span>
        <span class="font-mono text-2xl font-semibold">{fmt(totals.usd)}</span>
        <span class="text-xs text-base-content/40">USD</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">connected</span>
        <span class="font-mono text-2xl font-semibold text-success">{totals.connected} / {exchanges.length}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">api keys</span>
        <span class="font-mono text-2xl font-semibold">{totals.keys}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">avg latency</span>
        <span class="font-mono text-2xl font-semibold">{totals.avgLatency}<span class="text-sm text-base-content/40">ms</span></span>
      </div>
    </div>
  </div>

  <!-- Exchange cards -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {#each exchanges as ex (ex.id)}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-full border border-base-300 bg-neutral font-mono text-xs font-semibold uppercase">
                {ex.name.slice(0, 2)}
              </span>
              <div class="flex flex-col">
                <span class="text-base font-semibold tracking-tight text-base-content capitalize">{ex.name}</span>
                <div class="flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full {statusDot[ex.status]}"></span>
                  <span class="text-xs text-base-content/60 capitalize">{ex.status}</span>
                  <span class="text-xs text-base-content/40">· last sync {ex.lastSync}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-mono text-lg font-semibold text-base-content">{fmt(ex.totalUsd)}</span>
              <span class="text-xs text-base-content/40">USD</span>
            </div>
          </div>

          {#if ex.balances.length > 0}
            <ul class="space-y-2">
              {#each ex.balances as b (b.asset)}
                <li class="flex items-center justify-between border-b border-base-300 pb-1.5 last:border-b-0 last:pb-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium text-base-content">{b.asset}</span>
                    <span class="font-mono text-xs text-base-content/50">{fmt(b.amount)}</span>
                  </div>
                  <span class="font-mono text-sm text-base-content/80">{fmt(b.usd)}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="rounded-md border border-dashed border-base-300 p-4 text-center">
              <span class="text-xs text-base-content/50 capitalize">no active balances</span>
            </div>
          {/if}

          <div class="grid grid-cols-3 gap-3 border-t border-base-300 pt-3">
            <div class="flex flex-col">
              <span class="text-xs text-base-content/50 capitalize">api keys</span>
              <span class="font-mono text-sm text-base-content">{ex.keyCount}</span>
              <span class="font-mono text-[10px] text-base-content/40">expires {ex.keyExpiresIn}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-base-content/50 capitalize">latency</span>
              <span
                class="font-mono text-sm"
                class:text-base-content={ex.latencyMs > 0 && ex.latencyMs < 200}
                class:text-warning={ex.latencyMs >= 200 && ex.latencyMs < 500}
                class:text-error={ex.latencyMs >= 500}
                class:text-base-content-50={ex.latencyMs === 0}
              >
                {ex.latencyMs === 0 ? '—' : `${ex.latencyMs}ms`}
              </span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-base-content/50 capitalize">rate limit</span>
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm" class:text-warning={ex.rateLimitPct >= 75}>{ex.rateLimitPct}%</span>
              </div>
              <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-base-300">
                <div
                  class="h-full"
                  class:bg-base-content={ex.rateLimitPct < 75}
                  class:bg-warning={ex.rateLimitPct >= 75 && ex.rateLimitPct < 90}
                  class:bg-error={ex.rateLimitPct >= 90}
                  style="width: {ex.rateLimitPct}%"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>
