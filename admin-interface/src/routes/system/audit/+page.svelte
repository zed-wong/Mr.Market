<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Status = 'ok' | 'denied' | 'failed';
  type Action = 'create' | 'update' | 'delete' | 'login' | 'mfa' | 'rotate' | 'pause' | 'resume' | 'approve';

  interface AuditEntry {
    id: string;
    ts: string;
    actor: string;
    actorRole: string;
    action: Action;
    resource: string;
    resourceId: string;
    diff?: { field: string; before: string; after: string }[];
    ip: string;
    status: Status;
  }

  const audit: AuditEntry[] = [
    { id: 'a01', ts: '2026-05-17 11:58:22', actor: 'alice@mr.market', actorRole: 'admin', action: 'pause', resource: 'strategy', resourceId: 'mm-usdc-usdt', ip: '10.0.0.12', status: 'ok',
      diff: [{ field: 'status', before: 'healthy', after: 'paused' }] },
    { id: 'a02', ts: '2026-05-17 11:42:01', actor: 'bob@mr.market', actorRole: 'operator', action: 'update', resource: 'strategy', resourceId: 'mm-btc-usdt',
      diff: [{ field: 'spread_bps', before: '5', after: '6' }, { field: 'max_inventory_bps', before: '40', after: '60' }],
      ip: '10.0.0.27', status: 'ok' },
    { id: 'a03', ts: '2026-05-17 11:30:55', actor: 'system', actorRole: 'system', action: 'rotate', resource: 'api_key', resourceId: 'ak_binance_prod', ip: '127.0.0.1', status: 'ok' },
    { id: 'a04', ts: '2026-05-17 11:14:08', actor: 'carol@mr.market', actorRole: 'viewer', action: 'login', resource: 'session', resourceId: 's_91022', ip: '203.0.113.42', status: 'ok' },
    { id: 'a05', ts: '2026-05-17 10:58:30', actor: 'unknown', actorRole: '—', action: 'login', resource: 'session', resourceId: '—', ip: '198.51.100.7', status: 'denied' },
    { id: 'a06', ts: '2026-05-17 10:32:11', actor: 'alice@mr.market', actorRole: 'admin', action: 'create', resource: 'role', resourceId: 'operator-readonly',
      diff: [{ field: 'permissions', before: '—', after: 'strategy:read,positions:read' }],
      ip: '10.0.0.12', status: 'ok' },
    { id: 'a07', ts: '2026-05-17 09:48:02', actor: 'dave@mr.market', actorRole: 'admin', action: 'delete', resource: 'api_key', resourceId: 'ak_test_okx_dev',
      ip: '10.0.0.91', status: 'ok' },
    { id: 'a08', ts: '2026-05-17 09:22:14', actor: 'bob@mr.market', actorRole: 'operator', action: 'approve', resource: 'withdrawal', resourceId: 'w_01HX0014',
      diff: [{ field: 'amount', before: '—', after: '12,400 USDT' }, { field: 'destination', before: '—', after: 'mixin:7000104242' }],
      ip: '10.0.0.27', status: 'ok' },
    { id: 'a09', ts: '2026-05-17 09:01:50', actor: 'alice@mr.market', actorRole: 'admin', action: 'mfa', resource: 'user', resourceId: 'carol@mr.market', ip: '10.0.0.12', status: 'ok' },
    { id: 'a10', ts: '2026-05-17 08:42:18', actor: 'system', actorRole: 'system', action: 'update', resource: 'config', resourceId: 'reconciliation.interval',
      diff: [{ field: 'value', before: '60s', after: '30s' }],
      ip: '127.0.0.1', status: 'ok' },
    { id: 'a11', ts: '2026-05-17 08:11:00', actor: 'eve@mr.market', actorRole: 'viewer', action: 'update', resource: 'strategy', resourceId: 'mm-eth-usdt', ip: '198.51.100.91', status: 'denied' },
  ];

  const statusTone: Record<Status, string> = {
    ok: 'bg-success/10 text-success',
    denied: 'bg-warning/10 text-warning',
    failed: 'bg-error/10 text-error',
  };

  const actionTone: Record<Action, string> = {
    create:  'bg-success/10 text-success',
    update:  'bg-info/10 text-info',
    delete:  'bg-error/10 text-error',
    login:   'bg-base-content/5 text-base-content/70',
    mfa:     'bg-accent/15 text-accent',
    rotate:  'bg-info/10 text-info',
    pause:   'bg-warning/10 text-warning',
    resume:  'bg-success/10 text-success',
    approve: 'bg-success/10 text-success',
  };

  let actorFilter = $state('');
  let statusFilter = $state<'all' | Status>('all');
  let resourceFilter = $state<'all' | string>('all');
  let expanded = $state<Record<string, boolean>>({});

  const resources = ['all', ...Array.from(new Set(audit.map((a) => a.resource)))];
  const statuses: Array<'all' | Status> = ['all', 'ok', 'denied', 'failed'];

  let filtered = $derived(
    audit.filter(
      (a) =>
        (actorFilter === '' || a.actor.toLowerCase().includes(actorFilter.toLowerCase())) &&
        (statusFilter === 'all' || a.status === statusFilter) &&
        (resourceFilter === 'all' || a.resource === resourceFilter),
    ),
  );

  const toggle = (id: string) => (expanded = { ...expanded, [id]: !expanded[id] });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="audit log"
    subtitle="Immutable record of every administrative action. Tamper-evident, retained 365 days."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">export csv</button>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">verify chain</button>
    {/snippet}
  </PageHeader>

  <!-- Filters -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="filter actor…"
          class="input input-sm input-bordered border-base-300 bg-base-100 min-w-[200px] font-mono text-xs"
          bind:value={actorFilter}
        />

        <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={resourceFilter}>
          {#each resources as r (r)}
            <option value={r}>{r === 'all' ? 'all resources' : r}</option>
          {/each}
        </select>

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

        <span class="ml-auto font-mono text-xs text-base-content/50">{filtered.length} / {audit.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">timestamp</th>
              <th class="font-medium">actor</th>
              <th class="font-medium">action</th>
              <th class="font-medium">resource</th>
              <th class="font-medium">ip</th>
              <th class="font-medium">status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as a (a.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td class="font-mono text-xs text-base-content/80">{a.ts}</td>
                <td>
                  <div class="flex flex-col">
                    <span class="font-mono text-sm text-base-content">{a.actor}</span>
                    <span class="text-xs text-base-content/50 capitalize">{a.actorRole}</span>
                  </div>
                </td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {actionTone[a.action]}">
                    {a.action}
                  </span>
                </td>
                <td>
                  <div class="flex flex-col">
                    <span class="text-sm text-base-content capitalize">{a.resource}</span>
                    <span class="font-mono text-xs text-base-content/50">{a.resourceId}</span>
                  </div>
                </td>
                <td class="font-mono text-xs text-base-content/70">{a.ip}</td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {statusTone[a.status]}">
                    {a.status}
                  </span>
                </td>
                <td class="text-right">
                  {#if a.diff && a.diff.length > 0}
                    <button class="btn btn-ghost btn-xs rounded-full text-base-content/60 capitalize" onclick={() => toggle(a.id)}>
                      {expanded[a.id] ? 'hide' : 'diff'}
                    </button>
                  {/if}
                </td>
              </tr>
              {#if expanded[a.id] && a.diff && a.diff.length > 0}
                <tr class="bg-neutral border-b border-base-300">
                  <td colspan="7" class="p-4">
                    <div class="flex flex-col gap-2">
                      <span class="text-xs text-base-content/50 uppercase tracking-wider">changes</span>
                      {#each a.diff as d (d.field)}
                        <div class="grid grid-cols-3 items-center gap-3 rounded-md border border-base-300 bg-base-100 p-2">
                          <span class="font-mono text-xs text-base-content/70">{d.field}</span>
                          <span class="font-mono text-xs text-error line-through">{d.before}</span>
                          <span class="font-mono text-xs text-success">{d.after}</span>
                        </div>
                      {/each}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
