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

  type PlannedEnvConfig = {
    key: string;
    label: string;
    category: string;
    defaultValue: string;
    type: 'string' | 'boolean' | 'number';
    visibility: 'admin' | 'developer';
    sensitivity: 'plain' | 'secret-like';
    effectiveMode: 'restart required' | 'runtime reloadable';
    description: string;
  };

  const plannedEnvConfigs: PlannedEnvConfig[] = [
    {
      key: 'MARKET_MAKING_EXECUTE_INTENTS',
      label: 'Execute market-making intents',
      category: 'runtime',
      defaultValue: 'false',
      type: 'boolean',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Kill switch for whether persisted market-making intents are executed against exchanges.',
    },
    {
      key: 'RUN_MIXIN_SNAPSHOTS',
      label: 'Run Mixin snapshots',
      category: 'runtime',
      defaultValue: 'false',
      type: 'boolean',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Enables the Mixin snapshot ingestion cron and queue flow.',
    },
    {
      key: 'WEB3_GAS_MULTIPLIER',
      label: 'Web3 gas multiplier',
      category: 'integrations',
      defaultValue: '1',
      type: 'number',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Multiplier applied to Web3 gas estimates; should be range-validated before becoming editable.',
    },
    {
      key: 'HUFI_CAMPAIGN_LAUNCHER_API_URL',
      label: 'HuFi campaign launcher API URL',
      category: 'integrations',
      defaultValue: 'https://cl.hu.finance',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Base URL used by campaign discovery requests.',
    },
    {
      key: 'HUFI_RECORDING_ORACLE_API_URL',
      label: 'HuFi recording oracle API URL',
      category: 'integrations',
      defaultValue: 'https://ro.hu.finance',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Base URL used by recording-oracle authentication and contribution calls.',
    },
    {
      key: 'REWARD_MIXIN_VAULT_USER_ID',
      label: 'Reward Mixin vault user ID',
      category: 'rewards',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Mixin vault destination for reward transfers; changes need confirmation and audit.',
    },
    {
      key: 'ADMIN_PASSKEY_RP_NAME',
      label: 'Admin passkey RP name',
      category: 'security',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Display name used by WebAuthn passkey registration and authentication.',
    },
    {
      key: 'ADMIN_PASSKEY_RP_ID',
      label: 'Admin passkey RP ID',
      category: 'security',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'WebAuthn relying-party ID; wrong values can break passkey login.',
    },
    {
      key: 'ADMIN_PASSKEY_ORIGIN',
      label: 'Admin passkey origin',
      category: 'security',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Expected WebAuthn origin for admin passkey authentication.',
    },
    {
      key: 'CORS_ORIGIN',
      label: 'CORS origin',
      category: 'security',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Allowed browser origin for backend requests.',
    },
    {
      key: 'MARKET_MAKING_TICK_SIZE_MS',
      label: 'Market-making tick size',
      category: 'developer tuning',
      defaultValue: '1000',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Internal scheduler cadence; too small can cause overlapping ticks or higher CPU usage.',
    },
    {
      key: 'MARKET_MAKING_INTENT_MAX_RETRIES',
      label: 'Intent max retries',
      category: 'developer tuning',
      defaultValue: '2',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Maximum retry count for failed intent execution attempts.',
    },
    {
      key: 'MARKET_MAKING_INTENT_RETRY_BASE_DELAY_MS',
      label: 'Intent retry base delay',
      category: 'developer tuning',
      defaultValue: '250',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Base delay used when retrying failed intent execution.',
    },
    {
      key: 'MARKET_MAKING_INTENT_WORKER_POLL_INTERVAL_MS',
      label: 'Intent worker poll interval',
      category: 'developer tuning',
      defaultValue: '100',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Worker polling cadence for pending strategy intents.',
    },
    {
      key: 'MARKET_MAKING_INTENT_WORKER_MAX_IN_FLIGHT',
      label: 'Intent worker max in flight',
      category: 'developer tuning',
      defaultValue: '8',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Global intent worker concurrency limit; high values can increase exchange rate-limit risk.',
    },
    {
      key: 'MARKET_MAKING_INTENT_WORKER_MAX_IN_FLIGHT_PER_EXCHANGE',
      label: 'Intent worker max in flight per exchange',
      category: 'developer tuning',
      defaultValue: '1',
      type: 'number',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Per-exchange intent worker concurrency limit.',
    },
    {
      key: 'CORS_ALLOW_WILDCARD',
      label: 'Allow wildcard CORS',
      category: 'developer tuning',
      defaultValue: 'false',
      type: 'boolean',
      visibility: 'developer',
      sensitivity: 'plain',
      effectiveMode: 'restart required',
      description: 'Dangerous development-only CORS escape hatch; should stay disabled in production.',
    },
    {
      key: 'WEB3_MAINNET_RPC_URL',
      label: 'Ethereum mainnet RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
    {
      key: 'WEB3_SEPOLIA_RPC_URL',
      label: 'Ethereum Sepolia RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
    {
      key: 'WEB3_POLYGON_RPC_URL',
      label: 'Polygon RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
    {
      key: 'WEB3_POLYGON_AMOY_RPC_URL',
      label: 'Polygon Amoy RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
    {
      key: 'WEB3_BSC_MAINNET_RPC_URL',
      label: 'BSC mainnet RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
    {
      key: 'WEB3_BSC_TESTNET_RPC_URL',
      label: 'BSC testnet RPC URL',
      category: 'secret-like endpoints',
      defaultValue: '',
      type: 'string',
      visibility: 'admin',
      sensitivity: 'secret-like',
      effectiveMode: 'restart required',
      description: 'RPC endpoint; provider URLs often contain tokens, so the DB version should mask or encrypt it.',
    },
  ];

  let response = $state<AdminSystemConfigResponse | null>(null);
  let activeSection = $state('');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let editingKey = $state<string | null>(null);
  let editValue = $state('');
  let savingKey = $state<string | null>(null);
  let showDeveloperEnv = $state(false);

  const sections = $derived(response?.sections ?? []);
  const activeItems = $derived(sections.find((section) => section.key === activeSection)?.items ?? []);
  const previewItems = $derived(
    plannedEnvConfigs.filter((item) => showDeveloperEnv || item.visibility === 'admin'),
  );

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
    subtitle="Review and edit backend-allowlisted runtime config."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing || Boolean(savingKey)}
        onclick={() => void refreshConfig()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

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
                <span class="text-xs text-base-content/50">Last synced {formatTimestamp(response.generatedAt)}</span>
              </div>
              <span class="font-mono text-xs text-base-content/50">{activeItems.length} keys in this section</span>
            </div>

            <ul class="divide-y divide-base-300">
              {#each activeItems as item (item.key)}
                <li class="grid grid-cols-1 gap-3 py-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono text-sm text-base-content">{item.key}</span>
                      {#if item.sourceState === 'override'}
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {sourceTone[item.sourceState]}">
                          override
                        </span>
                      {/if}
                      {#if item.sensitive}
                        <span class="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider text-warning">masked</span>
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

  <div class="card border border-base-300 bg-base-100 shadow-none" data-testid="planned-env-config-preview">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex max-w-3xl flex-col gap-1">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">planned env config preview</span>
          <span class="text-sm text-base-content/60">
            Preview of non-secret and secret-like environment settings that are candidates for a DB-backed config schema. These rows are not editable yet and do not come from the backend.
          </span>
        </div>
        <label class="label cursor-pointer gap-3 rounded-full border border-base-300 px-3 py-2">
          <span class="text-xs font-medium text-base-content/70 capitalize">developer mode</span>
          <input type="checkbox" class="toggle toggle-sm" bind:checked={showDeveloperEnv} />
        </label>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="rounded-box border border-base-300 p-3">
          <span class="block text-xs text-base-content/50 capitalize">visible preview keys</span>
          <span class="font-mono text-xl font-semibold text-base-content">{previewItems.length}</span>
        </div>
        <div class="rounded-box border border-base-300 p-3">
          <span class="block text-xs text-base-content/50 capitalize">admin default</span>
          <span class="font-mono text-xl font-semibold text-base-content">{plannedEnvConfigs.filter((item) => item.visibility === 'admin').length}</span>
        </div>
        <div class="rounded-box border border-base-300 p-3">
          <span class="block text-xs text-base-content/50 capitalize">developer only</span>
          <span class="font-mono text-xl font-semibold text-base-content">{plannedEnvConfigs.filter((item) => item.visibility === 'developer').length}</span>
        </div>
        <div class="rounded-box border border-base-300 p-3">
          <span class="block text-xs text-base-content/50 capitalize">secret-like</span>
          <span class="font-mono text-xl font-semibold text-base-content">{plannedEnvConfigs.filter((item) => item.sensitivity === 'secret-like').length}</span>
        </div>
      </div>

      <div class="overflow-x-auto rounded-box border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>env key</th>
              <th>category</th>
              <th>default</th>
              <th>type</th>
              <th>visibility</th>
              <th>storage note</th>
              <th>effective</th>
            </tr>
          </thead>
          <tbody>
            {#each previewItems as item (item.key)}
              <tr>
                <td class="min-w-[260px] align-top">
                  <div class="flex flex-col gap-1">
                    <span class="font-mono text-xs font-semibold text-base-content">{item.key}</span>
                    <span class="text-xs text-base-content/60">{item.label}</span>
                    <span class="text-xs text-base-content/50">{item.description}</span>
                  </div>
                </td>
                <td class="align-top"><span class="badge badge-ghost badge-sm capitalize">{item.category}</span></td>
                <td class="align-top"><span class="font-mono text-xs text-base-content/70">{item.defaultValue || 'empty'}</span></td>
                <td class="align-top"><span class="font-mono text-xs text-base-content/70">{item.type}</span></td>
                <td class="align-top">
                  <span class="badge badge-sm capitalize" class:badge-primary={item.visibility === 'admin'} class:badge-neutral={item.visibility === 'developer'}>
                    {item.visibility}
                  </span>
                </td>
                <td class="align-top">
                  <span class="badge badge-sm capitalize" class:badge-warning={item.sensitivity === 'secret-like'} class:badge-ghost={item.sensitivity === 'plain'}>
                    {item.sensitivity === 'secret-like' ? 'mask or encrypt' : 'plain DB value'}
                  </span>
                </td>
                <td class="align-top"><span class="badge badge-outline badge-sm capitalize">{item.effectiveMode}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
