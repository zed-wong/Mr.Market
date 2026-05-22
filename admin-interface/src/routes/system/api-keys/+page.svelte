<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    addAPIKey,
    getAllAPIKeys,
    getEncryptionPublicKey,
    removeAPIKey,
  } from '$lib/helpers/mrm/admin/exchanges';
  import { getAllCcxtExchanges } from '$lib/helpers/mrm/admin/growdata';
  import { encryptSecret } from '$lib/helpers/encryption/crypto';
  import type { AdminSingleKey } from '$lib/types/hufi/admin';

  type Permission = 'read' | 'trade';
  type Status = 'active' | 'pending' | 'error' | 'unknown';

  const statusTone: Record<Status, string> = {
    active: 'bg-success/10 text-success',
    pending: 'bg-info/10 text-info',
    error: 'bg-error/10 text-error',
    unknown: 'bg-base-content/5 text-base-content/60',
  };

  const scopeTone: Record<Permission, string> = {
    read: 'bg-base-content/5 text-base-content/60',
    trade: 'bg-info/10 text-info',
  };

  let keys = $state<AdminSingleKey[]>([]);
  let ccxtExchanges = $state<string[]>([]);
  let publicKey = $state('');
  let loading = $state(true);
  let refreshing = $state(false);
  let saving = $state(false);
  let removingKeyId = $state<string | null>(null);
  let errorMessage = $state('');
  let statusFilter = $state<'all' | Status>('all');
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

  const token = () => localStorage.getItem('admin-access-token') || '';

  const keyStatus = (key: AdminSingleKey): Status => {
    if (key.validation_error === 'Validation timeout') return 'pending';
    if (key.validation_status === 'pending') return 'pending';
    if (key.validation_status === 'invalid' || key.validation_status === 'failed' || key.state === 'error') return 'error';
    if (key.state === 'alive' || key.validation_status === 'valid' || key.validation_status === 'validated') return 'active';
    return 'unknown';
  };

  const keyScopes = (key: AdminSingleKey): Permission[] =>
    key.permissions === 'read-trade' ? ['read', 'trade'] : ['read'];

  const fingerprint = (value?: string): string => {
    const raw = String(value || '').replace(/\s/g, '');
    if (!raw) return '—';
    const tail = raw.slice(-8).padStart(8, '•');
    return tail.match(/.{1,2}/g)?.join('·') || tail;
  };

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
  const statuses: Array<'all' | Status> = ['all', 'active', 'pending', 'error', 'unknown'];

  let filtered = $derived(
    keys.filter((key) => {
      const status = keyStatus(key);
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
    exchangeDropdownOpen = false;
  };

  const loadApiKeys = async (showToast = false) => {
    const adminToken = token();
    if (!adminToken) return;

    refreshing = showToast;
    try {
      keys = await getAllAPIKeys(adminToken);
      if (showToast) toast.success('API keys refreshed');
    } catch (error) {
      console.error(error);
      toast.error('Failed to load API keys');
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const loadFormMetadata = async () => {
    const adminToken = token();
    if (!adminToken) return;

    try {
      const [exchangesResult, publicKeyResult] = await Promise.all([
        getAllCcxtExchanges(adminToken),
        getEncryptionPublicKey(adminToken),
      ]);
      ccxtExchanges = exchangesResult;
      publicKey = publicKeyResult.publicKey;
    } catch (error) {
      console.error(error);
      toast.error('Failed to load API key metadata');
    }
  };

  const openAddDialog = () => {
    resetForm();
    addDialogEl?.showModal();
  };

  const closeAddDialog = () => {
    addDialogEl?.close();
  };

  const hasPendingKeys = () => keys.some((key) => keyStatus(key) === 'pending');

  const submitApiKey = async () => {
    const adminToken = token();
    if (!adminToken || saving) return;

    const exchange = form.exchange.trim();
    const name = form.name.trim();
    const apiKey = form.apiKey.trim();
    const apiSecret = form.apiSecret.trim();

    if (!exchange || !name || !apiKey || !apiSecret) {
      errorMessage = 'Fill exchange, display name, API key, and API secret.';
      return;
    }
    if (existingExchangeApiKeys.has(`${exchange.toLowerCase()}:${apiKey}`)) {
      errorMessage = 'API key already exists for this exchange.';
      return;
    }
    if (!publicKey) {
      errorMessage = 'Encryption public key is not ready.';
      return;
    }

    saving = true;
    errorMessage = '';
    try {
      const encryptedSecret = await encryptSecret(apiSecret, publicKey);
      await addAPIKey(
        {
          exchange,
          name,
          api_key: apiKey,
          api_secret: encryptedSecret,
          permissions: form.permissions,
        },
        adminToken,
      );
      toast.success('API key added');
      closeAddDialog();
      resetForm();
      await loadApiKeys(false);
    } catch (error) {
      console.error(error);
      errorMessage = error instanceof Error ? error.message : 'Failed to add API key';
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
      toast.success('API key deleted');
      deleteCandidate = null;
      await loadApiKeys(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete API key');
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
    eyebrow="system"
    title="api keys"
    subtitle="Exchange API credentials. Secrets are encrypted before they leave the browser."
  >
    {#snippet actions()}
      <button class="btn btn-ghost btn-sm rounded-full capitalize" onclick={() => loadApiKeys(true)} disabled={refreshing}>
        {#if refreshing}<span class="loading loading-spinner loading-xs"></span>{/if}
        refresh
      </button>
      <button class="btn btn-primary btn-sm rounded-full capitalize" onclick={openAddDialog}>+ add key</button>
    {/snippet}
  </PageHeader>

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
          placeholder="name, exchange, key id, fingerprint"
          class="input input-sm input-bordered border-base-300 bg-base-100 min-w-[220px] flex-1 font-mono text-xs"
          bind:value={query}
        />

        <span class="font-mono text-xs text-base-content/50">{filtered.length} / {keys.length}</span>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="border-b border-base-300 text-xs capitalize text-base-content/50">
              <th class="font-medium">label</th>
              <th class="font-medium">exchange</th>
              <th class="font-medium">fingerprint</th>
              <th class="font-medium">permissions</th>
              <th class="font-medium">status</th>
              <th class="font-medium">last validation</th>
              <th class="font-medium">created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr>
                <td colspan="8" class="py-10 text-center">
                  <span class="loading loading-spinner loading-sm"></span>
                </td>
              </tr>
            {:else if filtered.length === 0}
              <tr>
                <td colspan="8" class="py-10 text-center text-sm text-base-content/60 capitalize">no API keys found</td>
              </tr>
            {:else}
              {#each filtered as key (key.key_id)}
                {@const status = keyStatus(key)}
                <tr class="border-b border-base-300 hover:bg-base-200">
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-base-content capitalize">{key.name}</span>
                      <span class="font-mono text-xs text-base-content/50">{key.key_id}</span>
                    </div>
                  </td>
                  <td class="text-sm text-base-content capitalize">{key.exchange}</td>
                  <td class="font-mono text-xs text-base-content/70">{fingerprint(key.api_key)}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {#each keyScopes(key) as scope (scope)}
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {scopeTone[scope]}">
                          {scope}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-col gap-1">
                      <span class="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {statusTone[status]}">
                        {status}
                      </span>
                      {#if status === 'error' && key.validation_error}
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
                      aria-label="delete API key"
                    >delete</button>
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
        <span class="text-lg font-semibold capitalize">add API key</span>
        <span class="text-sm text-base-content/60">Secret values are encrypted in the browser before submission.</span>
      </div>
      <button class="btn btn-ghost btn-sm btn-circle" onclick={closeAddDialog} aria-label="close">x</button>
    </div>

    <div class="mt-5 grid gap-4">
      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">exchange</span>
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
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">display name</span>
        <input class="input input-bordered border-base-300 bg-base-100" placeholder="e.g. account@email.com" bind:value={form.name} />
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">API key</span>
        <input class="input input-bordered border-base-300 bg-base-100 font-mono text-sm" placeholder="paste API key" bind:value={form.apiKey} />
      </label>

      <label class="flex flex-col gap-1">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">API secret</span>
        <input class="input input-bordered border-base-300 bg-base-100 font-mono text-sm" type="password" placeholder="paste API secret" bind:value={form.apiSecret} />
      </label>

      <div class="flex flex-wrap gap-4">
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read" bind:group={form.permissions} />
          read only
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read-trade" bind:group={form.permissions} />
          read + trade
        </label>
      </div>

      {#if errorMessage}
        <div class="alert alert-error py-2 text-sm">{errorMessage}</div>
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost capitalize" onclick={closeAddDialog}>cancel</button>
      <button class="btn btn-primary capitalize" onclick={submitApiKey} disabled={saving}>
        {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
        add key
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="close">close</button>
  </form>
</dialog>

{#if deleteCandidate}
  <dialog class="modal modal-open">
    <div class="modal-box border border-base-300 bg-base-100">
      <span class="text-lg font-semibold capitalize">delete API key</span>
      <span class="mt-2 block text-sm text-base-content/60">
        Delete {deleteCandidate.name} on {deleteCandidate.exchange}? This cannot be undone.
      </span>
      <div class="modal-action">
        <button class="btn btn-ghost capitalize" onclick={() => (deleteCandidate = null)}>cancel</button>
        <button class="btn btn-error capitalize" onclick={confirmDelete} disabled={removingKeyId === deleteCandidate.key_id}>
          {#if removingKeyId === deleteCandidate.key_id}<span class="loading loading-spinner loading-xs"></span>{/if}
          delete
        </button>
      </div>
    </div>
  </dialog>
{/if}
