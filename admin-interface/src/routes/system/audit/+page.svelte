<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    AUDIT_STATUSES,
    fetchAdminSystemAudit,
    type AdminAuditLogEntry,
    type AdminAuditStatus,
    type AdminSystemAuditResponse,
  } from '$lib/helpers/api/system';

  const limitOptions = [25, 50, 100, 200];
  const statuses: Array<'all' | AdminAuditStatus> = ['all', ...AUDIT_STATUSES];

  const statusTone: Record<AdminAuditStatus, string> = {
    success: 'bg-success/10 text-success',
    denied: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  };

  const actionTone: Record<string, string> = {
    login: 'bg-base-content/5 text-base-content/70',
    logout: 'bg-base-content/5 text-base-content/70',
    session: 'bg-info/10 text-info',
    update: 'bg-info/10 text-info',
    reset: 'bg-warning/10 text-warning',
    create: 'bg-success/10 text-success',
    delete: 'bg-error/10 text-error',
  };

  let response = $state<AdminSystemAuditResponse | null>(null);
  let actorFilter = $state('');
  let actionFilter = $state('');
  let resourceFilter = $state('');
  let statusFilter = $state<'all' | AdminAuditStatus>('all');
  let fromFilter = $state('');
  let toFilter = $state('');
  let page = $state(1);
  let limit = $state(50);
  let loading = $state(true);
  let refreshing = $state(false);
  let exporting = $state(false);
  let verifying = $state(false);
  let actionMessage = $state<string | null>(null);
  let error = $state<string | null>(null);
  let expanded = $state<Record<string, boolean>>({});

  const rows = $derived(response?.entries ?? []);

  const formatNumber = (value: number | string | undefined) => {
    const number = Number(value ?? 0);

    if (!Number.isFinite(number)) {
      return String(value ?? '0');
    }

    return new Intl.NumberFormat('en-US').format(number);
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) {
      return 'unavailable';
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : $_('admin_audit_load_failed');

  const toBackendDate = (value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    const parsed = new Date(value);

    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value.trim();
  };

  const jsonPreview = (value: unknown) => {
    if (value === null || value === undefined) {
      return 'null';
    }

    return JSON.stringify(value, null, 2);
  };

  const hasDetails = (record: AdminAuditLogEntry) =>
    record.metadata !== null || record.diff !== null || record.requestContext !== null;

  const toggle = (id: string) => {
    expanded = { ...expanded, [id]: !expanded[id] };
  };

  const loadAudit = async (options: { exportAudit?: boolean; integrity?: boolean; throwOnError?: boolean } = {}) => {
    const initialLoad = response === null && !options.exportAudit && !options.integrity;

    if (options.exportAudit) {
      exporting = true;
    } else if (options.integrity) {
      verifying = true;
    } else {
      loading = initialLoad;
      refreshing = !initialLoad;
      error = null;
    }
    actionMessage = null;

    try {
      const next = await fetchAdminSystemAudit({
        actor: actorFilter,
        action: actionFilter,
        resource: resourceFilter,
        status: statusFilter,
        from: toBackendDate(fromFilter),
        to: toBackendDate(toFilter),
        page,
        limit,
        exportAudit: options.exportAudit,
        integrity: options.integrity,
      });

      response = next;
      page = next.pagination.page;
      limit = next.pagination.limit;

      if (options.exportAudit) {
        const content = next.export?.content ?? '';
        const blob = new Blob([content], { type: next.export?.format ?? 'application/x-ndjson' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `admin-audit-${new Date(next.generatedAt).toISOString()}.ndjson`;
        link.click();
        URL.revokeObjectURL(url);
        actionMessage = $_('admin_audit_exported_message', {
          values: {
            count: formatNumber(next.pagination.returned),
            bytes: formatNumber(next.export?.byteLength ?? 0),
          },
        });
      }

      if (options.integrity) {
        actionMessage = next.integrity
          ? $_('admin_audit_integrity_verified_message', {
              values: {
                count: formatNumber(next.integrity.checked),
                valid: next.integrity.valid ? $_('yes') : $_('no'),
              },
            })
          : $_('admin_audit_integrity_response_unavailable');
      }
    } catch (cause) {
      if (options.exportAudit || options.integrity) {
        actionMessage = errorMessage(cause);
      } else {
        error = errorMessage(cause);
      }
      if (options.throwOnError) {
        throw new Error(errorMessage(cause));
      }
    } finally {
      loading = false;
      refreshing = false;
      exporting = false;
      verifying = false;
    }
  };

  const refreshAudit = () =>
    toast.promise(loadAudit({ throwOnError: true }), {
      loading: $_('admin_audit_refreshing'),
      success: $_('admin_audit_refreshed'),
      error: $_('admin_audit_refresh_failed'),
    });

  const applyFilters = () => {
    page = 1;
    void loadAudit();
  };

  const resetFilters = () => {
    actorFilter = '';
    actionFilter = '';
    resourceFilter = '';
    statusFilter = 'all';
    fromFilter = '';
    toFilter = '';
    page = 1;
    void loadAudit();
  };

  const changeLimit = () => {
    page = 1;
    void loadAudit();
  };

  const goToPage = (next: number) => {
    if (!response || next < 1 || (next === page) || (next > page && !response.pagination.hasMore)) {
      return;
    }

    page = next;
    void loadAudit();
  };

  onMount(() => {
    void loadAudit();
  });
</script>

<section class="space-y-6" data-testid="system-audit-page">
  <PageHeader
    eyebrow={$_('admin.nav.system')}
    title={$_('admin.nav.audit_log')}
    subtitle={$_('admin_audit_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled={loading || refreshing || exporting || verifying}
        onclick={() => void loadAudit({ exportAudit: true })}
      >{exporting ? 'exporting' : 'export bounded'}</button>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing || exporting || verifying}
        onclick={() => void refreshAudit()}
      >{refreshing ? $_('refreshing_msg') : $_('refresh')}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_audit_matching_records')}</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.total)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_audit_returned')}</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.returned)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_audit_page')}</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.page ?? page)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_strategy_updated')}</span>
        <span class="font-mono text-sm font-semibold text-base-content">{formatTimestamp(response?.generatedAt)}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={$_('admin_audit_actor_filter_placeholder')}
          class="input input-sm input-bordered min-w-[180px] border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxFilterLength ?? 120}
          bind:value={actorFilter}
          onkeydown={(event) => event.key === 'Enter' && applyFilters()}
        />
        <input
          type="text"
          placeholder={$_('admin_audit_action_filter_placeholder')}
          class="input input-sm input-bordered min-w-[160px] border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxFilterLength ?? 120}
          bind:value={actionFilter}
          onkeydown={(event) => event.key === 'Enter' && applyFilters()}
        />
        <input
          type="text"
          placeholder={$_('admin_audit_resource_filter_placeholder')}
          class="input input-sm input-bordered min-w-[170px] border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxFilterLength ?? 120}
          bind:value={resourceFilter}
          onkeydown={(event) => event.key === 'Enter' && applyFilters()}
        />
        <div class="join">
          {#each statuses as status (status)}
            <button
              type="button"
              class="btn btn-sm join-item capitalize {statusFilter === status ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => {
                statusFilter = status;
                applyFilters();
              }}
            >{status}</button>
          {/each}
        </div>
        <input
          type="datetime-local"
          class="input input-sm input-bordered border-base-300 bg-base-100 font-mono text-xs"
          bind:value={fromFilter}
          aria-label="from timestamp"
        />
        <input
          type="datetime-local"
          class="input input-sm input-bordered border-base-300 bg-base-100 font-mono text-xs"
          bind:value={toFilter}
          aria-label="to timestamp"
        />
        <button type="button" class="btn btn-sm btn-ghost rounded-full capitalize" disabled={loading || refreshing} onclick={applyFilters}>{$_('admin_filter')}</button>
        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 font-mono text-xs"
          bind:value={limit}
          disabled={loading || refreshing}
          onchange={changeLimit}
        >
          {#each limitOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="audit-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">{$_('admin_audit_loading')}</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="audit-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_audit_unavailable')}</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadAudit()}>{$_('admin_retry')}</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
            </div>
          </div>
        </div>
      {:else if response}
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-base-content/50">
            {$_('admin_audit_page_count', {
              values: {
                page: response.pagination.page,
                returned: response.pagination.returned,
                total: response.pagination.total,
              },
            })}
          </span>
          <span class="text-xs text-base-content/50">{$_('admin_audit_max_records', { values: { count: response.limits.maxLimit } })}</span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        {#if actionMessage}
          <div class="rounded-lg border border-base-300 p-3">
            <span class="text-sm text-base-content/70">{actionMessage}</span>
          </div>
        {/if}

        {#if rows.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="audit-empty">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_audit_empty_title')}</span>
            <span class="text-sm text-base-content/60">{$_('admin_audit_empty_message')}</span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">{$_('admin_audit_timestamp')}</th>
                  <th class="font-medium">{$_('admin_audit_actor')}</th>
                  <th class="font-medium">{$_('action')}</th>
                  <th class="font-medium">{$_('admin_audit_resource')}</th>
                  <th class="font-medium">{$_('admin_audit_request_context')}</th>
                  <th class="font-medium">{$_('status')}</th>
                  <th class="font-medium">{$_('admin_audit_hash')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each rows as record (record.id)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td class="font-mono text-xs text-base-content/80">{formatTimestamp(record.timestamp)}</td>
                    <td class="font-mono text-xs text-base-content">{record.actor}</td>
                    <td>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {actionTone[record.action] || 'bg-base-content/5 text-base-content/60'}">
                        {record.action}
                      </span>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content">{record.resource}</span>
                        <span class="font-mono text-[10px] text-base-content/40">{record.id}</span>
                      </div>
                    </td>
                    <td class="max-w-xs truncate font-mono text-xs text-base-content/60" title={jsonPreview(record.requestContext)}>{jsonPreview(record.requestContext)}</td>
                    <td>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {statusTone[record.status]}">
                        {record.status}
                      </span>
                    </td>
                    <td>
                      <span class="font-mono text-[10px] text-base-content/50">{record.contentHash.slice(0, 12)}…</span>
                    </td>
                    <td class="text-right">
                      <button
                        class="btn btn-ghost btn-xs rounded-full text-base-content/60 capitalize"
                        disabled={!hasDetails(record)}
                        onclick={() => toggle(record.id)}
                      >{expanded[record.id] ? $_('admin.hide') : $_('admin_strategy_details')}</button>
                    </td>
                  </tr>
                  {#if expanded[record.id]}
                    <tr class="border-b border-base-300 bg-neutral">
                      <td colspan="8" class="p-4">
                        <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                            <span class="text-xs text-base-content/50 capitalize">{$_('admin_audit_metadata')}</span>
                            <pre class="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-base-content/70">{jsonPreview(record.metadata)}</pre>
                          </div>
                          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                            <span class="text-xs text-base-content/50 capitalize">{$_('admin_audit_diff')}</span>
                            <pre class="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-base-content/70">{jsonPreview(record.diff)}</pre>
                          </div>
                          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                            <span class="text-xs text-base-content/50 capitalize">{$_('admin_audit_request_context')}</span>
                            <pre class="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-base-content/70">{jsonPreview(record.requestContext)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              {$_('admin_audit_export_integrity_hint')}
            </span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={page <= 1 || refreshing}
                onclick={() => goToPage(page - 1)}
              >{$_('previous')}</button>
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={!response.pagination.hasMore || refreshing}
                onclick={() => goToPage(page + 1)}
              >{$_('next')}</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>
