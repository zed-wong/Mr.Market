<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import AdminStatePanel from '$lib/components/admin/shared/AdminStatePanel.svelte';
  import { checkSession } from '$lib/helpers/api/auth';
  import { getAccessToken } from '$lib/helpers/api/client';
  import { fetchAdminSystemHealth } from '$lib/helpers/api/system';
  import { MRM_BACKEND_URL } from '$lib/helpers/constants';
  import { getAllAPIKeys } from '$lib/helpers/mrm/admin/exchanges';
  import {
    getDirectWalletStatus,
    listDirectOrders,
    listDirectStrategies,
  } from '$lib/helpers/mrm/admin/direct-market-making';
  import {
    buildSetupReadiness,
    setupStatusLabels,
    setupStatusTone,
    type SetupReadinessInput,
  } from '$lib/helpers/admin/setup-readiness';
  import type { GrowInfo } from '$lib/types/hufi/grow';

  let readinessInput = $state<SetupReadinessInput>({});
  let loading = $state(true);
  let lastLoadedAt = $state<string | null>(null);

  let readinessAreas = $derived(buildSetupReadiness(readinessInput));
  let readyCount = $derived(readinessAreas.filter((area) => area.status === 'ready').length);
  let attentionCount = $derived(
    readinessAreas.filter((area) => area.status === 'needs_attention').length,
  );
  let failedCount = $derived(readinessAreas.filter((area) => area.status === 'failed').length);

  const getToken = () => getAccessToken() || '';

  const messageFrom = (cause: unknown, fallback: string) =>
    cause instanceof Error ? cause.message : fallback;

  async function readJson<T>(response: Response, fallback: string): Promise<T> {
    if (!response.ok) {
      let message = fallback;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (body?.message) {
          message = Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
        }
      } catch {
        message = `${fallback} (${response.status})`;
      }
      if (response.status === 401) {
        throw new Error('Session expired. Sign in again before running setup readiness checks.');
      }
      if (response.status === 403) {
        throw new Error('Permission denied. This administrator session cannot load setup readiness data.');
      }
      throw new Error(message);
    }

    return (await response.json()) as T;
  }

  const pingBackend = async () => {
    const response = await fetch(`${MRM_BACKEND_URL}/health/ping`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Backend ping failed (${response.status})`);
    }
    return true;
  };

  const fetchGrowInfo = async (token: string) => {
    const response = await fetch(`${MRM_BACKEND_URL}/grow/info`, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
    });
    return readJson<GrowInfo>(response, 'Exchange configuration failed to load');
  };

  async function settle<T>(task: Promise<T>) {
    try {
      return { value: await task, error: null };
    } catch (cause) {
      return { value: null, error: messageFrom(cause, 'Request failed') };
    }
  }

  const loadReadiness = async () => {
    loading = true;
    readinessInput = {};

    const token = getToken();
    const missingToken = token ? null : 'Missing admin access token. Sign in again before setup checks.';

    const [
      backend,
      session,
      growInfo,
      apiKeys,
      health,
      wallet,
      directOrders,
      directStrategies,
    ] = await Promise.all([
      settle(pingBackend()),
      settle(checkSession()),
      token ? settle(fetchGrowInfo(token)) : Promise.resolve({ value: null, error: missingToken }),
      token ? settle(getAllAPIKeys(token)) : Promise.resolve({ value: null, error: missingToken }),
      settle(fetchAdminSystemHealth()),
      token ? settle(getDirectWalletStatus(token)) : Promise.resolve({ value: null, error: missingToken }),
      token ? settle(listDirectOrders(token)) : Promise.resolve({ value: null, error: missingToken }),
      token ? settle(listDirectStrategies(token)) : Promise.resolve({ value: null, error: missingToken }),
    ]);

    readinessInput = {
      backendReachable: backend.value === true,
      backendError: backend.error,
      session: session.value,
      sessionError: session.error,
      growInfo: growInfo.value,
      growInfoError: growInfo.error,
      apiKeys: apiKeys.value,
      apiKeysError: apiKeys.error,
      health: health.value,
      healthError: health.error,
      wallet: wallet.value,
      walletError: wallet.error,
      directOrders: directOrders.value,
      directOrdersError: directOrders.error,
      directStrategies: directStrategies.value,
      directStrategiesError: directStrategies.error,
    };
    lastLoadedAt = new Date().toLocaleString();
    loading = false;
  };

  onMount(() => {
    void loadReadiness();
  });
</script>

<section class="space-y-6" data-testid="setup-guide-page">
  <PageHeader
    eyebrow="setup"
    title="first-time admin setup guide"
    subtitle="Follow the live readiness path from backend reachability to direct market-making diagnostics without leaving the admin shell."
  >
    {#snippet actions()}
      <a class="btn btn-ghost btn-sm rounded-full capitalize" href="/system/config">system config</a>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading}
        onclick={() => void loadReadiness()}
      >
        {#if loading}<span class="loading loading-spinner loading-xs"></span>{/if}
        refresh readiness
      </button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold text-base-content capitalize">setup topology</span>
          <span class="text-sm text-base-content/60">
            Use this guide as the first-class setup area, then move through exchanges, API keys, system health/config, and direct market-making readiness using in-app routes.
          </span>
        </div>

        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <a class="btn btn-outline btn-sm rounded-full capitalize" href="/trading/exchanges">exchange management</a>
          <a class="btn btn-outline btn-sm rounded-full capitalize" href="/system/api-keys">API key management</a>
          <a class="btn btn-outline btn-sm rounded-full capitalize" href="/system/health">system health</a>
          <a class="btn btn-outline btn-sm rounded-full capitalize" href="/trading/direct-market-making">direct diagnostics</a>
        </div>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">live readiness summary</span>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-lg border border-base-300 p-3">
            <span class="block font-mono text-2xl font-semibold text-success">{readyCount}</span>
            <span class="text-xs text-base-content/60 capitalize">ready</span>
          </div>
          <div class="rounded-lg border border-base-300 p-3">
            <span class="block font-mono text-2xl font-semibold text-warning">{attentionCount}</span>
            <span class="text-xs text-base-content/60 capitalize">attention</span>
          </div>
          <div class="rounded-lg border border-base-300 p-3">
            <span class="block font-mono text-2xl font-semibold text-error">{failedCount}</span>
            <span class="text-xs text-base-content/60 capitalize">failed</span>
          </div>
        </div>
        <span class="text-xs text-base-content/50">
          {#if loading}
            Loading live setup readiness.
          {:else if lastLoadedAt}
            Last refreshed {lastLoadedAt}.
          {:else}
            Readiness has not been loaded yet.
          {/if}
        </span>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
    {#if loading}
      <div class="xl:col-span-2">
        <AdminStatePanel
          kind="loading"
          context="setup guide"
          title="loading setup readiness"
          message="Checking backend reachability, admin session, exchange configuration, API keys, system health, wallet status, and direct market-making readiness."
          testId="setup-readiness-loading"
        />
      </div>
    {/if}
    {#each readinessAreas as area (area.id)}
      <article class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-lg font-semibold text-base-content capitalize">{area.title}</span>
              <span class="text-sm text-base-content/60">{area.summary}</span>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-medium capitalize {setupStatusTone[area.status]}">
              {#if area.status === 'loading'}<span class="loading loading-spinner loading-xs"></span>{/if}
              {setupStatusLabels[area.status]}
            </span>
          </div>

          <ul class="space-y-2">
            {#each area.evidence as evidence (evidence)}
              <li class="flex gap-2 text-sm text-base-content/70">
                <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-base-content/30"></span>
                <span>{evidence}</span>
              </li>
            {/each}
          </ul>

          <div class="flex justify-end">
            <a class="btn btn-sm btn-outline rounded-full capitalize" href={area.href}>{area.actionLabel}</a>
          </div>
        </div>
      </article>
    {/each}
  </div>
</section>
