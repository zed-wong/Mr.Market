<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import AdminStatePanel from '$lib/components/admin/shared/AdminStatePanel.svelte';
  import {
    buildAdminApiKeySubmission,
    getAdminApiKeyCredentialCopy,
    toAdminApiKeyDisplayRecord,
  } from '$lib/helpers/admin/api-key-credentials';
  import {
    getApiKeyPermissionViews,
    getApiKeyReadiness,
    summarizeApiKeyReadiness,
    type ApiKeyReadinessStatus,
  } from '$lib/helpers/admin/api-key-readiness';
  import { classifyAdminError, type AdminErrorState } from '$lib/helpers/admin/common-states';
  import { getAccessToken } from '$lib/helpers/api/client';
  import {
    addAPIKey,
    getAllAPIKeys,
    getEncryptionPublicKey,
    removeAPIKey,
  } from '$lib/helpers/mrm/admin/exchanges';
  import { getAllCcxtExchanges } from '$lib/helpers/mrm/admin/growdata';
  import { encryptSecret } from '$lib/helpers/encryption/crypto';
  import type { AdminSingleKey } from '$lib/types/hufi/admin';

  type FormErrors = Partial<Record<'exchange' | 'name' | 'apiKey' | 'apiSecret' | 'metadata' | 'duplicate', string>>;

  let keys = $state<AdminSingleKey[]>([]);
  let ccxtExchanges = $state<string[]>([]);
  let publicKey = $state('');
  let loading = $state(true);
  let metadataLoading = $state(true);
  let refreshing = $state(false);
  let saving = $state(false);
  let removingKeyId = $state<string | null>(null);
  let loadError = $state<AdminErrorState | null>(null);
  let metadataError = $state<AdminErrorState | null>(null);
  let errorMessage = $state('');
  let formErrors = $state<FormErrors>({});
  let statusFilter = $state<'all' | ApiKeyReadinessStatus>('all');
  let exchangeFilter = $state<'all' | string>('all');
  let query = $state('');
  let addDialogEl = $state<HTMLDialogElement | null>(null);
  let exchangeDropdownOpen = $state(false);
  let deleteCandidate = $state<AdminSingleKey | null>(null);
  let pendingRefreshTimer: ReturnType<typeof setInterval> | null = null;

  let form = $state({
    exchange: '',
    name: '',
    apiKey: '',
    apiSecret: '',
    permissions: 'read' as 'read' | 'read-trade',
  });

  const token = () => getAccessToken() || '';

  const formatDate = (value?: string): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  };

  const formatDateTime = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  let exchanges = $derived([
    'all',
    ...Array.from(new Set(keys.map((key) => key.exchange).filter(Boolean))).sort(),
  ]);
  const statuses: Array<'all' | ApiKeyReadinessStatus> = [
    'all',
    'ready',
    'validation_pending',
    'validation_failed',
    'disabled',
    'unknown',
  ];
  let totals = $derived(summarizeApiKeyReadiness(keys));
  let encryptionReady = $derived(Boolean(publicKey) && !metadataLoading && !metadataError);
  let credentialCopy = $derived(getAdminApiKeyCredentialCopy(form.exchange));

  let filtered = $derived(
    keys.filter((key) => {
      const status = getApiKeyReadiness(key).status;
      const normalizedQuery = query.trim().toLowerCase();
      return (
        (statusFilter === 'all' || status === statusFilter) &&
        (exchangeFilter === 'all' || key.exchange === exchangeFilter) &&
        (!normalizedQuery ||
          key.name?.toLowerCase().includes(normalizedQuery) ||
          key.exchange?.toLowerCase().includes(normalizedQuery) ||
          key.key_id?.toLowerCase().includes(normalizedQuery) ||
          key.api_key?.toLowerCase().includes(normalizedQuery))
      );
    }),
  );

  let matchingCcxtExchanges = $derived(
    ccxtExchanges
      .filter((exchange) => exchange.toLowerCase().includes(form.exchange.toLowerCase()))
      .slice(0, 50),
  );

  let existingExchangeApiKeys = $derived(
    new Set(keys.map((key) => `${key.exchange.toLowerCase()}:${key.api_key}`)),
  );

  const resetForm = () => {
    form = {
      exchange: '',
      name: '',
      apiKey: '',
      apiSecret: '',
      permissions: 'read',
    };
    errorMessage = '';
    formErrors = {};
    exchangeDropdownOpen = false;
  };

  const loadApiKeys = async (showToast = false, options: { throwOnError?: boolean } = {}) => {
    const adminToken = token();
    if (!adminToken) {
      loadError = {
        kind: 'session',
        title: $_('admin_session_required'),
        message: $_('admin_api_keys_session_message'),
        actionLabel: $_('admin_sign_in_again'),
      };
      loading = false;
      if (options.throwOnError) {
        throw new Error(loadError.message);
      }
      return;
    }

    const retryingInitialLoad = Boolean(loadError) && keys.length === 0;
    refreshing = showToast;
    if (retryingInitialLoad) loading = true;
    loadError = null;
    try {
      keys = await getAllAPIKeys(adminToken);
    } catch (error) {
      console.error(error);
      loadError = classifyAdminError(error, $_('admin_api_keys_load_failed'));
      if (options.throwOnError) {
        throw new Error(loadError.message);
      }
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const refreshApiKeys = () =>
    toast.promise(loadApiKeys(true, { throwOnError: true }), {
      loading: $_('admin_api_keys_refreshing'),
      success: $_('admin_api_keys_refreshed'),
      error: $_('admin_api_keys_refresh_failed'),
    });

  const loadFormMetadata = async () => {
    const adminToken = token();
    metadataLoading = true;
    if (!adminToken) {
      metadataError = {
        kind: 'session',
        title: $_('admin_session_required'),
        message: $_('admin_api_keys_metadata_session_message'),
        actionLabel: $_('admin_sign_in_again'),
      };
      metadataLoading = false;
      return;
    }

    metadataError = null;
    try {
      const [exchangesResult, publicKeyResult] = await Promise.all([
        getAllCcxtExchanges(adminToken),
        getEncryptionPublicKey(adminToken),
      ]);
      ccxtExchanges = exchangesResult;
      if (!publicKeyResult.publicKey) {
        throw new Error($_('admin_encryption_public_key_missing'));
      }
      publicKey = publicKeyResult.publicKey;
    } catch (error) {
      console.error(error);
      publicKey = '';
      metadataError = classifyAdminError(error, $_('admin_api_keys_metadata_load_failed'));
      toast.error(metadataError.title, { description: metadataError.message });
    } finally {
      metadataLoading = false;
    }
  };

  const openAddDialog = () => {
    resetForm();
    addDialogEl?.showModal();
  };

  const closeAddDialog = () => {
    addDialogEl?.close();
  };

  const hasPendingKeys = () => keys.some((key) => getApiKeyReadiness(key).status === 'validation_pending');

  const validateForm = () => {
    const exchange = form.exchange.trim();
    const name = form.name.trim();
    const apiKey = form.apiKey.trim();
    const apiSecret = form.apiSecret.trim();
    const nextErrors: FormErrors = {};

    if (!exchange) nextErrors.exchange = $_('admin_form_choose_exchange');
    if (!name) nextErrors.name = $_('admin_form_enter_display_name');
    if (!apiKey) nextErrors.apiKey = $_(credentialCopy.apiKeyRequired);
    if (!apiSecret) nextErrors.apiSecret = $_(credentialCopy.apiSecretRequired);
    if (apiKey && apiKey.length < 4) nextErrors.apiKey = $_(credentialCopy.apiKeyMinLength);
    if (apiSecret && apiSecret.length < 4) nextErrors.apiSecret = $_(credentialCopy.apiSecretMinLength);
    if (apiKey && existingExchangeApiKeys.has(`${exchange.toLowerCase()}:${apiKey}`)) {
      nextErrors.duplicate = $_('admin_form_api_key_duplicate');
    }
    if (!encryptionReady) {
      nextErrors.metadata = metadataError
        ? $_('admin_form_encryption_metadata_failed')
        : $_('admin_form_encryption_metadata_loading');
    }

    formErrors = nextErrors;
    errorMessage = Object.values(nextErrors)[0] || '';
    return Object.keys(nextErrors).length === 0;
  };

  const submitApiKey = async () => {
    const adminToken = token();
    if (!adminToken || saving) return;

    const exchange = form.exchange.trim();
    const name = form.name.trim();
    const apiKey = form.apiKey.trim();
    const apiSecret = form.apiSecret.trim();

    if (!validateForm()) {
      return;
    }

    saving = true;
    errorMessage = '';
    formErrors = {};
    try {
      const encryptedSecret = await encryptSecret(apiSecret, publicKey);
      await addAPIKey(
        buildAdminApiKeySubmission({
          exchange,
          name,
          apiKey,
          encryptedSecret,
          permissions: form.permissions,
        }),
        adminToken,
      );
      toast.success($_('admin_api_keys_added'));
      closeAddDialog();
      resetForm();
      await loadApiKeys(false);
    } catch (error) {
      console.error(error);
      errorMessage = error instanceof Error ? error.message : $_('admin_api_keys_add_failed');
    } finally {
      saving = false;
    }
  };

  const confirmDelete = async () => {
    const adminToken = token();
    if (!adminToken || !deleteCandidate || removingKeyId) return;

    removingKeyId = deleteCandidate.key_id;
    try {
      await removeAPIKey(deleteCandidate.key_id, adminToken);
      toast.success($_('admin_api_keys_deleted'));
      deleteCandidate = null;
      await loadApiKeys(false);
    } catch (error) {
      console.error(error);
      toast.error($_('admin_api_keys_delete_failed'));
    } finally {
      removingKeyId = null;
    }
  };

  onMount(async () => {
    await Promise.all([loadApiKeys(false), loadFormMetadata()]);

    pendingRefreshTimer = setInterval(() => {
      if (hasPendingKeys() && !refreshing) {
        void loadApiKeys(false);
      }
    }, 5000);
  });

  onDestroy(() => {
    if (pendingRefreshTimer) {
      clearInterval(pendingRefreshTimer);
    }
  });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow={$_('admin.nav.system')}
    title={$_('admin.nav.api_keys')}
    subtitle={$_('admin_api_keys_subtitle')}
  >
    {#snippet actions()}
      <button class="btn btn-primary btn-sm rounded-full capitalize" onclick={openAddDialog} disabled={!encryptionReady}>+ {$_('admin_api_keys_add_key')}</button>
      <button class="btn btn-primary btn-sm rounded-full capitalize" onclick={() => refreshApiKeys()} disabled={refreshing}>
        {refreshing ? $_('refreshing_msg') : $_('refresh')}
      </button>
    {/snippet}
  </PageHeader>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="join">
          {#each statuses as s (s)}
            <button
              type="button"
              class="btn btn-sm join-item capitalize {statusFilter === s ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              onclick={() => (statusFilter = s)}
            >{s === 'all' ? $_('admin_strategy_all') : s.replace('_', ' ')}</button>
          {/each}
        </div>

        <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={exchangeFilter}>
          {#each exchanges as ex (ex)}
            <option value={ex}>{ex === 'all' ? $_('all_exchanges') : ex}</option>
          {/each}
        </select>

        <input
          type="text"
          placeholder={$_('admin_api_keys_search_placeholder')}
          class="input input-sm input-bordered border-base-300 bg-base-100 min-w-[220px] flex-1 font-mono text-xs"
          bind:value={query}
        />

        <span class="font-mono text-xs text-base-content/50">{filtered.length} / {keys.length}</span>
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('admin_api_keys_total_keys')}</span>
          <span class="font-mono text-xl font-semibold">{totals.total}</span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('admin_health_ready')}</span>
          <span class="font-mono text-xl font-semibold text-success">{totals.ready}</span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('admin_api_keys_validation_pending')}</span>
          <span class="font-mono text-xl font-semibold text-warning">{totals.validation_pending}</span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('admin_api_keys_validation_failed')}</span>
          <span class="font-mono text-xl font-semibold text-error">{totals.validation_failed}</span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('disabled')}</span>
          <span class="font-mono text-xl font-semibold">{totals.disabled}</span>
        </div>
        <div class="rounded-lg border border-base-300 p-3">
          <span class="block text-xs text-base-content/60 capitalize">{$_('admin_direct_mm_state_unknown')}</span>
          <span class="font-mono text-xl font-semibold">{totals.unknown}</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        {#if metadataLoading}
          <div class="mb-4">
            <AdminStatePanel
              kind="loading"
              context={$_('admin_api_keys_form_metadata')}
              title={$_('admin_api_keys_loading_encryption_metadata')}
              message={$_('admin_api_keys_loading_encryption_message')}
              testId="api-key-metadata-loading"
            />
          </div>
        {:else if metadataError}
          <div class="mb-4">
            <AdminStatePanel
              kind={metadataError.kind}
              context={$_('admin_api_keys_form_metadata')}
              title={metadataError.title}
              message={metadataError.message}
              actionLabel={$_('admin_connectivity_retry_metadata')}
              onAction={() => void loadFormMetadata()}
              testId="api-key-metadata-error"
            />
          </div>
        {/if}
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs capitalize text-base-content/50">
              <th class="font-medium">{$_('admin_api_keys_label')}</th>
              <th class="font-medium">{$_('exchange')}</th>
              <th class="font-medium">{$_('admin_connectivity_fingerprint')}</th>
              <th class="font-medium">{$_('permissions')}</th>
              <th class="font-medium">{$_('status')}</th>
              <th class="font-medium">{$_('admin_connectivity_last_validation')}</th>
              <th class="font-medium">{$_('created')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr>
                <td colspan="8" class="py-4">
                  <AdminStatePanel
                    kind="loading"
                    context={$_('admin_api_keys_management')}
                    title={$_('admin_api_keys_loading_title')}
                    message={$_('admin_api_keys_loading_message')}
                    testId="api-key-loading"
                  />
                </td>
              </tr>
            {:else if loadError}
              <tr>
                <td colspan="8" class="py-4">
                  <AdminStatePanel
                    kind={loadError.kind}
                    context={$_('admin_api_keys_management')}
                    title={loadError.title}
                    message={loadError.message}
                    actionLabel={loadError.kind === 'session' ? $_('admin_sign_in_again') : $_('admin_retry')}
                    actionHref={loadError.kind === 'session' ? '/login' : ''}
                    onAction={loadError.kind === 'session' ? undefined : () => void loadApiKeys(true)}
                    testId="api-key-error"
                  />
                </td>
              </tr>
            {:else if filtered.length === 0}
              <tr>
                <td colspan="8" class="py-4">
                  <AdminStatePanel
                    kind="empty"
                    context={$_('admin_api_keys_management')}
                    title={keys.length === 0 ? $_('admin_api_keys_empty_title') : $_('admin_api_keys_empty_filtered_title')}
                    message={keys.length === 0 ? $_('admin_api_keys_empty_message') : $_('admin_api_keys_empty_filtered_message')}
                    actionLabel={keys.length === 0 ? $_('admin_api_keys_add_key') : $_('admin_api_keys_clear_filters')}
                    onAction={keys.length === 0 ? openAddDialog : () => {
                      statusFilter = 'all';
                      exchangeFilter = 'all';
                      query = '';
                    }}
                    testId="api-key-empty"
                  />
                </td>
              </tr>
            {:else}
              {#each filtered as key (key.key_id)}
                {@const readiness = getApiKeyReadiness(key)}
                {@const displayKey = toAdminApiKeyDisplayRecord(key)}
                <tr class="border-b border-base-300 hover:bg-base-200">
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-base-content capitalize">{displayKey.name}</span>
                      <span class="font-mono text-xs text-base-content/50">{displayKey.keyId}</span>
                    </div>
                  </td>
                  <td class="text-sm text-base-content capitalize">{displayKey.exchange}</td>
                  <td class="font-mono text-xs text-base-content/70">{displayKey.publicCredentialFingerprint}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {#each getApiKeyPermissionViews(key) as permission (permission.capability)}
                        <span
                          class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {permission.tone}"
                          title={permission.description}
                        >
                          {permission.label}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-col gap-1">
                      <span class="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {readiness.tone}" title={readiness.description}>
                        {readiness.label}
                      </span>
                      <span class="max-w-[240px] truncate text-xs text-base-content/60" title={readiness.description}>{readiness.title}</span>
                      {#if readiness.status === 'validation_failed' && key.validation_error}
                        <span class="max-w-[220px] truncate text-xs text-error" title={key.validation_error}>{key.validation_error}</span>
                      {/if}
                    </div>
                  </td>
                  <td class="font-mono text-xs text-base-content/70">{formatDateTime(key.validated_at || key.last_update)}</td>
                  <td class="font-mono text-xs text-base-content/70">{formatDate(key.created_at)}</td>
                  <td class="text-right">
                    <button
                      class="btn btn-ghost btn-xs rounded-full text-error"
                      onclick={() => (deleteCandidate = key)}
                      aria-label={$_('remove_api_key')}
                    >{$_('delete')}</button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<dialog bind:this={addDialogEl} class="modal modal-bottom sm:modal-middle" onclose={resetForm}>
  <div class="modal-box max-w-xl border border-base-300 bg-base-100">
    <div class="flex items-start justify-between gap-4 border-b border-base-300 pb-4">
      <div class="flex flex-col gap-1">
        <span class="text-lg font-semibold capitalize">{$_('add_api_key')}</span>
        <span class="text-sm text-base-content/60">{$_('admin_api_keys_secret_hint')}</span>
      </div>
      <button class="btn btn-ghost btn-sm btn-circle" onclick={closeAddDialog} aria-label={$_('close')}>x</button>
    </div>

    <div class="mt-5 grid gap-4">
      {#if !encryptionReady}
        <div class="alert alert-warning py-2 text-sm" data-testid="api-key-encryption-not-ready">
          {#if metadataLoading}
            {$_('admin_connectivity_encryption_loading')}
          {:else if metadataError}
            {$_('admin_connectivity_encryption_failed')}
          {:else}
            {$_('admin_connectivity_encryption_not_ready')}
          {/if}
        </div>
      {/if}

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_('exchange')}</span>
        <div class="dropdown w-full" class:dropdown-open={exchangeDropdownOpen}>
          <input
            class="input input-bordered w-full border-base-300 bg-base-100"
            placeholder="e.g. binance"
            bind:value={form.exchange}
            onfocus={() => (exchangeDropdownOpen = true)}
            oninput={() => (exchangeDropdownOpen = true)}
          />
          {#if exchangeDropdownOpen && matchingCcxtExchanges.length > 0}
            <ul class="dropdown-content menu z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow">
              {#each matchingCcxtExchanges as exchange (exchange)}
                <li>
                  <button
                    type="button"
                    onclick={() => {
                      form.exchange = exchange;
                      exchangeDropdownOpen = false;
                    }}
                  >{exchange}</button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if formErrors.exchange}<span class="text-xs text-error">{formErrors.exchange}</span>{/if}
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_('display_name')}</span>
        <input class="input input-bordered border-base-300 bg-base-100" placeholder="e.g. account@email.com" bind:value={form.name} />
        {#if formErrors.name}<span class="text-xs text-error">{formErrors.name}</span>{/if}
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_(credentialCopy.apiKeyLabel)}</span>
        <input class="input input-bordered border-base-300 bg-base-100 font-mono text-sm" placeholder={$_(credentialCopy.apiKeyPlaceholder)} bind:value={form.apiKey} />
        <span class="text-xs text-base-content/50">{$_(credentialCopy.apiKeyHelp)}</span>
        {#if formErrors.apiKey}<span class="text-xs text-error">{formErrors.apiKey}</span>{/if}
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_(credentialCopy.apiSecretLabel)}</span>
        <input class="input input-bordered border-base-300 bg-base-100 font-mono text-sm" type="password" placeholder={$_(credentialCopy.apiSecretPlaceholder)} bind:value={form.apiSecret} />
        <span class="text-xs text-base-content/50">{$_(credentialCopy.apiSecretHelp)}</span>
        {#if formErrors.apiSecret}<span class="text-xs text-error">{formErrors.apiSecret}</span>{/if}
      </label>

      <div class="flex flex-wrap gap-4">
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read" bind:group={form.permissions} />
          {$_('read_only')}
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read-trade" bind:group={form.permissions} />
          {$_('read_trade')}
        </label>
      </div>

      {#if errorMessage}
        <div class="alert alert-error py-2 text-sm">{errorMessage}</div>
      {/if}
      {#if formErrors.duplicate && formErrors.duplicate !== errorMessage}
        <div class="alert alert-error py-2 text-sm">{formErrors.duplicate}</div>
      {/if}
      {#if formErrors.metadata && formErrors.metadata !== errorMessage}
        <div class="alert alert-warning py-2 text-sm">{formErrors.metadata}</div>
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost capitalize" onclick={closeAddDialog}>{$_('cancel')}</button>
      <button class="btn btn-primary capitalize" onclick={submitApiKey} disabled={saving || !encryptionReady}>
        {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
        {$_('admin_api_keys_add_key')}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label={$_('close')}>{$_('close')}</button>
  </form>
</dialog>

{#if deleteCandidate}
  <dialog class="modal modal-open">
    <div class="modal-box border border-base-300 bg-base-100">
      <span class="text-lg font-semibold capitalize">{$_('admin_api_keys_delete_title')}</span>
      <span class="mt-2 block text-sm text-base-content/60">
        {$_('admin_api_keys_delete_message', {
          values: {
            name: deleteCandidate.name,
            exchange: deleteCandidate.exchange,
          },
        })}
      </span>
      <div class="modal-action">
        <button class="btn btn-ghost capitalize" onclick={() => (deleteCandidate = null)}>{$_('cancel')}</button>
        <button class="btn btn-error capitalize" onclick={confirmDelete} disabled={removingKeyId === deleteCandidate.key_id}>
          {#if removingKeyId === deleteCandidate.key_id}<span class="loading loading-spinner loading-xs"></span>{/if}
          {$_('delete')}
        </button>
      </div>
    </div>
  </dialog>
{/if}
