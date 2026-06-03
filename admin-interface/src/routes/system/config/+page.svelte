<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
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
    cause instanceof Error ? cause.message : $_('admin_config_load_failed');

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
      loading: $_('admin_config_refreshing'),
      success: $_('admin_config_refreshed'),
      error: $_('admin_config_refresh_failed'),
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
    eyebrow={$_('admin.nav.system')}
    title={$_('admin.nav.system_config')}
    subtitle={$_('admin_config_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing || Boolean(savingKey)}
        onclick={() => void refreshConfig()}
      >{refreshing ? $_('refreshing_msg') : $_('refresh')}</button>
    {/snippet}
  </PageHeader>

  {#if loading}
    <div class="card border border-base-300 bg-base-100 shadow-none" data-testid="config-loading">
      <div class="card-body flex-row items-center gap-3 p-5">
        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
        <span class="text-sm text-base-content/60 capitalize">{$_('admin_config_loading')}</span>
      </div>
    </div>
  {:else if error}
    <div class="card border border-error/30 bg-base-100 shadow-none" data-testid="config-error">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">{$_('admin_config_unavailable')}</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadConfig()}>{$_('admin_retry')}</button>
          <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetView}>{$_('admin_config_reset_view')}</button>
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
          <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_config_empty_title')}</span>
          <span class="text-sm text-base-content/60">{$_('admin_config_empty_message')}</span>
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
                <span class="text-lg font-semibold tracking-tight text-base-content capitalize">{sections.find((section) => section.key === activeSection)?.label ?? $_('admin_config_config')}</span>
                <span class="text-xs text-base-content/50">{$_('admin_config_last_synced', { values: { time: formatTimestamp(response.generatedAt) } })}</span>
              </div>
              <span class="font-mono text-xs text-base-content/50">{$_('admin_config_keys_in_section', { values: { count: activeItems.length } })}</span>
            </div>

            <ul class="divide-y divide-base-300">
              {#each activeItems as item (item.key)}
                <li class="grid grid-cols-1 gap-3 py-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono text-sm text-base-content">{item.key}</span>
                      {#if item.sourceState === 'override'}
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {sourceTone[item.sourceState]}">
                          {$_('admin_config_override')}
                        </span>
                      {/if}
                      {#if item.sensitive}
                        <span class="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider text-warning">{$_('admin_config_masked')}</span>
                      {/if}
                    </div>
                    <span class="text-sm text-base-content/70">{item.label}</span>
                    <span class="text-xs text-base-content/50">{item.description}</span>
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
                  </div>

                  <div class="flex items-center gap-1 xl:justify-end">
                    {#if item.sensitive || !item.mutable}
                      <span class="text-xs text-base-content/40 capitalize">{$_('read_only')}</span>
                    {:else if editingKey === item.key}
                      <button
                        type="button"
                        class="btn btn-primary btn-xs rounded-full capitalize"
                        disabled={savingKey === item.key}
                        onclick={() => void saveEdit(item)}
                      >{savingKey === item.key ? $_('admin_config_saving') : $_('save')}</button>
                      <button type="button" class="btn btn-ghost btn-xs rounded-full capitalize" disabled={Boolean(savingKey)} onclick={cancelEdit}>{$_('cancel')}</button>
                    {:else}
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/70"
                        disabled={Boolean(savingKey)}
                        onclick={() => startEdit(item)}
                      >{$_('edit')}</button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs rounded-full capitalize text-error"
                        disabled={item.sourceState !== 'override' || Boolean(savingKey)}
                        title={item.sourceState === 'override' ? $_('admin_config_reset_title') : $_('admin_config_already_default_title')}
                        onclick={() => void resetItem(item)}
                      >{$_('admin_strategy_reset_to_template')}</button>
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
