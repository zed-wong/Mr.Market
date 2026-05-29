<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminSystemConfig,
    resetAdminSystemConfig,
    updateAdminSystemConfig,
    type AdminSystemConfigItem,
    type AdminSystemConfigResponse,
  } from '$lib/helpers/api/system';

  const sourceTone: Record<string, string> = {
    default: 'bg-base-content/5 text-base-content/60',
    override: 'bg-warning/10 text-warning',
  };

  const typeTone: Record<string, string> = {
    decimal: 'text-base-content',
    boolean: 'text-info',
    string: 'text-base-content/70',
  };

  let response = $state<AdminSystemConfigResponse | null>(null);
  let activeSection = $state('');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let editingKey = $state<string | null>(null);
  let editValue = $state('');
  let savingKey = $state<string | null>(null);

  const sections = $derived(response?.sections ?? []);
  const activeItems = $derived(sections.find((section) => section.key === activeSection)?.items ?? []);

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
    cause instanceof Error ? cause.message : 'Unable to load system config';

  const loadConfig = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = response === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      const next = await fetchAdminSystemConfig();

      response = next;
      if (!activeSection || !next.sections.some((section) => section.key === activeSection)) {
        activeSection = next.sections[0]?.key ?? '';
      }
    } catch (cause) {
      error = errorMessage(cause);
      if (options.throwOnError) {
        throw new Error(error);
      }
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const refreshConfig = () =>
    toast.promise(loadConfig({ throwOnError: true }), {
      loading: 'refreshing system config',
      success: 'system config refreshed',
      error: 'failed to refresh system config',
    });

  const displayValue = (item: AdminSystemConfigItem) => {
    if (item.sensitive) {
      return item.maskedValue || 'masked';
    }

    if (item.value === null || item.value === undefined || item.value === '') {
      return 'empty';
    }

    return String(item.value);
  };

  const validationText = (item: AdminSystemConfigItem) => {
    const entries = Object.entries(item.validation);

    if (entries.length === 0) {
      return 'no extra constraints';
    }

    return entries.map(([key, value]) => `${key}: ${value}`).join(' · ');
  };

  const startEdit = (item: AdminSystemConfigItem) => {
    if (!item.mutable || item.sensitive) {
      return;
    }

    editingKey = item.key;
    editValue = item.value === null || item.value === undefined ? '' : String(item.value);
    actionMessage = null;
  };

  const cancelEdit = () => {
    editingKey = null;
    editValue = '';
  };

  const normalizedValue = (item: AdminSystemConfigItem) => {
    if (item.type === 'boolean') {
      return editValue === 'true';
    }

    return editValue;
  };

  const saveEdit = async (item: AdminSystemConfigItem) => {
    if (!item.mutable || item.sensitive || savingKey) {
      return;
    }

    savingKey = item.key;
    actionMessage = null;

    try {
      const result = await updateAdminSystemConfig(item.key, normalizedValue(item));
      actionMessage = `Saved ${result.item.key} through the whitelisted config API.`;
      editingKey = null;
      editValue = '';
      await loadConfig();
    } catch (cause) {
      actionMessage = errorMessage(cause);
    } finally {
      savingKey = null;
    }
  };

  const resetItem = async (item: AdminSystemConfigItem) => {
    if (!item.mutable || item.sensitive || savingKey) {
      return;
    }

    savingKey = item.key;
    actionMessage = null;

    try {
      const result = await resetAdminSystemConfig(item.key);
      actionMessage = `Reset ${result.item.key} through the whitelisted config API.`;
      await loadConfig();
    } catch (cause) {
      actionMessage = errorMessage(cause);
    } finally {
      savingKey = null;
    }
  };

  const resetView = () => {
    activeSection = response?.sections[0]?.key ?? '';
    void loadConfig();
  };

  onMount(() => {
    void loadConfig();
  });
</script>

<section class="space-y-6" data-testid="system-config-page">
  <PageHeader
    eyebrow="system"
    title="system config"
    subtitle="Allowlisted safe runtime configuration metadata from the authenticated admin API. Disk and environment controls are disabled."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled
        title="Environment exports are intentionally disabled and are not backed by any API."
      >env export disabled</button>
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled
        title="Reloading configuration from disk is intentionally unavailable."
      >disk reload disabled</button>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing || Boolean(savingKey)}
        onclick={() => void refreshConfig()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">whitelisted keys</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.summary.total)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">mutable</span>
        <span class="font-mono text-2xl font-semibold text-info">{formatNumber(response?.summary.mutable)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">overrides</span>
        <span class="font-mono text-2xl font-semibold text-warning">{formatNumber(response?.summary.overrides)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">schema</span>
        <span class="font-mono text-xl font-semibold text-base-content">{response?.schemaVersion ?? 'pending'}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-3 p-5">
      <span class="text-sm font-semibold text-base-content capitalize">unsafe actions unavailable</span>
      <span class="text-sm text-base-content/60">
        This page never reads .env files, never exports raw environment values, and only mutates explicit backend-allowlisted custom config keys.
      </span>
    </div>
  </div>

  {#if loading}
    <div class="card border border-base-300 bg-base-100 shadow-none" data-testid="config-loading">
      <div class="card-body flex-row items-center gap-3 p-5">
        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
        <span class="text-sm text-base-content/60 capitalize">loading whitelisted backend config</span>
      </div>
    </div>
  {:else if error}
    <div class="card border border-error/30 bg-base-100 shadow-none" data-testid="config-error">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">config unavailable</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadConfig()}>retry</button>
          <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetView}>reset view</button>
        </div>
      </div>
    </div>
  {:else if response}
    {#if actionMessage}
      <div class="rounded-lg border border-base-300 p-3">
        <span class="text-sm text-base-content/70">{actionMessage}</span>
      </div>
    {/if}

    {#if response.items.length === 0}
      <div class="card border border-base-300 bg-base-100 shadow-none" data-testid="config-empty">
        <div class="card-body items-center gap-2 p-8 text-center">
          <span class="text-sm font-semibold text-base-content capitalize">no whitelisted config returned</span>
          <span class="text-sm text-base-content/60">The backend returned an empty allowlist; no fixture or environment-derived settings are shown.</span>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <aside class="card border border-base-300 bg-base-100 shadow-none lg:col-span-1">
          <nav class="card-body gap-1 p-3">
            {#each sections as section (section.key)}
              <button
                type="button"
                class="flex items-center justify-between rounded-full px-3 py-2 text-left text-sm transition-colors hover:bg-neutral"
                class:bg-primary={activeSection === section.key}
                class:text-primary-content={activeSection === section.key}
                onclick={() => (activeSection = section.key)}
              >
                <span class="capitalize">{section.label}</span>
                <span class="font-mono text-[10px] opacity-60">{section.items.length}</span>
              </button>
            {/each}
          </nav>
        </aside>

        <div class="card border border-base-300 bg-base-100 shadow-none lg:col-span-3">
          <div class="card-body gap-4 p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-col">
                <span class="text-lg font-semibold tracking-tight text-base-content capitalize">{sections.find((section) => section.key === activeSection)?.label ?? 'config'}</span>
                <span class="text-xs text-base-content/50">generated {formatTimestamp(response.generatedAt)}</span>
              </div>
              <span class="font-mono text-xs text-base-content/50">{activeItems.length} allowlisted keys</span>
            </div>

            <ul class="divide-y divide-base-300">
              {#each activeItems as item (item.key)}
                <li class="grid grid-cols-1 gap-3 py-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono text-sm text-base-content">{item.key}</span>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {sourceTone[item.sourceState] || 'bg-base-content/5 text-base-content/60'}">
                        {item.sourceState}
                      </span>
                      <span class="rounded-full bg-base-content/5 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider text-base-content/60">
                        {item.sourceClass}
                      </span>
                      {#if item.sensitive}
                        <span class="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider text-warning">masked</span>
                      {/if}
                    </div>
                    <span class="text-sm text-base-content/70">{item.label}</span>
                    <span class="text-xs text-base-content/50">{item.description}</span>
                    <span class="font-mono text-[10px] text-base-content/40">
                      updated {formatTimestamp(item.updatedAt)} by {item.updatedBy || 'backend unavailable'} · {validationText(item)}
                    </span>
                  </div>

                  <div class="flex min-w-[220px] items-center gap-2 xl:justify-end">
                    {#if editingKey === item.key}
                      {#if item.type === 'boolean'}
                        <select class="select select-sm select-bordered border-base-300 bg-base-100" bind:value={editValue}>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      {:else}
                        <input
                          class="input input-sm input-bordered border-base-300 bg-base-100 font-mono text-xs"
                          maxlength={response.limits.maxStringLength}
                          bind:value={editValue}
                        />
                      {/if}
                    {:else}
                      <span class="font-mono text-sm {typeTone[item.type] || 'text-base-content'}" class:font-semibold={item.sourceState === 'override'}>
                        {displayValue(item)}
                      </span>
                    {/if}
                    <span class="font-mono text-[10px] text-base-content/40 capitalize">{item.type}</span>
                  </div>

                  <div class="flex items-center gap-1 xl:justify-end">
                    {#if item.sensitive || !item.mutable}
                      <span class="text-xs text-base-content/40 capitalize">read-only</span>
                    {:else if editingKey === item.key}
                      <button
                        type="button"
                        class="btn btn-primary btn-xs rounded-full capitalize"
                        disabled={savingKey === item.key}
                        onclick={() => void saveEdit(item)}
                      >{savingKey === item.key ? 'saving' : 'save'}</button>
                      <button type="button" class="btn btn-ghost btn-xs rounded-full capitalize" disabled={Boolean(savingKey)} onclick={cancelEdit}>cancel</button>
                    {:else}
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/70"
                        disabled={Boolean(savingKey)}
                        onclick={() => startEdit(item)}
                      >edit</button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs rounded-full capitalize text-error"
                        disabled={item.sourceState !== 'override' || Boolean(savingKey)}
                        title={item.sourceState === 'override' ? 'Reset through the whitelisted backend config API.' : 'Already at backend default value.'}
                        onclick={() => void resetItem(item)}
                      >reset</button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</section>
