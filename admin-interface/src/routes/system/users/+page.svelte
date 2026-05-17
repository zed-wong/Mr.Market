<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Role = 'admin' | 'operator' | 'viewer';
  type Status = 'active' | 'invited' | 'suspended';

  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    status: Status;
    mfa: boolean;
    passkey: boolean;
    lastLogin: string;
    createdAt: string;
  }

  const users: User[] = [
    { id: '1', name: 'Alice Chen',      email: 'alice@mr.market',   role: 'admin',    status: 'active',    mfa: true,  passkey: true,  lastLogin: '2026-05-17 11:58', createdAt: '2024-04-02' },
    { id: '2', name: 'Bob Miller',      email: 'bob@mr.market',     role: 'operator', status: 'active',    mfa: true,  passkey: false, lastLogin: '2026-05-17 11:42', createdAt: '2024-06-12' },
    { id: '3', name: 'Carol Yang',      email: 'carol@mr.market',   role: 'viewer',   status: 'active',    mfa: true,  passkey: true,  lastLogin: '2026-05-17 11:14', createdAt: '2024-09-21' },
    { id: '4', name: 'Dave Schmidt',    email: 'dave@mr.market',    role: 'admin',    status: 'active',    mfa: true,  passkey: true,  lastLogin: '2026-05-17 09:48', createdAt: '2023-11-08' },
    { id: '5', name: 'Eve Park',        email: 'eve@mr.market',     role: 'viewer',   status: 'suspended', mfa: false, passkey: false, lastLogin: '2026-05-17 08:11', createdAt: '2025-01-30' },
    { id: '6', name: 'Frank Watanabe',  email: 'frank@mr.market',   role: 'operator', status: 'active',    mfa: true,  passkey: false, lastLogin: '2026-05-16 22:04', createdAt: '2025-03-14' },
    { id: '7', name: 'Grace Lin',       email: 'grace@mr.market',   role: 'viewer',   status: 'invited',   mfa: false, passkey: false, lastLogin: '—',                createdAt: '2026-05-15' },
    { id: '8', name: 'Hank Rivera',     email: 'hank@mr.market',    role: 'operator', status: 'active',    mfa: true,  passkey: true,  lastLogin: '2026-05-17 07:33', createdAt: '2025-08-19' },
  ];

  const roleTone: Record<Role, string> = {
    admin: 'bg-base-content text-base-100',
    operator: 'bg-info/10 text-info',
    viewer: 'bg-base-content/5 text-base-content/70',
  };

  const statusTone: Record<Status, string> = {
    active:    'bg-success/10 text-success',
    invited:   'bg-warning/10 text-warning',
    suspended: 'bg-error/10 text-error',
  };

  const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  let query = $state('');
  let roleFilter = $state<'all' | Role>('all');
  let statusFilter = $state<'all' | Status>('all');

  let filtered = $derived(
    users.filter(
      (u) =>
        (query === '' || u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())) &&
        (roleFilter === 'all' || u.role === roleFilter) &&
        (statusFilter === 'all' || u.status === statusFilter),
    ),
  );

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    mfa: users.filter((u) => u.mfa).length,
    admins: users.filter((u) => u.role === 'admin').length,
  };

  const roles: Array<'all' | Role> = ['all', 'admin', 'operator', 'viewer'];
  const statuses: Array<'all' | Status> = ['all', 'active', 'invited', 'suspended'];
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="users"
    subtitle="Administrative users with access to the operator console. Roles control resource permissions."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">export</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize">+ invite user</button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">total users</span>
        <span class="font-mono text-2xl font-semibold">{stats.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">active</span>
        <span class="font-mono text-2xl font-semibold text-success">{stats.active}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">mfa enabled</span>
        <span class="font-mono text-2xl font-semibold">{stats.mfa} / {stats.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">admins</span>
        <span class="font-mono text-2xl font-semibold">{stats.admins}</span>
      </div>
    </div>
  </div>

  <!-- Filters + Table -->
  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="search name or email…"
          class="input input-sm input-bordered border-base-300 bg-base-100 min-w-[240px] text-xs"
          bind:value={query}
        />

        <div class="join">
          {#each roles as r (r)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={roleFilter === r}
              onclick={() => (roleFilter = r)}
            >
              {r}
            </button>
          {/each}
        </div>

        <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={statusFilter}>
          {#each statuses as s (s)}
            <option value={s}>{s === 'all' ? 'all status' : s}</option>
          {/each}
        </select>

        <span class="ml-auto font-mono text-xs text-base-content/50">{filtered.length} / {users.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
              <th class="font-medium">user</th>
              <th class="font-medium">role</th>
              <th class="font-medium">status</th>
              <th class="font-medium">security</th>
              <th class="font-medium">last login</th>
              <th class="font-medium">created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as u (u.id)}
              <tr class="border-b border-base-300 hover:bg-neutral">
                <td>
                  <div class="flex items-center gap-3">
                    <span class="flex h-9 w-9 items-center justify-center rounded-full border border-base-300 bg-neutral text-xs font-medium text-base-content">
                      {initials(u.name)}
                    </span>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-base-content">{u.name}</span>
                      <span class="font-mono text-xs text-base-content/50">{u.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {roleTone[u.role]}">
                    {u.role}
                  </span>
                </td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {statusTone[u.status]}">
                    {u.status}
                  </span>
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    {#if u.mfa}
                      <span class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">mfa</span>
                    {:else}
                      <span class="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-error">no mfa</span>
                    {/if}
                    {#if u.passkey}
                      <span class="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">passkey</span>
                    {/if}
                  </div>
                </td>
                <td class="font-mono text-xs text-base-content/70">{u.lastLogin}</td>
                <td class="font-mono text-xs text-base-content/50">{u.createdAt}</td>
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
          <span class="text-sm text-base-content/60 capitalize">no users match the filters</span>
          <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={() => { query = ''; roleFilter = 'all'; statusFilter = 'all'; }}>
            reset filters
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>
