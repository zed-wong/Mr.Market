<script lang="ts">
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';

  type Kind = 'duration' | 'bps' | 'pct' | 'number' | 'bool' | 'string';
  type Source = 'default' | 'env' | 'override';

  interface Setting {
    key: string;
    value: string;
    kind: Kind;
    source: Source;
    updatedAt: string;
    updatedBy: string;
    description: string;
    sensitive?: boolean;
  }

  interface Section {
    key: string;
    title: string;
    subtitle: string;
    settings: Setting[];
  }

  const sections: Section[] = [
    {
      key: 'scheduling',
      title: 'scheduling',
      subtitle: 'Tick cadence and worker dispatch policy.',
      settings: [
        { key: 'scheduler.tick_interval_ms',     value: '500',   kind: 'duration', source: 'override', updatedAt: '2026-04-12', updatedBy: 'alice@mr.market', description: 'Strategy controller tick period' },
        { key: 'scheduler.max_drift_ms',         value: '200',   kind: 'duration', source: 'default',  updatedAt: '2025-12-01', updatedBy: 'system',          description: 'Maximum acceptable tick drift before warn' },
        { key: 'intent_worker.concurrency',      value: '32',    kind: 'number',   source: 'override', updatedAt: '2026-03-22', updatedBy: 'bob@mr.market',   description: 'Parallel intent workers' },
        { key: 'intent_worker.retry_max',        value: '3',     kind: 'number',   source: 'default',  updatedAt: '2025-09-01', updatedBy: 'system',          description: 'Retry budget per intent' },
      ],
    },
    {
      key: 'risk',
      title: 'risk',
      subtitle: 'Pre-trade risk checks and inventory bounds.',
      settings: [
        { key: 'risk.max_inventory_bps',         value: '80',    kind: 'bps',      source: 'override', updatedAt: '2026-05-14', updatedBy: 'alice@mr.market', description: 'Hard inventory skew limit per strategy' },
        { key: 'risk.max_order_notional_usd',    value: '50000', kind: 'number',   source: 'override', updatedAt: '2026-02-09', updatedBy: 'dave@mr.market',  description: 'Single-order notional ceiling' },
        { key: 'risk.daily_loss_limit_pct',      value: '2.5',   kind: 'pct',      source: 'override', updatedAt: '2026-01-30', updatedBy: 'alice@mr.market', description: 'Auto-halt threshold (% of AUM)' },
        { key: 'risk.kill_switch_enabled',       value: 'true',  kind: 'bool',     source: 'default',  updatedAt: '2025-11-04', updatedBy: 'system',          description: 'Global trading kill switch' },
      ],
    },
    {
      key: 'reconciliation',
      title: 'reconciliation',
      subtitle: 'Ledger ↔ exchange consistency checks.',
      settings: [
        { key: 'reconciliation.interval',        value: '30s',   kind: 'duration', source: 'override', updatedAt: '2026-05-17', updatedBy: 'system',          description: 'Reconciler pass cadence' },
        { key: 'reconciliation.tolerance_bps',   value: '1',     kind: 'bps',      source: 'default',  updatedAt: '2025-08-12', updatedBy: 'system',          description: 'Allowed drift before blocking risk-increasing ops' },
        { key: 'reconciliation.block_on_mismatch', value: 'true', kind: 'bool',    source: 'default',  updatedAt: '2025-08-12', updatedBy: 'system',          description: 'Refuse new orders until reconciled' },
      ],
    },
    {
      key: 'fees',
      title: 'fees',
      subtitle: 'Maker/taker overrides and platform spread.',
      settings: [
        { key: 'fees.platform_bps',              value: '12',    kind: 'bps',      source: 'override', updatedAt: '2026-03-01', updatedBy: 'alice@mr.market', description: 'Platform-charged spread on user-facing orders' },
        { key: 'fees.maker_rebate_bps',          value: '-2',    kind: 'bps',      source: 'default',  updatedAt: '2025-04-22', updatedBy: 'system',          description: 'Maker rebate share to strategy PnL' },
        { key: 'fees.binance_taker_override_bps', value: '8',    kind: 'bps',      source: 'override', updatedAt: '2026-05-02', updatedBy: 'bob@mr.market',   description: 'VIP tier override for binance taker fee' },
      ],
    },
    {
      key: 'security',
      title: 'security',
      subtitle: 'Session, MFA, and audit policy.',
      settings: [
        { key: 'security.session_idle_minutes',  value: '30',    kind: 'duration', source: 'override', updatedAt: '2026-04-18', updatedBy: 'alice@mr.market', description: 'Inactive session timeout' },
        { key: 'security.mfa_required',          value: 'true',  kind: 'bool',     source: 'override', updatedAt: '2026-04-18', updatedBy: 'alice@mr.market', description: 'Enforce MFA for all admin users' },
        { key: 'security.audit_retention_days',  value: '365',   kind: 'number',   source: 'default',  updatedAt: '2025-01-01', updatedBy: 'system',          description: 'Audit log retention' },
        { key: 'security.api_secret_pepper',     value: '••••••••', kind: 'string', source: 'env',    updatedAt: '2024-11-20', updatedBy: 'system',          description: 'Server-side pepper for API secret hashing', sensitive: true },
      ],
    },
  ];

  const sourceTone: Record<Source, string> = {
    default:  'bg-base-content/5 text-base-content/60',
    env:      'bg-info/10 text-info',
    override: 'bg-warning/10 text-warning',
  };

  const kindTone: Record<Kind, string> = {
    duration: 'text-base-content',
    bps:      'text-base-content',
    pct:      'text-base-content',
    number:   'text-base-content',
    bool:     'text-info',
    string:   'text-base-content/70',
  };

  let activeSection = $state(sections[0].key);

  const totalOverrides = sections.reduce((s, sec) => s + sec.settings.filter((x) => x.source === 'override').length, 0);
  const total = sections.reduce((s, sec) => s + sec.settings.length, 0);
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title="system config"
    subtitle="Runtime configuration values. Overrides persist across restarts; env values are immutable."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize">export .env</button>
      <button class="btn btn-ghost btn-sm rounded-full capitalize">reload from disk</button>
    {/snippet}
  </PageHeader>

  <!-- Summary -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">total settings</span>
        <span class="font-mono text-2xl font-semibold">{total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">overrides</span>
        <span class="font-mono text-2xl font-semibold text-warning">{totalOverrides}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">sections</span>
        <span class="font-mono text-2xl font-semibold">{sections.length}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">config schema</span>
        <span class="font-mono text-2xl font-semibold">v2026.05</span>
      </div>
    </div>
  </div>

  <!-- Side nav + content -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
    <!-- Section nav -->
    <aside class="card border border-base-300 bg-base-100 shadow-none lg:col-span-1">
      <nav class="card-body gap-1 p-3">
        {#each sections as sec (sec.key)}
          <button
            type="button"
            class="flex items-center justify-between rounded-full px-3 py-2 text-left text-sm transition-colors hover:bg-neutral"
            class:bg-primary={activeSection === sec.key}
            class:text-primary-content={activeSection === sec.key}
            onclick={() => (activeSection = sec.key)}
          >
            <span class="capitalize">{sec.title}</span>
            <span class="font-mono text-[10px] opacity-60">{sec.settings.length}</span>
          </button>
        {/each}
      </nav>
    </aside>

    <!-- Active section -->
    {#each sections as sec (sec.key)}
      {#if activeSection === sec.key}
        <div class="card border border-base-300 bg-base-100 shadow-none lg:col-span-3">
          <div class="card-body gap-4 p-5">
            <div class="flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-lg font-semibold tracking-tight text-base-content capitalize">{sec.title}</span>
                <span class="text-xs text-base-content/50">{sec.subtitle}</span>
              </div>
              <span class="font-mono text-xs text-base-content/50">{sec.settings.length} settings</span>
            </div>

            <ul class="divide-y divide-base-300">
              {#each sec.settings as s (s.key)}
                <li class="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div class="flex min-w-0 flex-col">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm text-base-content truncate">{s.key}</span>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider {sourceTone[s.source]}">
                        {s.source}
                      </span>
                    </div>
                    <span class="text-xs text-base-content/50 mt-0.5">{s.description}</span>
                    <span class="font-mono text-[10px] text-base-content/40 mt-0.5">
                      updated {s.updatedAt} by {s.updatedBy}
                    </span>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm {kindTone[s.kind]}" class:font-semibold={s.source === 'override'}>
                      {s.value}
                    </span>
                    <span class="font-mono text-[10px] text-base-content/40 uppercase">{s.kind}</span>
                  </div>

                  <div class="flex items-center gap-1 md:justify-end">
                    {#if s.source === 'env'}
                      <span class="text-xs text-base-content/40 capitalize">read-only</span>
                    {:else}
                      <button class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/70">edit</button>
                      {#if s.source === 'override'}
                        <button class="btn btn-ghost btn-xs rounded-full capitalize text-error">reset</button>
                      {/if}
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</section>
