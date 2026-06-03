<script lang="ts">
  import { toast } from "svelte-sonner";
  import { onDestroy, onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { page } from "$app/stores";
  import AdminStatePanel from "$lib/components/admin/shared/AdminStatePanel.svelte";
  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import AddExchange from "$lib/components/admin/exchanges/addExchange.svelte";
  import { classifyAdminError, type AdminErrorState } from "$lib/helpers/admin/common-states";
  import { getAccessToken } from "$lib/helpers/api/client";
  import { getGrowBasicInfoStrict } from "$lib/helpers/mrm/grow";
  import {
    addAPIKey,
    getAllAPIKeys,
    getAPIKeyAccountSnapshot,
    getEncryptionPublicKey,
    removeAPIKey,
  } from "$lib/helpers/mrm/admin/exchanges";
  import {
    getAllCcxtExchanges,
    getSupportedExchanges,
    removeExchange,
  } from "$lib/helpers/mrm/admin/growdata";
  import { encryptSecret } from "$lib/helpers/encryption/crypto";
  import { getExchangeReadiness, summarizeExchangeReadiness } from "$lib/helpers/admin/exchange-readiness";
  import {
    getApiKeyPermissionViews,
    getApiKeyReadiness,
    getApiKeyUseReadiness,
    summarizeApiKeyReadiness,
  } from "$lib/helpers/admin/api-key-readiness";
  import type { AdminAPIKeyAccountSnapshot, AdminSingleKey } from "$lib/types/hufi/admin";
  import type { GrowInfo } from "$lib/types/hufi/grow";

  type ExchangeVenue = {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  };

  type FormErrors = Partial<Record<"exchange" | "name" | "apiKey" | "apiSecret" | "metadata" | "duplicate", string>>;

  let supportedExchanges = $state<string[]>([]);
  let allCcxtExchanges = $state<string[]>([]);
  let growInfo = $state<GrowInfo | null>(null);
  let apiKeys = $state<AdminSingleKey[]>([]);
  let publicKey = $state("");
  let loading = $state(true);
  let metadataLoading = $state(true);
  let isRefreshing = $state(false);
  let savingAccount = $state(false);
  let removingKeyId = $state<string | null>(null);
  let removingExchangeId = $state<string | null>(null);
  let exchangeError = $state<AdminErrorState | null>(null);
  let accountError = $state<AdminErrorState | null>(null);
  let metadataError = $state<AdminErrorState | null>(null);
  let expandedExchangeIds = $state<string[]>([]);
  let accountDialogEl = $state<HTMLDialogElement | null>(null);
  let accountDetailDialogEl = $state<HTMLDialogElement | null>(null);
  let accountExchangeDropdownEl = $state<HTMLDivElement | null>(null);
  let accountDeleteCandidate = $state<AdminSingleKey | null>(null);
  let selectedAccountKey = $state<AdminSingleKey | null>(null);
  let accountSnapshot = $state<AdminAPIKeyAccountSnapshot | null>(null);
  let accountSnapshotLoading = $state(false);
  let accountSnapshotError = $state("");
  let accountExchangeDropdownOpen = $state(false);
  let pendingRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let accountFormErrors = $state<FormErrors>({});
  let accountFormErrorMessage = $state("");

  let accountForm = $state({
    exchange: "",
    name: "",
    apiKey: "",
    apiSecret: "",
    permissions: "read" as "read" | "read-trade",
  });

  let exchanges = $derived((growInfo?.exchanges ?? []) as ExchangeVenue[]);
  let exchangeIds = $derived(new Set(exchanges.map((exchange) => exchange.exchange_id.toLowerCase())));
  let keysByExchange = $derived(
    apiKeys.reduce<Record<string, AdminSingleKey[]>>((groups, key) => {
      const id = String(key.exchange || "").toLowerCase();
      if (!groups[id]) groups[id] = [];
      groups[id].push(key);
      return groups;
    }, {}),
  );
  let orphanKeyExchangeIds = $derived(
    Array.from(new Set(apiKeys.map((key) => String(key.exchange || "").toLowerCase()).filter(Boolean))).filter(
      (exchange) => !exchangeIds.has(exchange),
    ),
  );
  let venueRows = $derived(
    [
      ...exchanges,
      ...orphanKeyExchangeIds.map((exchange) => ({
        exchange_id: exchange,
        name: exchange,
        enable: false,
        icon_url: "",
      })),
    ].sort((left, right) => {
      const leftId = left.exchange_id.toLowerCase();
      const rightId = right.exchange_id.toLowerCase();
      const accountDelta = (keysByExchange[rightId]?.length ?? 0) - (keysByExchange[leftId]?.length ?? 0);
      return accountDelta || left.name.localeCompare(right.name);
    }),
  );
  let exchangeTotals = $derived(summarizeExchangeReadiness(exchanges));
  let accountTotals = $derived(summarizeApiKeyReadiness(apiKeys));
  let readOnlyApiKeyCount = $derived(
    apiKeys.filter((key) => {
      const permissions = getApiKeyPermissionViews(key);
      return permissions.some((view) => view.capability === "read") &&
        !permissions.some((view) => view.capability === "trade");
    }).length,
  );
  let executionReadyCount = $derived(
    apiKeys.filter((key) => getApiKeyUseReadiness(key, "trade").usable).length,
  );
  let metadataReadyCount = $derived(exchanges.filter((exchange) => exchange.enable).length);
  let encryptionReady = $derived(Boolean(publicKey) && !metadataLoading && !metadataError);
  let accountExchangeQuery = $derived(accountForm.exchange.trim().toLowerCase());
  let supportedExchangeIds = $derived(new Set(supportedExchanges.map((exchange) => exchange.toLowerCase())));
  let matchingCcxtExchanges = $derived(
    allCcxtExchanges
      .filter((exchange) => !accountExchangeQuery || exchange.toLowerCase().includes(accountExchangeQuery))
      .sort((left, right) => {
        const leftName = left.toLowerCase();
        const rightName = right.toLowerCase();
        const leftSupported = supportedExchangeIds.has(leftName) ? 0 : 1;
        const rightSupported = supportedExchangeIds.has(rightName) ? 0 : 1;
        const leftStarts = accountExchangeQuery && leftName.startsWith(accountExchangeQuery) ? 0 : 1;
        const rightStarts = accountExchangeQuery && rightName.startsWith(accountExchangeQuery) ? 0 : 1;

        return leftSupported - rightSupported || leftStarts - rightStarts || leftName.localeCompare(rightName);
      })
      .slice(0, accountExchangeQuery ? 30 : 12),
  );
  let existingExchangeApiKeys = $derived(
    new Set(apiKeys.map((key) => `${key.exchange.toLowerCase()}:${key.api_key}`)),
  );

  const token = () => getAccessToken() || "";

  const formatDate = (value?: string | null): string => {
    if (!value) return $_("admin_connectivity_not_validated");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const fingerprint = (value?: string): string => {
    const raw = String(value || "").replace(/\s/g, "");
    if (!raw) return $_("admin_unavailable");
    const tail = raw.slice(-8).padStart(8, "*");
    return tail;
  };

  const formatBalanceAmount = (value: number | string | undefined): string => {
    if (value === undefined || value === null || value === "") return "0";
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: numeric >= 1 ? 8 : 12,
    }).format(numeric);
  };

  const getBalanceRows = (snapshot: AdminAPIKeyAccountSnapshot | null) => {
    if (!snapshot?.balance) return [];
    const assets = Array.from(
      new Set([
        ...Object.keys(snapshot.balance.free || {}),
        ...Object.keys(snapshot.balance.used || {}),
        ...Object.keys(snapshot.balance.total || {}),
      ]),
    ).sort((left, right) => left.localeCompare(right));

    return assets.map((asset) => ({
      asset,
      free: snapshot.balance.free?.[asset],
      used: snapshot.balance.used?.[asset],
      total: snapshot.balance.total?.[asset],
    }));
  };

  const isExpanded = (exchangeId: string) => expandedExchangeIds.includes(exchangeId);

  const toggleExpanded = (exchangeId: string) => {
    expandedExchangeIds = isExpanded(exchangeId)
      ? expandedExchangeIds.filter((id) => id !== exchangeId)
      : [...expandedExchangeIds, exchangeId];
  };

  const resetAccountForm = (exchange = "") => {
    accountForm = {
      exchange,
      name: "",
      apiKey: "",
      apiSecret: "",
      permissions: "read",
    };
    accountFormErrors = {};
    accountFormErrorMessage = "";
    accountExchangeDropdownOpen = false;
  };

  const openAddAccountDialog = (exchange = "") => {
    resetAccountForm(exchange);
    accountDialogEl?.showModal();
  };

  const closeAddAccountDialog = () => {
    accountDialogEl?.close();
  };

  const resetAccountDetailDialog = () => {
    selectedAccountKey = null;
    accountSnapshot = null;
    accountSnapshotError = "";
    accountSnapshotLoading = false;
  };

  const closeAccountDetailDialog = () => {
    accountDetailDialogEl?.close();
  };

  const loadAccountSnapshot = async (key: AdminSingleKey) => {
    const adminToken = token();
    if (!adminToken) {
      accountSnapshotError = $_("admin_connectivity_balances_session_message");
      return;
    }

    accountSnapshotLoading = true;
    accountSnapshotError = "";

    try {
      accountSnapshot = await getAPIKeyAccountSnapshot(key.key_id, adminToken);
    } catch (error) {
      accountSnapshot = null;
      accountSnapshotError = error instanceof Error ? error.message : $_("admin_connectivity_balances_load_failed");
    } finally {
      accountSnapshotLoading = false;
    }
  };

  const openAccountDetailDialog = (key: AdminSingleKey) => {
    selectedAccountKey = key;
    accountSnapshot = null;
    accountSnapshotError = "";
    accountDetailDialogEl?.showModal();
    void loadAccountSnapshot(key);
  };

  const retryAccountSnapshot = () => {
    if (!selectedAccountKey) return;
    void loadAccountSnapshot(selectedAccountKey);
  };

  const closeExchangeDropdownAfterFocus = () => {
    setTimeout(() => {
      if (!accountExchangeDropdownEl?.contains(document.activeElement)) {
        accountExchangeDropdownOpen = false;
      }
    }, 0);
  };

  const handleExchangeInputKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      accountExchangeDropdownOpen = false;
    }
  };

  const hasPendingKeys = () => apiKeys.some((key) => getApiKeyReadiness(key).status === "validation_pending");

  async function loadExchangeManagement(showLoading = true) {
    const adminToken = token();
    if (!adminToken) {
      growInfo = null;
      apiKeys = [];
      exchangeError = classifyAdminError(
        new Error($_("admin_connectivity_session_message")),
        $_("admin_connectivity_load_failed"),
      );
      loading = false;
      return;
    }

    if (showLoading) {
      loading = true;
      growInfo = null;
      apiKeys = [];
    }
    exchangeError = null;
    accountError = null;

    const [growResult, keyResult] = await Promise.allSettled([
      getGrowBasicInfoStrict(adminToken),
      getAllAPIKeys(adminToken),
    ]);

    if (growResult.status === "fulfilled") {
      growInfo = growResult.value;
    } else {
      growInfo = null;
      exchangeError = classifyAdminError(growResult.reason, $_("admin_connectivity_metadata_load_failed"));
    }

    if (keyResult.status === "fulfilled") {
      apiKeys = keyResult.value;
    } else {
      apiKeys = [];
      accountError = classifyAdminError(keyResult.reason, $_("admin_connectivity_accounts_load_failed"));
    }

    loading = false;
  }

  async function refreshExchangeManagement(showToast = true) {
    isRefreshing = true;
    const refreshTask = loadExchangeManagement(false).finally(() => {
      isRefreshing = false;
    });
    if (showToast) {
      await toast.promise(refreshTask, {
        loading: $_("admin_connectivity_refreshing"),
        success: $_("admin_connectivity_refreshed"),
        error: $_("admin_connectivity_refresh_failed"),
      });
    } else {
      await refreshTask;
    }
  }

  async function loadMetadata() {
    const adminToken = token();
    metadataLoading = true;
    if (!adminToken) {
      metadataError = classifyAdminError(
        new Error($_("admin_connectivity_metadata_session_message")),
        $_("admin_connectivity_metadata_load_failed"),
      );
      metadataLoading = false;
      return;
    }

    metadataError = null;
    try {
      const [supported, ccxt, keyPair] = await Promise.all([
        getSupportedExchanges(adminToken),
        getAllCcxtExchanges(adminToken),
        getEncryptionPublicKey(adminToken),
      ]);
      supportedExchanges = supported as string[];
      allCcxtExchanges = ccxt;
      if (!keyPair.publicKey) {
        throw new Error($_("admin_encryption_public_key_missing"));
      }
      publicKey = keyPair.publicKey;
    } catch (cause) {
      publicKey = "";
      metadataError = classifyAdminError(cause, $_("admin_connectivity_metadata_load_failed"));
    } finally {
      metadataLoading = false;
    }
  }

  const validateAccountForm = () => {
    const exchange = accountForm.exchange.trim();
    const name = accountForm.name.trim();
    const apiKey = accountForm.apiKey.trim();
    const apiSecret = accountForm.apiSecret.trim();
    const nextErrors: FormErrors = {};

    if (!exchange) nextErrors.exchange = $_("admin_form_choose_exchange");
    if (!name) nextErrors.name = $_("admin_form_enter_account_label");
    if (!apiKey) nextErrors.apiKey = $_("admin_form_paste_api_key");
    if (!apiSecret) nextErrors.apiSecret = $_("admin_form_paste_api_secret");
    if (apiKey && apiKey.length < 4) nextErrors.apiKey = $_("admin_form_api_key_min_length");
    if (apiSecret && apiSecret.length < 4) nextErrors.apiSecret = $_("admin_form_api_secret_min_length");
    if (apiKey && existingExchangeApiKeys.has(`${exchange.toLowerCase()}:${apiKey}`)) {
      nextErrors.duplicate = $_("admin_form_api_key_duplicate");
    }
    if (!encryptionReady) {
      nextErrors.metadata = metadataError
        ? $_("admin_form_encryption_metadata_failed")
        : $_("admin_form_encryption_metadata_loading");
    }

    accountFormErrors = nextErrors;
    accountFormErrorMessage = Object.values(nextErrors)[0] || "";
    return Object.keys(nextErrors).length === 0;
  };

  const submitAccount = async () => {
    const adminToken = token();
    if (!adminToken || savingAccount || !validateAccountForm()) return;

    const exchange = accountForm.exchange.trim();
    savingAccount = true;
    accountFormErrorMessage = "";

    try {
      const encryptedSecret = await encryptSecret(accountForm.apiSecret.trim(), publicKey);
      await addAPIKey(
        {
          exchange,
          name: accountForm.name.trim(),
          api_key: accountForm.apiKey.trim(),
          api_secret: encryptedSecret,
          permissions: accountForm.permissions,
        },
        adminToken,
      );
      toast.success($_("admin_connectivity_account_added"));
      expandedExchangeIds = Array.from(new Set([...expandedExchangeIds, exchange.toLowerCase()]));
      closeAddAccountDialog();
      resetAccountForm();
      await loadExchangeManagement(false);
    } catch (error) {
      accountFormErrorMessage = error instanceof Error ? error.message : $_("admin_connectivity_account_add_failed");
    } finally {
      savingAccount = false;
    }
  };

  const deleteExchangeVenue = async (exchange: ExchangeVenue) => {
    const adminToken = token();
    if (!adminToken || removingExchangeId) return;

    removingExchangeId = exchange.exchange_id;
    try {
      await toast.promise(removeExchange(exchange.exchange_id, adminToken), {
        loading: $_("admin_connectivity_deleting_exchange", { values: { exchange: exchange.name } }),
        success: $_("admin_connectivity_exchange_deleted", { values: { exchange: exchange.name } }),
        error: $_("admin_connectivity_exchange_delete_failed", { values: { exchange: exchange.name } }),
      });
      await loadExchangeManagement(false);
    } finally {
      removingExchangeId = null;
    }
  };

  const confirmDeleteAccount = async () => {
    const adminToken = token();
    if (!adminToken || !accountDeleteCandidate || removingKeyId) return;

    removingKeyId = accountDeleteCandidate.key_id;
    try {
      await removeAPIKey(accountDeleteCandidate.key_id, adminToken);
      toast.success($_("admin_connectivity_account_deleted"));
      accountDeleteCandidate = null;
      await loadExchangeManagement(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : $_("admin_connectivity_account_delete_failed"));
    } finally {
      removingKeyId = null;
    }
  };

  onMount(async () => {
    if ($page.data.growInfoError) {
      exchangeError = classifyAdminError(
        new Error(String($page.data.growInfoError)),
        $_("admin_connectivity_load_failed"),
      );
      loading = false;
    } else {
      await loadExchangeManagement();
    }

    await loadMetadata();

    pendingRefreshTimer = setInterval(() => {
      if (hasPendingKeys() && !isRefreshing) {
        void loadExchangeManagement(false);
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
    eyebrow={$_("admin.nav.connectivity")}
    title={$_("admin.nav.exchange_connectivity")}
    subtitle={$_("admin_connectivity_exchanges_subtitle")}
  >
    {#snippet actions()}
      <AddExchange
        {allCcxtExchanges}
        existingExchanges={exchanges}
        onRefresh={() => refreshExchangeManagement(false)}
      />
      <button
        class="btn btn-primary btn-sm rounded-full capitalize"
        onclick={() => openAddAccountDialog()}
        disabled={!encryptionReady}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        {$_("admin_connectivity_add_account")}
      </button>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        onclick={() => refreshExchangeManagement()}
        disabled={isRefreshing}
      >
        {isRefreshing ? $_("refreshing_msg") : $_("refresh")}
      </button>
    {/snippet}
  </PageHeader>

  {#if $page.data.waitingForClientSession || loading}
    <AdminStatePanel
      kind="loading"
      context={$_("admin.nav.exchange_connectivity")}
      title={$_("admin_connectivity_loading_title")}
      message={$_("admin_connectivity_loading_message")}
      testId="exchange-connectivity-loading"
    />
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3" aria-hidden="true">
      {#each Array(3) as _}
        <div class="skeleton h-24 rounded-lg"></div>
      {/each}
    </div>
    <div class="skeleton h-72 w-full rounded-lg" aria-hidden="true"></div>
  {:else if exchangeError && !growInfo}
    <AdminStatePanel
      kind={exchangeError.kind}
      context={$_("admin.nav.exchange_connectivity")}
      title={exchangeError.title}
      message={exchangeError.message}
      actionLabel={exchangeError.kind === "session" ? $_("admin_sign_in_again") : $_("admin_retry")}
      actionHref={exchangeError.kind === "session" ? "/login" : ""}
      onAction={exchangeError.kind === "session" ? undefined : () => refreshExchangeManagement(false)}
      testId="exchange-connectivity-error"
    />
  {:else}
    {#if metadataError}
      <AdminStatePanel
        kind={metadataError.kind}
        context={$_("admin_connectivity_exchange_metadata")}
        title={metadataError.title}
        message={metadataError.message}
        actionLabel={$_("admin_connectivity_retry_metadata")}
        onAction={() => void loadMetadata()}
        testId="exchange-metadata-error"
      />
    {/if}

    {#if accountError}
      <AdminStatePanel
        kind={accountError.kind}
        context={$_("admin_connectivity_exchange_accounts")}
        title={accountError.title}
        message={accountError.message}
        actionLabel={$_("admin_connectivity_retry_accounts")}
        onAction={() => refreshExchangeManagement(false)}
        testId="exchange-account-error"
      />
    {/if}

    <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-2 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_("admin_connectivity_venues")}</span>
          <span class="font-mono text-2xl font-semibold">{exchangeTotals.total}</span>
          <span class="text-xs text-base-content/50">{$_("admin_connectivity_metadata_ready_count", { values: { count: metadataReadyCount } })}</span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-2 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_("admin_connectivity_accounts")}</span>
          <span class="font-mono text-2xl font-semibold">{accountTotals.total}</span>
          <span class="text-xs text-base-content/50">{$_("admin_connectivity_execution_credentials_attached")}</span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-2 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_("read_only")}</span>
          <span class="font-mono text-2xl font-semibold">{readOnlyApiKeyCount}</span>
          <span class="text-xs text-base-content/50">{$_("admin_connectivity_read_only_hint")}</span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-2 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_("admin_connectivity_execution")}</span>
          <span class="font-mono text-2xl font-semibold text-success">{executionReadyCount}</span>
          <span class="text-xs text-base-content/50">{$_("admin_connectivity_execution_hint")}</span>
        </div>
      </div>
    </div>

    {#if venueRows.length === 0}
      <AdminStatePanel
        kind="empty"
        context={$_("admin.nav.exchange_connectivity")}
        title={$_("admin_connectivity_empty_title")}
        message={$_("admin_connectivity_empty_message")}
        actionLabel={$_("add_exchange")}
        onAction={() => document.querySelector<HTMLButtonElement>('[data-testid="add-exchange-trigger"]')?.click()}
        testId="exchange-connectivity-empty"
      />
    {:else}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-0 p-0">
          <div class="grid grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.8fr)_minmax(140px,0.8fr)_minmax(120px,0.6fr)_auto] gap-3 border-b border-base-300 px-4 py-3 text-xs capitalize text-base-content/50 max-lg:hidden">
            <span>{$_("exchange")}</span>
            <span>{$_("admin_connectivity_exchange_metadata")}</span>
            <span>{$_("admin_connectivity_execution")}</span>
            <span>{$_("admin_connectivity_accounts")}</span>
            <span class="text-right">{$_("actions")}</span>
          </div>

          {#each venueRows as exchange (exchange.exchange_id)}
            {@const exchangeId = exchange.exchange_id.toLowerCase()}
            {@const readiness = getExchangeReadiness(exchange)}
            {@const exchangeKeys = keysByExchange[exchangeId] ?? []}
            {@const readyTradeKeys = exchangeKeys.filter((key) => getApiKeyUseReadiness(key, "trade").usable)}
            {@const hasVenue = exchangeIds.has(exchangeId)}
            <div class="border-b border-base-300 last:border-b-0">
              <button
                type="button"
                class="grid w-full grid-cols-1 gap-3 px-4 py-4 text-left hover:bg-base-200 lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.8fr)_minmax(140px,0.8fr)_minmax(120px,0.6fr)_auto]"
                onclick={() => toggleExpanded(exchangeId)}
                aria-expanded={isExpanded(exchangeId)}
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span class="btn btn-ghost btn-xs btn-square">{isExpanded(exchangeId) ? "−" : "+"}</span>
                  <span class="flex h-8 w-16 shrink-0 items-center justify-center rounded-md border border-base-300 bg-base-100 px-2">
                    {#if exchange.icon_url}
                      <img src={exchange.icon_url} alt="" class="max-h-5 max-w-full object-contain" />
                    {:else}
                      <span class="truncate text-xs font-semibold capitalize">{exchange.name.substring(0, 8)}</span>
                    {/if}
                  </span>
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-sm font-semibold text-base-content capitalize">{exchange.name}</span>
                    <span class="truncate font-mono text-xs text-base-content/50">{exchange.exchange_id}</span>
                  </span>
                </span>

                <span class="flex items-center gap-2">
                  <span class="badge badge-sm capitalize {readiness.tone}">{hasVenue ? $_("admin_health_ready") : $_("admin_setup_missing_data")}</span>
                </span>

                <span class="flex items-center">
                  {#if readyTradeKeys.length > 0}
                    <span class="badge badge-sm badge-success text-base-100 capitalize">{$_("admin_health_ready")}</span>
                  {:else if exchangeKeys.length > 0}
                    <span class="badge badge-sm badge-warning text-base-content capitalize">{$_("admin_health_blocked")}</span>
                  {:else}
                    <span class="badge badge-sm badge-ghost capitalize">{$_("admin_connectivity_no_account")}</span>
                  {/if}
                </span>

                <span class="flex items-center font-mono text-sm text-base-content/70">
                  {exchangeKeys.length}
                </span>

                <span class="flex items-center justify-end gap-2">
                  <span
                    role="button"
                    tabindex="0"
                    class="btn btn-outline btn-xs rounded-full capitalize"
                    onclick={(event) => {
                      event.stopPropagation();
                      openAddAccountDialog(exchange.exchange_id);
                    }}
                    onkeydown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        openAddAccountDialog(exchange.exchange_id);
                      }
                    }}
                  >{$_("admin_connectivity_add_account")}</span>
                  {#if hasVenue}
                    <span
                      role="button"
                      tabindex="0"
                      class="btn btn-ghost btn-xs rounded-full text-error capitalize"
                      aria-disabled={removingExchangeId === exchange.exchange_id}
                      onclick={(event) => {
                        event.stopPropagation();
                        if (
                          removingExchangeId === exchange.exchange_id ||
                          !confirm(`Delete ${exchange.name}? Exchange accounts are managed separately.`)
                        ) {
                          return;
                        }
                        void deleteExchangeVenue(exchange);
                      }}
                      onkeydown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (
                          removingExchangeId === exchange.exchange_id ||
                          !confirm(`Delete ${exchange.name}? Exchange accounts are managed separately.`)
                        ) {
                          return;
                        }
                        void deleteExchangeVenue(exchange);
                      }}
                    >
                      {removingExchangeId === exchange.exchange_id ? $_("deleting_api_key") : $_("delete")}
                    </span>
                  {/if}
                </span>
              </button>

              {#if isExpanded(exchangeId)}
                <div class="border-t border-base-300 bg-base-200/50 px-4 py-4">
                  {#if exchangeKeys.length === 0}
                    <div class="rounded-lg border border-dashed border-base-300 bg-base-100 p-4">
                      <span class="text-sm font-semibold text-base-content capitalize">{$_("admin_connectivity_metadata_only")}</span>
                      <span class="mt-1 block text-sm text-base-content/60">
                        {$_("admin_connectivity_metadata_only_message")}
                      </span>
                    </div>
                  {:else}
                    <div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100">
                      <table class="table table-sm">
                        <thead>
                          <tr class="border-b border-base-300 text-xs capitalize text-base-content/50">
                            <th class="font-medium">{$_("admin_connectivity_account")}</th>
                            <th class="font-medium">{$_("admin_connectivity_fingerprint")}</th>
                            <th class="font-medium">{$_("permissions")}</th>
                            <th class="font-medium">{$_("status")}</th>
                            <th class="font-medium">{$_("admin_connectivity_last_validation")}</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each exchangeKeys as key (key.key_id)}
                            {@const keyReadiness = getApiKeyReadiness(key)}
                            <tr class="border-b border-base-300 last:border-b-0">
                              <td>
                                <button
                                  type="button"
                                  class="group flex max-w-[260px] flex-col rounded-md px-2 py-1 text-left transition-colors hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  onclick={() => openAccountDetailDialog(key)}
                                  aria-label={$_("admin_connectivity_view_account_details", { values: { name: key.name } })}
                                >
                                  <span class="truncate text-sm font-medium text-base-content group-hover:text-primary">{key.name}</span>
                                  <span class="text-xs text-base-content/45">{$_("admin_connectivity_view_balances")}</span>
                                </button>
                              </td>
                              <td class="font-mono text-xs text-base-content/70">{fingerprint(key.api_key)}</td>
                              <td>
                                <span class="flex flex-wrap gap-1">
                                  {#each getApiKeyPermissionViews(key) as permission (permission.capability)}
                                    <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {permission.tone}" title={permission.description}>
                                      {permission.label}
                                    </span>
                                  {/each}
                                </span>
                              </td>
                              <td>
                                <span class="flex flex-col gap-1">
                                  <span class="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {keyReadiness.tone}" title={keyReadiness.description}>
                                    {keyReadiness.label}
                                  </span>
                                  {#if key.validation_error}
                                    <span class="max-w-[220px] truncate text-xs text-error" title={key.validation_error}>{key.validation_error}</span>
                                  {/if}
                                </span>
                              </td>
                              <td class="font-mono text-xs text-base-content/70">{formatDate(key.validated_at || key.last_update)}</td>
                              <td class="text-right">
                                <button
                                  class="btn btn-ghost btn-xs rounded-full text-error capitalize"
                                  onclick={() => (accountDeleteCandidate = key)}
                                  aria-label={$_("admin_connectivity_delete_account")}
                                >{$_("delete")}</button>
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>

<dialog bind:this={accountDialogEl} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" onclose={() => resetAccountForm()}>
  <div class="modal-box max-w-xl overflow-visible rounded-t-3xl border border-base-300 bg-base-100 p-0 shadow-2xl sm:rounded-3xl">
    <div class="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
      <span class="flex flex-col gap-1">
        <span class="text-xl font-semibold tracking-tight text-base-content capitalize">{$_("admin_connectivity_add_exchange_account")}</span>
        <span class="text-sm text-base-content/60">{$_("admin_connectivity_encrypted_setup_hint")}</span>
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-circle text-base-content/60"
        onclick={closeAddAccountDialog}
        aria-label={$_("close")}
      >✕</button>
    </div>

    <div class="grid gap-4 px-6 pb-2">
      {#if !encryptionReady}
        <div class="alert alert-warning py-2 text-sm" data-testid="exchange-account-encryption-not-ready">
          {#if metadataLoading}
            {$_("admin_connectivity_encryption_loading")}
          {:else if metadataError}
            {$_("admin_connectivity_encryption_failed")}
          {:else}
            {$_("admin_connectivity_encryption_not_ready")}
          {/if}
        </div>
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_("exchange")}</span>
        <div
          class="dropdown w-full"
          class:dropdown-open={accountExchangeDropdownOpen}
          bind:this={accountExchangeDropdownEl}
          onfocusout={closeExchangeDropdownAfterFocus}
        >
          <input
            class="input input-bordered w-full rounded-2xl border-base-300 bg-base-100"
            placeholder="okx"
            bind:value={accountForm.exchange}
            onfocus={() => (accountExchangeDropdownOpen = true)}
            oninput={() => (accountExchangeDropdownOpen = true)}
            onkeydown={handleExchangeInputKeydown}
          />
          {#if accountExchangeDropdownOpen && matchingCcxtExchanges.length > 0}
            <ul class="dropdown-content z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-1.5 shadow-2xl">
              {#if !accountExchangeQuery}
                <li class="px-3 pb-1 pt-2">
                  <span class="text-xs text-base-content/50 capitalize">{$_("admin_connectivity_suggested_exchanges")}</span>
                </li>
              {/if}
              {#each matchingCcxtExchanges as exchange (exchange)}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-base-300"
                    class:bg-base-300={accountForm.exchange.toLowerCase() === exchange.toLowerCase()}
                    onclick={() => {
                      accountForm.exchange = exchange;
                      accountExchangeDropdownOpen = false;
                    }}
                  >
                    <span class="font-medium text-base-content">{exchange}</span>
                    {#if supportedExchangeIds.has(exchange.toLowerCase())}
                      <span class="rounded-full bg-base-content/5 px-2 py-0.5 text-[10px] font-medium text-base-content/50 capitalize">{$_("supported")}</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {:else if accountExchangeDropdownOpen && accountExchangeQuery}
            <div class="dropdown-content z-50 mt-2 w-full rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-2xl">
              <span class="text-sm text-base-content/60">{$_("admin_connectivity_no_exchange_matches", { values: { exchange: accountForm.exchange } })}</span>
            </div>
          {/if}
        </div>
        {#if accountFormErrors.exchange}<span class="text-xs text-error">{accountFormErrors.exchange}</span>{/if}
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_("admin_direct_mm_account_label")}</span>
        <input class="input input-bordered w-full rounded-2xl border-base-300 bg-base-100" placeholder="account@gmail.com" bind:value={accountForm.name} />
        {#if accountFormErrors.name}<span class="text-xs text-error">{accountFormErrors.name}</span>{/if}
      </label>

      <div class="my-1 h-px bg-base-300"></div>

      <label class="flex flex-col gap-1.5">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_("api_key")}</span>
        <input class="input input-bordered w-full rounded-2xl border-base-300 bg-base-100 font-mono text-sm" placeholder={$_("admin_connectivity_paste_api_key")} bind:value={accountForm.apiKey} />
        {#if accountFormErrors.apiKey}<span class="text-xs text-error">{accountFormErrors.apiKey}</span>{/if}
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="label-text text-xs font-medium capitalize text-base-content/60">{$_("api_secret")}</span>
        <input class="input input-bordered w-full rounded-2xl border-base-300 bg-base-100 font-mono text-sm" type="password" placeholder={$_("admin_connectivity_paste_api_secret")} bind:value={accountForm.apiSecret} />
        {#if accountFormErrors.apiSecret}<span class="text-xs text-error">{accountFormErrors.apiSecret}</span>{/if}
      </label>

      <div class="flex flex-wrap gap-4 pt-1">
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read" bind:group={accountForm.permissions} />
          {$_("read_only")}
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm capitalize">
          <input type="radio" class="radio radio-sm radio-primary" value="read-trade" bind:group={accountForm.permissions} />
          {$_("read_trade")}
        </label>
      </div>

      {#if accountFormErrorMessage}
        <div class="alert alert-error py-2 text-sm">{accountFormErrorMessage}</div>
      {/if}
      {#if accountFormErrors.duplicate && accountFormErrors.duplicate !== accountFormErrorMessage}
        <div class="alert alert-error py-2 text-sm">{accountFormErrors.duplicate}</div>
      {/if}
      {#if accountFormErrors.metadata && accountFormErrors.metadata !== accountFormErrorMessage}
        <div class="alert alert-warning py-2 text-sm">{accountFormErrors.metadata}</div>
      {/if}
    </div>

    <div class="modal-action mt-4 border-t border-base-300 px-6 py-5">
      <button type="button" class="btn btn-ghost rounded-full capitalize" onclick={closeAddAccountDialog}>{$_("cancel")}</button>
      <button type="button" class="btn btn-primary rounded-full capitalize" onclick={submitAccount} disabled={savingAccount || !encryptionReady}>
        {#if savingAccount}<span class="loading loading-spinner loading-xs"></span>{/if}
        {$_("admin_connectivity_add_account")}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label={$_("close")}>{$_("close")}</button>
  </form>
</dialog>

<dialog bind:this={accountDetailDialogEl} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" onclose={resetAccountDetailDialog}>
  <div class="modal-box max-w-3xl rounded-t-3xl border border-base-300 bg-base-100 p-0 shadow-2xl sm:rounded-3xl">
    <div class="flex items-start justify-between gap-4 border-b border-base-300 px-6 pb-5 pt-6">
      <span class="flex min-w-0 flex-col gap-1">
        <span class="truncate text-xl font-semibold tracking-tight text-base-content">{selectedAccountKey?.name || $_("admin_connectivity_account")}</span>
        <span class="text-sm text-base-content/60">
          {selectedAccountKey?.exchange || $_("exchange")} · {fingerprint(selectedAccountKey?.api_key)}
        </span>
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-circle text-base-content/60"
        onclick={closeAccountDetailDialog}
        aria-label={$_("close")}
      >✕</button>
    </div>

    <div class="grid gap-5 px-6 py-5">
      {#if selectedAccountKey}
        {@const selectedReadiness = getApiKeyReadiness(selectedAccountKey)}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
            <span class="text-xs capitalize text-base-content/50">{$_("permissions")}</span>
            <span class="mt-2 flex flex-wrap gap-1">
              {#each getApiKeyPermissionViews(selectedAccountKey) as permission (permission.capability)}
                <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {permission.tone}" title={permission.description}>
                  {permission.label}
                </span>
              {/each}
            </span>
          </div>
          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
            <span class="text-xs capitalize text-base-content/50">{$_("status")}</span>
            <span class="mt-2 flex flex-col gap-1">
              <span class="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium capitalize {selectedReadiness.tone}" title={selectedReadiness.description}>
                {selectedReadiness.label}
              </span>
              {#if selectedAccountKey.validation_error}
                <span class="truncate text-xs text-error" title={selectedAccountKey.validation_error}>{selectedAccountKey.validation_error}</span>
              {/if}
            </span>
          </div>
          <div class="rounded-lg border border-base-300 bg-base-100 p-3">
            <span class="text-xs capitalize text-base-content/50">{$_("admin_connectivity_last_validation")}</span>
            <span class="mt-2 block font-mono text-xs text-base-content/70">{formatDate(selectedAccountKey.validated_at || selectedAccountKey.last_update)}</span>
          </div>
        </div>
      {/if}

      <div class="rounded-lg border border-base-300 bg-base-100">
        <div class="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
          <span class="text-sm font-semibold capitalize text-base-content">{$_("admin_connectivity_balances")}</span>
          {#if accountSnapshot}
            <span class="font-mono text-xs text-base-content/45">{formatDate(accountSnapshot.generated_at)}</span>
          {/if}
        </div>

        {#if accountSnapshotLoading}
          <div class="flex items-center gap-2 px-4 py-8 text-sm text-base-content/60">
            <span class="loading loading-spinner loading-sm"></span>
            {$_("admin_connectivity_loading_balances")}
          </div>
        {:else if accountSnapshotError}
          <div class="grid gap-3 px-4 py-5">
            <div class="alert alert-error py-2 text-sm">{accountSnapshotError}</div>
            {#if selectedAccountKey}
              <button
                type="button"
                class="btn btn-outline btn-sm w-fit rounded-full capitalize"
                onclick={retryAccountSnapshot}
              >{$_("admin_retry")}</button>
            {/if}
          </div>
        {:else if getBalanceRows(accountSnapshot).length > 0}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize text-base-content/50">
                  <th class="font-medium">{$_("asset_id")}</th>
                  <th class="text-right font-medium">{$_("admin_direct_mm_free")}</th>
                  <th class="text-right font-medium">{$_("admin_direct_mm_used")}</th>
                  <th class="text-right font-medium">{$_("total")}</th>
                </tr>
              </thead>
              <tbody>
                {#each getBalanceRows(accountSnapshot) as row (row.asset)}
                  <tr class="border-b border-base-300 last:border-b-0">
                    <td class="font-semibold">{row.asset}</td>
                    <td class="text-right font-mono text-xs">{formatBalanceAmount(row.free)}</td>
                    <td class="text-right font-mono text-xs">{formatBalanceAmount(row.used)}</td>
                    <td class="text-right font-mono text-xs">{formatBalanceAmount(row.total)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="px-4 py-8 text-sm text-base-content/60">{$_("admin_connectivity_no_nonzero_balances")}</div>
        {/if}
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label={$_("close")}>{$_("close")}</button>
  </form>
</dialog>

{#if accountDeleteCandidate}
  <dialog class="modal modal-open">
    <div class="modal-box border border-base-300 bg-base-100">
      <span class="text-lg font-semibold capitalize">{$_("admin_connectivity_delete_account")}</span>
      <span class="mt-2 block text-sm text-base-content/60">
        {$_("admin_connectivity_delete_account_message", {
          values: {
            name: accountDeleteCandidate.name,
            exchange: accountDeleteCandidate.exchange,
          },
        })}
      </span>
      <div class="modal-action">
        <button class="btn btn-ghost capitalize" onclick={() => (accountDeleteCandidate = null)}>{$_("cancel")}</button>
        <button class="btn btn-error capitalize" onclick={confirmDeleteAccount} disabled={removingKeyId === accountDeleteCandidate.key_id}>
          {#if removingKeyId === accountDeleteCandidate.key_id}<span class="loading loading-spinner loading-xs"></span>{/if}
          {$_("delete")}
        </button>
      </div>
    </div>
  </dialog>
{/if}
