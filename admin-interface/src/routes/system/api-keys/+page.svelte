<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Scope = 'read' | 'trade' | 'withdraw';
  type Status = 'active' | 'rotating' | 'revoked' | 'expired';

  interface ApiKey {
    id: string;
    label: string;
    exchange: string;
    fingerprint: string;
    scopes: Scope[];
    status: Status;
    createdAt: string;
    lastUsed: string;
    expiresAt: string;
    daysToExpiry: number;
    createdBy: string;
    ipAllowList: number;
  }

  const keys: ApiKey[] = [
    { id: 'ak_01', label: 'binance prod main',     exchange: 'binance',  fingerprint: 'a3·7f·02·91',  scopes: ['read', 'trade'],           status: 'active',   createdAt: '2025-02-12', lastUsed: '12:04:02', expiresAt: '2026-08-14', daysToExpiry: 89,  createdBy: 'alice@mr.market', ipAllowList: 3 },
    { id: 'ak_02', label: 'binance prod backup',   exchange: 'binance',  fingerprint: '14·22·a8·c0',  scopes: ['read', 'trade'],           status: 'active',   createdAt: '2025-04-30', lastUsed: '11:42:18', expiresAt: '2026-10-30', daysToExpiry: 166, createdBy: 'alice@mr.market', ipAllowList: 3 },
    { id: 'ak_03', label: 'okx prod main',         exchange: 'okx',      fingerprint: '7e·ff·91·44',  scopes: ['read', 'trade'],           status: 'active',   createdAt: '2025-11-02', lastUsed: '12:03:58', expiresAt: '2026-05-31', daysToExpiry: 14,  createdBy: 'dave@mr.market',  ipAllowList: 2 },
    { id: 'ak_04', label: 'bitfinex prod',         exchange: 'bitfinex', fingerprint: '2c·08·77·b3',  scopes: ['read', 'trade'],           status: 'active',   createdAt: '2025-09-14', lastUsed: '11:48:22', expiresAt: '2026-12-14', daysToExpiry: 212, createdBy: 'bob@mr.market',   ipAllowList: 2 },
    { id: 'ak_05', label: 'mixin bot key',         exchange: 'mixin',    fingerprint: '88·14·02·91',  scopes: ['read', 'trade', 'withdraw'], status: 'active', createdAt: '2024-08-01', lastUsed: '12:03:11', expiresAt: '—',          daysToExpiry: 9999,createdBy: 'alice@mr.market', ipAllowList: 0 },
    { id: 'ak_06', label: 'binance withdraw',      exchange: 'binance',  fingerprint: '90·12·44·ab',  scopes: ['withdraw'],                 status: 'rotating', createdAt: '2025-06-22', lastUsed: '09:42:00', expiresAt: '2026-06-22', daysToExpiry: 36,  createdBy: 'dave@mr.market',  ipAllowList: 1 },
    { id: 'ak_07', label: 'okx old key',           exchange: 'okx',      fingerprint: '11·44·90·ee',  scopes: ['read', 'trade'],           status: 'revoked',  createdAt: '2024-12-10', lastUsed: '2025-04-12',expiresAt: '2025-12-10', daysToExpiry: -160,createdBy: 'bob@mr.market',   ipAllowList: 2 },
    { id: 'ak_08', label: 'binance test',          exchange: 'binance',  fingerprint: '55·a1·b2·08',  scopes: ['read'],                    status: 'expired',  createdAt: '2024-03-15', lastUsed: '2025-03-14',expiresAt: '2025-03-15', daysToExpiry: -430,createdBy: 'alice@mr.market', ipAllowList: 0 },
  ];

  const statusTone: Record<Status, string> = {
    active:   'bg-success/10 text-success',
    rotating: 'bg-info/10 text-info',
    revoked:  'bg-base-content/5 text-base-content/60',
    expired:  'bg-error/10 text-error',
  };

  const scopeTone: Record<Scope, string> = {
    read:     'bg-base-content/5 text-base-content/60',
    trade:    'bg-info/10 text-info',
    withdraw: 'bg-error/10 text-error',
  };

  let statusFilter = $state<'all' | Status>('all');
  let exchangeFilter = $state<'all' | string>('all');
  let query = $state('');

  const exchanges = ['all', ...Array.from(new Set(keys.map((k) => k.exchange)))];
  const statuses: Array<'all' | Status> = ['all', 'active', 'rotating', 'revoked', 'expired'];

  let filtered = $derived(
    keys.filter(
      (k) =>
        (statusFilter === 'all' || k.status === statusFilter) &&
        (exchangeFilter === 'all' || k.exchange === exchangeFilter) &&
        (query === '' || k.label.toLowerCase().includes(query.toLowerCase()) || k.fingerprint.includes(query)),
    ),
  );

  const counts = {
    active: keys.filter((k) => k.status === 'active').length,
    expiringSoon: keys.filter((k) => k.status === 'active' && k.daysToExpiry < 30).length,
    withdrawals: keys.filter((k) => k.scopes.includes('withdraw') && k.status === 'active').length,
    noIpAllow: keys.filter((k) => k.ipAllowList === 0 && k.status === 'active').length,
  };
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="api keys"
    subtitle="Exchange API credentials. Keys are encrypted at rest, fingerprints shown here are non-secret."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">rotate all</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize">+ add key</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">active keys</span>
        <span class="font-mono text-2xl font-semibold text-success">{counts.active}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">expiring &lt; 30d</span>
        <span class="font-mono text-2xl font-semibold" class:text-warning={counts.expiringSoon > 0}>{counts.expiringSoon}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">withdraw scope</span>
        <span class="font-mono text-2xl font-semibold" class:text-error={counts.withdrawals > 0}>{counts.withdrawals}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">no IP allowlist</span>
        <span class="font-mono text-2xl font-semibold" class:text-warning={counts.noIpAllow > 0}>{counts.noIpAllow}</span>
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

        <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={exchangeFilter}>
          {#each exchanges as ex (ex)}
            <option value={ex}>{ex === 'all' ? 'all exchanges' : ex}</option>
          {/each}
        </select>

        <input
          type="text"
          placeholder="label or fingerprint…"
          class="input input-sm input-bordered border-base-300 bg-base-100 flex-1 min-w-[200px] font-mono text-xs"
          bind:value={query}
        />

        <span class="font-mono text-xs text-base-content/50">{filtered.length} / {keys.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">label</th>
              <th class="font-medium">exchange</th>
              <th class="font-medium">fingerprint</th>
              <th class="font-medium">scopes</th>
              <th class="font-medium">status</th>
              <th class="font-medium">last used</th>
              <th class="font-medium">expires</th>
              <th class="font-medium">ip allowlist</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as k (k.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-base-content capitalize">{k.label}</span>
                    <span class="text-xs text-base-content/50">created {k.createdAt} · by {k.createdBy}</span>
                  </div>
                </td>
                <td class="text-sm text-base-content capitalize">{k.exchange}</td>
                <td class="font-mono text-xs text-base-content/70">{k.fingerprint}</td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    {#each k.scopes as scope (scope)}
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {scopeTone[scope]}">
                        {scope}
                      </span>
                    {/each}
                  </div>
                </td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {statusTone[k.status]}">
                    {k.status}
                  </span>
                </td>
                <td class="font-mono text-xs text-base-content/70">{k.lastUsed}</td>
                <td>
                  {#if k.expiresAt === '—'}
                    <span class="font-mono text-xs text-base-content/40">never</span>
                  {:else}
                    <div class="flex flex-col">
                      <span class="font-mono text-xs text-base-content/70">{k.expiresAt}</span>
                      <span
                        class="font-mono text-[10px]"
                        class:text-error={k.daysToExpiry < 0 || k.daysToExpiry < 14}
                        class:text-warning={k.daysToExpiry >= 14 && k.daysToExpiry < 30}
                        class:text-base-content-40={k.daysToExpiry >= 30}
                      >
                        {k.daysToExpiry < 0 ? `${Math.abs(k.daysToExpiry)}d ago` : `${k.daysToExpiry}d`}
                      </span>
                    </div>
                  {/if}
                </td>
                <td>
                  {#if k.ipAllowList > 0}
                    <span class="font-mono text-xs text-base-content/70">{k.ipAllowList} ips</span>
                  {:else}
                    <span class="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">open</span>
                  {/if}
                </td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-xs rounded-full text-base-content/60">⋯</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
