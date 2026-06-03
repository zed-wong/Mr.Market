<script lang="ts">
  import BigNumber from 'bignumber.js';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import { getAccessToken } from '$lib/helpers/api/client';
  import {
    getAllAPIKeys,
    getAPIKeyAccountSnapshot,
  } from '$lib/helpers/mrm/admin/exchanges';
  import type { AdminAPIKeyAccountSnapshot, AdminSingleKey } from '$lib/types/hufi/admin';

  type AccountSnapshotRow = {
    key: AdminSingleKey;
    snapshot: AdminAPIKeyAccountSnapshot | null;
    error: string;
  };

  type AssetBalanceRow = {
    asset: string;
    free: BigNumber;
    used: BigNumber;
    total: BigNumber;
    accounts: number;
  };

  type AccountBalanceGroup = {
    accountId: string;
    exchange: string;
    name: string;
    keys: AdminSingleKey[];
    rows: AccountSnapshotRow[];
  };

  type AccountAssetRow = {
    accountKey: string;
    account: AccountBalanceGroup;
    asset: string;
    free: BigNumber;
    used: BigNumber;
    total: BigNumber;
  };

  let rows = $state<AccountSnapshotRow[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let exchangeFilter = $state('all');
  let assetFilter = $state('all');
  let query = $state('');
  let loadVersion = 0;

  const toAmount = (value: number | string | undefined | null) => {
    const parsed = new BigNumber(String(value ?? 0));
    return parsed.isFinite() ? parsed : new BigNumber(0);
  };

  const isPositive = (value: BigNumber) => value.gt(0);

  const formatAmount = (value: BigNumber | number | string | undefined | null) => {
    const parsed = BigNumber.isBigNumber(value) ? value : toAmount(value);
    if (!parsed.isFinite()) return String(value ?? 0);

    return parsed.decimalPlaces(parsed.gte(1) ? 8 : 12).toFormat();
  };

  const formatDate = (value?: string | null) => {
    if (!value) return $_('admin_unavailable');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;

    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const fingerprint = (value?: string) => {
    const raw = String(value || '').replace(/\s/g, '');
    if (!raw) return $_('admin_unavailable');
    return raw.slice(-8).padStart(8, '*');
  };

  const normalizeAccountName = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/(?:[\s_-]*(?:read\+trade|read-trade|readonly|read-only|trade|read))+$/i, '')
      .trim();

  const accountIdentity = (key: AdminSingleKey) =>
    `${key.exchange.trim().toLowerCase()}:${normalizeAccountName(key.name) || key.name.trim().toLowerCase()}`;

  const displayAccountName = (group: Pick<AccountBalanceGroup, 'keys' | 'name'>) => {
    const normalized = normalizeAccountName(group.name);
    const matched = group.keys.find((key) => normalizeAccountName(key.name) === normalized);
    return matched?.name.replace(/(?:[\s_-]*(?:read\+trade|read-trade|readonly|read-only|trade|read))+$/i, '') || group.name;
  };

  const permissionLabel = (value?: string) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('trade')) return $_('read_trade');
    return $_('read_only');
  };

  const balanceAssets = (snapshot: AdminAPIKeyAccountSnapshot | null) => {
    if (!snapshot?.balance) return [];

    return Array.from(
      new Set([
        ...Object.keys(snapshot.balance.free || {}),
        ...Object.keys(snapshot.balance.used || {}),
        ...Object.keys(snapshot.balance.total || {}),
      ]),
    ).sort((left, right) => left.localeCompare(right));
  };

  const keyBalanceRows = (row: AccountSnapshotRow) =>
    balanceAssets(row.snapshot)
      .map((asset) => {
        const free = toAmount(row.snapshot?.balance.free?.[asset]);
        const used = toAmount(row.snapshot?.balance.used?.[asset]);
        const total = toAmount(row.snapshot?.balance.total?.[asset]);

        return {
          asset,
          free,
          used,
          total,
        };
      })
      .filter((entry) => isPositive(entry.free) || isPositive(entry.used) || isPositive(entry.total));

  const loadBalances = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = rows.length === 0;
    const token = getAccessToken();
    const version = ++loadVersion;

    if (!token) {
      error = $_('admin_balances_session_message');
      loading = false;
      if (options.throwOnError) throw new Error(error);
      return;
    }

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      const keys = await getAllAPIKeys(token);
      if (version !== loadVersion) return;

      rows = keys.map((key) => ({
        key,
        snapshot: null,
        error: '',
      }));
      loading = false;

      await Promise.all(
        keys.map(async (key) => {
          try {
            const snapshot = await getAPIKeyAccountSnapshot(key.key_id, token);
            if (version !== loadVersion) return;

            rows = rows.map((row) =>
              row.key.key_id === key.key_id
                ? {
                    ...row,
                    snapshot,
                    error: '',
                  }
                : row,
            );
          } catch (cause) {
            if (version !== loadVersion) return;

            rows = rows.map((row) =>
              row.key.key_id === key.key_id
                ? {
                    ...row,
                    snapshot: null,
                    error: cause instanceof Error ? cause.message : String(cause),
                  }
                : row,
            );
          }
        }),
      );
    } catch (cause) {
      if (version !== loadVersion) return;

      error = cause instanceof Error ? cause.message : $_('admin_balances_load_failed');
      if (options.throwOnError) throw new Error(error);
    } finally {
      if (version !== loadVersion) return;

      loading = false;
      refreshing = false;
    }
  };

  const refreshBalances = () =>
    toast.promise(loadBalances({ throwOnError: true }), {
      loading: $_('admin_balances_refreshing'),
      success: $_('admin_balances_refreshed'),
      error: $_('admin_balances_refresh_failed'),
    });

  onMount(() => {
    void loadBalances();
  });

  const exchangeOptions = $derived.by(() => {
    const exchanges = new Set(rows.map((row) => row.key.exchange).filter(Boolean));
    return ['all', ...Array.from(exchanges).sort()];
  });

  const accountGroups = $derived.by(() => {
    const byAccount = new Map<string, AccountBalanceGroup>();

    for (const row of rows) {
      const accountId = accountIdentity(row.key);
      const group = byAccount.get(accountId) ?? {
        accountId,
        exchange: row.key.exchange,
        name: row.key.name,
        keys: [],
        rows: [],
      };

      group.keys.push(row.key);
      group.rows.push(row);
      byAccount.set(accountId, group);
    }

    return Array.from(byAccount.values()).sort((left, right) => {
      if (left.exchange !== right.exchange) return left.exchange.localeCompare(right.exchange);
      return displayAccountName(left).localeCompare(displayAccountName(right));
    });
  });

  const accountBalanceRows = $derived.by(() => {
    const accountRows: AccountAssetRow[] = [];

    for (const account of accountGroups) {
      const byAsset = new Map<string, Omit<AccountAssetRow, 'accountKey'>>();

      for (const row of account.rows) {
        for (const entry of keyBalanceRows(row)) {
          const existing = byAsset.get(entry.asset);

          if (!existing || entry.total.gt(existing.total)) {
            byAsset.set(entry.asset, {
              account,
              asset: entry.asset,
              free: entry.free,
              used: entry.used,
              total: entry.total,
            });
          }
        }
      }

      for (const entry of byAsset.values()) {
        accountRows.push({
          ...entry,
          accountKey: `${account.accountId}:${entry.asset}`,
        });
      }
    }

    return accountRows.sort((left, right) => {
      if (left.account.exchange !== right.account.exchange) {
        return left.account.exchange.localeCompare(right.account.exchange);
      }
      if (displayAccountName(left.account) !== displayAccountName(right.account)) {
        return displayAccountName(left.account).localeCompare(displayAccountName(right.account));
      }
      return left.asset.localeCompare(right.asset);
    });
  });

  const assetRows = $derived.by(() => {
    const byAsset = new Map<string, AssetBalanceRow>();

    for (const entry of accountBalanceRows) {
      const next = byAsset.get(entry.asset) ?? {
        asset: entry.asset,
        free: new BigNumber(0),
        used: new BigNumber(0),
        total: new BigNumber(0),
        accounts: 0,
      };

      next.free = next.free.plus(entry.free);
      next.used = next.used.plus(entry.used);
      next.total = next.total.plus(entry.total);
      next.accounts += 1;
      byAsset.set(entry.asset, next);
    }

    return Array.from(byAsset.values()).sort((left, right) => {
      if (!left.total.eq(right.total)) return right.total.comparedTo(left.total) ?? 0;
      return left.asset.localeCompare(right.asset);
    });
  });

  const assetOptions = $derived(['all', ...assetRows.map((row) => row.asset)]);
  const failedAccounts = $derived(rows.filter((row) => row.error));
  const pendingAccounts = $derived(rows.filter((row) => !row.snapshot && !row.error));
  const generatedAt = $derived(
    rows
      .map((row) => row.snapshot?.generated_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
  );

  const filteredAccountRows = $derived.by(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return accountBalanceRows.filter((row) => {
      const accountText = [
        displayAccountName(row.account),
        row.account.exchange,
        row.account.keys.map((key) => key.key_id).join(' '),
        row.account.keys.map((key) => key.api_key).join(' '),
        row.asset,
      ]
        .join(' ')
        .toLowerCase();

      return (
        (exchangeFilter === 'all' || row.account.exchange === exchangeFilter) &&
        (assetFilter === 'all' || row.asset === assetFilter) &&
        (!normalizedQuery || accountText.includes(normalizedQuery))
      );
    });
  });

  const filteredAssetRows = $derived(
    assetRows.filter((row) => assetFilter === 'all' || row.asset === assetFilter),
  );
</script>

<section class="space-y-6" data-testid="exchange-balances-page">
  <PageHeader
    eyebrow={$_('admin.nav.trading')}
    title={$_('admin.nav.balances')}
    subtitle={$_('admin_balances_subtitle')}
  >
    {#snippet actions()}
      <a class="btn btn-ghost btn-sm rounded-full capitalize" href="/system/connectivity/exchanges">
        {$_('admin_balances_manage_accounts')}
      </a>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={refreshBalances}
      >
        {refreshing ? $_('refreshing_msg') : $_('refresh')}
      </button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="card-surface p-4">
      <span class="eyebrow">{$_('admin_balances_accounts')}</span>
      <div class="mt-2 font-mono-num text-2xl font-semibold text-base-content">{rows.length}</div>
      <span class="text-xs text-base-content/50">{$_('admin_balances_api_keys_checked')}</span>
    </div>
    <div class="card-surface p-4">
      <span class="eyebrow">{$_('admin_balances_unique_accounts')}</span>
      <div class="mt-2 font-mono-num text-2xl font-semibold text-base-content">{accountGroups.length}</div>
      <span class="text-xs text-base-content/50">{$_('admin_balances_deduped_accounts')}</span>
    </div>
    <div class="card-surface p-4">
      <span class="eyebrow">{$_('admin_balances_assets')}</span>
      <div class="mt-2 font-mono-num text-2xl font-semibold text-base-content">{assetRows.length}</div>
      <span class="text-xs text-base-content/50">{$_('admin_balances_nonzero_assets')}</span>
    </div>
    <div class="card-surface p-4">
      <span class="eyebrow">{$_('admin_balances_snapshot')}</span>
      <div class="mt-2 truncate font-mono-num text-sm font-semibold text-base-content">
        {formatDate(generatedAt)}
      </div>
      <span class="text-xs text-base-content/50">
        {pendingAccounts.length > 0
          ? $_('admin_balances_loading_accounts', { values: { count: pendingAccounts.length } })
          : failedAccounts.length > 0
          ? $_('admin_balances_failed_accounts', { values: { count: failedAccounts.length } })
          : $_('admin_balances_all_accounts_loaded')}
      </span>
    </div>
  </div>

  {#if loading}
    <div class="card card-surface shadow-none">
      <div class="card-body flex-row items-center gap-3 p-5">
        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
        <span class="text-sm text-base-content/60 capitalize">{$_('admin_balances_loading')}</span>
      </div>
    </div>
  {:else if error}
    <div class="card card-surface border-error/30 shadow-none">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">{$_('admin_balances_unavailable')}</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <button type="button" class="btn btn-sm btn-ghost w-fit capitalize" onclick={refreshBalances}>
          {$_('admin_retry')}
        </button>
      </div>
    </div>
  {:else}
    <div class="card card-surface shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
            {$_('admin_balances_by_asset')}
          </span>
          <span class="text-sm text-base-content/60">{$_('admin_balances_by_asset_hint')}</span>
        </div>

        {#if filteredAssetRows.length === 0}
          <div class="card-surface-inset p-5 text-sm text-base-content/60">
            {#if pendingAccounts.length > 0}
              <span class="inline-flex items-center gap-3">
                <span class="loading loading-spinner loading-sm text-base-content/50"></span>
                <span>{$_('admin_balances_loading_accounts', { values: { count: pendingAccounts.length } })}</span>
              </span>
            {:else}
              {$_('admin_balances_no_assets')}
            {/if}
          </div>
        {:else}
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each filteredAssetRows as row (row.asset)}
              <div class="rounded-lg border border-base-300 bg-base-100 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col">
                    <span class="font-mono text-base font-semibold text-base-content">{row.asset}</span>
                    <span class="text-xs text-base-content/50">
                      {$_('admin_balances_accounts_count', { values: { count: row.accounts } })}
                    </span>
                  </div>
                  <span class="rounded-full bg-base-200 px-2 py-1 font-mono-num text-xs text-base-content/60">
                    {formatAmount(row.total)}
                  </span>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <div class="rounded-md bg-base-200/60 p-2">
                    <span class="block text-xs text-base-content/50">{$_('admin_direct_mm_free')}</span>
                    <span class="font-mono-num text-sm text-base-content">{formatAmount(row.free)}</span>
                  </div>
                  <div class="rounded-md bg-base-200/60 p-2">
                    <span class="block text-xs text-base-content/50">{$_('admin_direct_mm_used')}</span>
                    <span class="font-mono-num text-sm text-base-content">{formatAmount(row.used)}</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
          {#if pendingAccounts.length > 0}
            <div class="mt-2 inline-flex items-center gap-2 text-xs text-base-content/50">
              <span class="loading loading-spinner loading-xs"></span>
              <span>{$_('admin_balances_loading_accounts', { values: { count: pendingAccounts.length } })}</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="card card-surface shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div class="flex flex-col gap-1">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              {$_('admin_balances_by_account')}
            </span>
            <span class="text-sm text-base-content/60">{$_('admin_balances_by_account_hint')}</span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select class="select select-sm select-bordered border-base-300 bg-base-100 capitalize" bind:value={exchangeFilter}>
              {#each exchangeOptions as exchange (exchange)}
                <option value={exchange}>{exchange === 'all' ? $_('all_exchanges') : exchange}</option>
              {/each}
            </select>
            <select class="select select-sm select-bordered border-base-300 bg-base-100 font-mono text-xs" bind:value={assetFilter}>
              {#each assetOptions as asset (asset)}
                <option value={asset}>{asset === 'all' ? $_('admin_balances_all_assets') : asset}</option>
              {/each}
            </select>
            <input
              class="input input-sm input-bordered min-w-56 border-base-300 bg-base-100 font-mono text-xs"
              type="text"
              placeholder={$_('admin_balances_search_placeholder')}
              bind:value={query}
            />
          </div>
        </div>

        {#if filteredAccountRows.length === 0}
          <div class="card-surface-inset p-5 text-sm text-base-content/60">
            {#if pendingAccounts.length > 0}
              <span class="inline-flex items-center gap-3">
                <span class="loading loading-spinner loading-sm text-base-content/50"></span>
                <span>{$_('admin_balances_loading_accounts', { values: { count: pendingAccounts.length } })}</span>
              </span>
            {:else}
              {$_('admin_balances_no_account_rows')}
            {/if}
          </div>
        {:else}
          <div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize text-base-content/50">
                  <th class="font-medium">{$_('admin_connectivity_account')}</th>
                  <th class="font-medium">{$_('exchange')}</th>
                  <th class="font-medium">{$_('api_key')}</th>
                  <th class="font-medium">{$_('asset_id')}</th>
                  <th class="text-right font-medium">{$_('admin_direct_mm_free')}</th>
                  <th class="text-right font-medium">{$_('admin_direct_mm_used')}</th>
                  <th class="text-right font-medium">{$_('total')}</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredAccountRows as row (row.accountKey)}
                  <tr class="border-b border-base-300 last:border-b-0">
                    <td>
                      <span class="flex min-w-44 flex-col">
                        <span class="text-sm font-medium text-base-content">{displayAccountName(row.account)}</span>
                        {#if row.account.keys.length > 1}
                          <span class="text-xs text-base-content/45">
                            {$_('admin_balances_keys_merged', { values: { count: row.account.keys.length } })}
                          </span>
                        {/if}
                      </span>
                    </td>
                    <td class="capitalize">{row.account.exchange}</td>
                    <td>
                      <div class="flex flex-wrap gap-1">
                        {#each row.account.keys as key (key.key_id)}
                          <span class="badge badge-sm border-base-300 bg-base-200 font-mono text-[10px] text-base-content/70">
                            {permissionLabel(key.permissions)} · {fingerprint(key.api_key)}
                          </span>
                        {/each}
                      </div>
                    </td>
                    <td class="font-mono font-semibold">{row.asset}</td>
                    <td class="text-right font-mono-num text-xs">{formatAmount(row.free)}</td>
                    <td class="text-right font-mono-num text-xs">{formatAmount(row.used)}</td>
                    <td class="text-right font-mono-num text-xs font-semibold">{formatAmount(row.total)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if pendingAccounts.length > 0}
            <div class="mt-2 inline-flex items-center gap-2 text-xs text-base-content/50">
              <span class="loading loading-spinner loading-xs"></span>
              <span>{$_('admin_balances_loading_accounts', { values: { count: pendingAccounts.length } })}</span>
            </div>
          {/if}
        {/if}

        {#if failedAccounts.length > 0}
          <div class="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <span class="text-sm font-semibold text-base-content">
              {$_('admin_balances_partial_failures')}
            </span>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              {#each failedAccounts as row (row.key.key_id)}
                <div class="rounded-md border border-base-300 bg-base-100 p-3">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate text-sm font-medium text-base-content">{row.key.name}</span>
                    <span class="text-xs capitalize text-base-content/50">{row.key.exchange}</span>
                  </div>
                  <span class="mt-1 block text-xs text-warning">{row.error}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>
