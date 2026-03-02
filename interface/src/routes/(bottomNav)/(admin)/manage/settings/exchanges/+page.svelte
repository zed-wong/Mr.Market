<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { invalidate } from "$app/navigation";
  import {
    getSupportedExchanges,
    getAllCcxtExchanges,
    removeExchange,
    updateExchange,
  } from "$lib/helpers/mrm/admin/growdata";
  import {
    removeAPIKey,
    removeAPIKeysByExchange,
    updateAPIKeyState,
  } from "$lib/helpers/mrm/admin/exchanges";
  import AddExchange from "$lib/components/admin/exchanges/addExchange.svelte";
  import AddApiKey from "$lib/components/admin/exchanges/addAPIKey.svelte";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  type ExchangeConfig = {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  };

  let allCcxtExchanges: string[] = [];
  let supportedExchanges: string[] = [];
  let expandedExchanges: Record<string, boolean> = {};
  let searchTerm = "";
  let statusFilter = "all";
  let isRefreshing = false;
  let updatingExchangeIds: Record<string, boolean> = {};
  let deletingExchangeIds: Record<string, boolean> = {};
  let updatingKeyIds: Record<string, boolean> = {};
  let deletingKeyIds: Record<string, boolean> = {};

  $: exchanges = ($page.data.growInfo?.exchanges || []) as ExchangeConfig[];
  $: keys = ($page.data.apiKeys || []) as AdminSingleKey[];

  $: filteredExchanges = exchanges.filter((exchange) => {
    const normalized = searchTerm.trim().toLowerCase();
    const hasSearchMatch =
      !normalized ||
      exchange.name.toLowerCase().includes(normalized) ||
      exchange.exchange_id.toLowerCase().includes(normalized);
    const hasStatusMatch =
      statusFilter === "all" ||
      (statusFilter === "enabled" && exchange.enable) ||
      (statusFilter === "disabled" && !exchange.enable);
    return hasSearchMatch && hasStatusMatch;
  });

  $: keysByExchange = keys.reduce(
    (acc, key) => {
      const exchangeId = key.exchange || "";
      if (!acc[exchangeId]) acc[exchangeId] = [];
      acc[exchangeId].push(key);
      return acc;
    },
    {} as Record<string, AdminSingleKey[]>,
  );

  $: totalKeys = keys.length;
  $: totalEnabledExchanges = exchanges.filter((item) => item.enable).length;
  $: totalEnabledKeys = keys.filter((item) => item.enabled !== false).length;

  function getExchangeKeys(exchangeId: string) {
    return keysByExchange[exchangeId] || [];
  }

  function getRandomDelay() {
    return Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000;
  }

  async function refreshExchanges(showToast = true) {
    if (showToast) {
      isRefreshing = true;
      const refreshTask = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          invalidate("admin:settings:exchanges")
            .then(() => resolve())
            .catch((error) => reject(error))
            .finally(() => {
              isRefreshing = false;
            });
        }, getRandomDelay());
      });
      await toast.promise(refreshTask, {
        loading: $_("refreshing_msg"),
        success: $_("refresh_success_msg"),
        error: $_("refresh_failed_msg"),
      });
      return;
    }

    await invalidate("admin:settings:exchanges");
  }

  async function toggleExchange(exchange: ExchangeConfig) {
    const token = localStorage.getItem("admin-access-token");
    if (!token) return;

    updatingExchangeIds = { ...updatingExchangeIds, [exchange.exchange_id]: true };

    try {
      await updateExchange(
        exchange.exchange_id,
        {
          exchange_id: exchange.exchange_id,
          name: exchange.name,
          icon_url: exchange.icon_url || "",
          enable: !exchange.enable,
        },
        token,
      );
      toast.success($_("success"));
      await refreshExchanges(false);
    } catch (error) {
      console.error("Failed to update exchange", error);
      toast.error($_("update_failed"));
    } finally {
      updatingExchangeIds = { ...updatingExchangeIds, [exchange.exchange_id]: false };
    }
  }

  async function handleDeleteExchange(exchange: ExchangeConfig) {
    if (!confirm($_("confirm_delete_exchange_with_keys"))) {
      return;
    }

    const token = localStorage.getItem("admin-access-token");
    if (!token) return;

    deletingExchangeIds = { ...deletingExchangeIds, [exchange.exchange_id]: true };

    try {
      await removeAPIKeysByExchange(exchange.exchange_id, token);
      await removeExchange(exchange.exchange_id, token);
      toast.success($_("success"));
      await refreshExchanges(false);
    } catch (error) {
      console.error("Failed to remove exchange with keys", error);
      toast.error($_("delete_failed"));
    } finally {
      deletingExchangeIds = { ...deletingExchangeIds, [exchange.exchange_id]: false };
    }
  }

  async function toggleAPIKey(key: AdminSingleKey) {
    const token = localStorage.getItem("admin-access-token");
    if (!token) return;

    updatingKeyIds = { ...updatingKeyIds, [key.key_id]: true };

    try {
      await updateAPIKeyState(key.key_id, key.enabled === false, token);
      toast.success($_("success"));
      await refreshExchanges(false);
    } catch (error) {
      console.error("Failed to update API key state", error);
      toast.error($_("update_failed"));
    } finally {
      updatingKeyIds = { ...updatingKeyIds, [key.key_id]: false };
    }
  }

  async function handleDeleteAPIKey(keyId: string) {
    if (!confirm($_("confirm_delete_api_key"))) {
      return;
    }

    const token = localStorage.getItem("admin-access-token");
    if (!token) return;

    deletingKeyIds = { ...deletingKeyIds, [keyId]: true };

    try {
      await removeAPIKey(keyId, token);
      toast.success($_("success"));
      await refreshExchanges(false);
    } catch (error) {
      console.error("Failed to delete API key", error);
      toast.error($_("delete_failed"));
    } finally {
      deletingKeyIds = { ...deletingKeyIds, [keyId]: false };
    }
  }

  function toggleExpanded(exchangeId: string) {
    expandedExchanges = {
      ...expandedExchanges,
      [exchangeId]: !expandedExchanges[exchangeId],
    };
  }

  onMount(async () => {
    const token = localStorage.getItem("admin-access-token");
    if (!token) return;

    try {
      supportedExchanges = (await getSupportedExchanges(token)) as string[];
      allCcxtExchanges = await getAllCcxtExchanges(token);
    } catch (error) {
      console.error("Failed to load exchange metadata", error);
    }

    await refreshExchanges(false);
  });
</script>

<div class="p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto">
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
  >
    <div class="flex items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
      <button on:click={() => window.history.back()} class="btn btn-ghost btn-circle">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
      </button>

      <div class="flex flex-col text-start items-start justify-center min-w-0">
        <span class="text-xl sm:text-2xl font-bold">{$_("exchanges")}</span>
        <span class="text-sm text-base-content/60">{$_("manage_exchange_access")}</span>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
      <AddExchange {allCcxtExchanges} existingExchanges={exchanges} />
      <button class="btn btn-square btn-outline" on:click={() => refreshExchanges()}>
        <span class={clsx(isRefreshing && "loading loading-spinner loading-sm")}>
          {#if !isRefreshing}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-5 h-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          {/if}
        </span>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div class="card bg-base-100 border border-base-200 shadow-sm">
      <div class="card-body py-4">
        <p class="text-sm text-base-content/60">{$_("exchanges")}</p>
        <p class="text-2xl font-semibold">{exchanges.length}</p>
      </div>
    </div>
    <div class="card bg-base-100 border border-base-200 shadow-sm">
      <div class="card-body py-4">
        <p class="text-sm text-base-content/60">{$_("enabled")}</p>
        <p class="text-2xl font-semibold">{totalEnabledExchanges}</p>
      </div>
    </div>
    <div class="card bg-base-100 border border-base-200 shadow-sm">
      <div class="card-body py-4">
        <p class="text-sm text-base-content/60">{$_("api_keys")}</p>
        <p class="text-2xl font-semibold">{totalEnabledKeys}/{totalKeys}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row gap-3">
    <label class="input input-bordered flex items-center gap-2 w-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="w-4 h-4 text-base-content/50"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>
      <input type="text" class="grow" bind:value={searchTerm} placeholder={$_("search")} />
    </label>

    <select class="select select-bordered w-full sm:w-52" bind:value={statusFilter}>
      <option value="all">{$_("all")}</option>
      <option value="enabled">{$_("enabled")}</option>
      <option value="disabled">{$_("disabled")}</option>
    </select>
  </div>

  {#if filteredExchanges.length === 0}
    <div class="card bg-base-100 border border-base-200">
      <div class="card-body py-10 text-center text-base-content/60">
        {$_("no_exchanges_found")}
      </div>
    </div>
  {:else}
    <div class="space-y-4">
      {#each filteredExchanges as exchange}
        {@const exchangeKeys = getExchangeKeys(exchange.exchange_id)}
        {@const enabledKeyCount = exchangeKeys.filter((item) => item.enabled !== false).length}
        <div class="card bg-base-100 border border-base-200 shadow-sm">
          <div class="card-body gap-4">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0">
                <div class="avatar">
                  <div class="mask mask-squircle bg-base-200 w-11 h-11 p-1">
                    {#if exchange.icon_url}
                      <img src={exchange.icon_url} alt={exchange.name} class="object-contain w-full h-full" />
                    {:else}
                      <span class="font-semibold text-sm">{exchange.name.substring(0, 2).toUpperCase()}</span>
                    {/if}
                  </div>
                </div>

                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold truncate">{exchange.name}</p>
                    <span class="badge badge-ghost badge-sm lowercase">{exchange.exchange_id}</span>
                    {#if supportedExchanges.includes(exchange.exchange_id)}
                      <span class="badge badge-success badge-sm text-base-100">{$_("supported")}</span>
                    {:else}
                      <span class="badge badge-error badge-sm text-base-100">{$_("unsupported")}</span>
                    {/if}
                    <span class={clsx(
                      "badge badge-sm",
                      exchange.enable ? "badge-success text-base-100" : "badge-warning text-base-100"
                    )}>
                      {exchange.enable ? $_("enabled") : $_("disabled")}
                    </span>
                  </div>
                  <p class="text-sm text-base-content/60">
                    {enabledKeyCount}/{exchangeKeys.length} {$_("api_keys")} {$_("enabled")}
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  class={clsx(
                    "btn btn-sm",
                    exchange.enable ? "btn-success" : "btn-outline",
                  )}
                  on:click={() => toggleExchange(exchange)}
                  disabled={!!updatingExchangeIds[exchange.exchange_id]}
                >
                  {#if updatingExchangeIds[exchange.exchange_id]}
                    <span class="loading loading-spinner loading-xs"></span>
                  {/if}
                  {exchange.enable ? $_("disable") : $_("enable")}
                </button>

                <AddApiKey
                  existingKeys={keys}
                  defaultExchange={exchange.exchange_id}
                  invalidateKey="admin:settings:exchanges"
                  buttonClass="btn btn-sm btn-primary"
                />

                <button
                  class="btn btn-sm btn-ghost text-error hover:bg-error/10"
                  on:click={() => handleDeleteExchange(exchange)}
                  disabled={!!deletingExchangeIds[exchange.exchange_id]}
                >
                  {#if deletingExchangeIds[exchange.exchange_id]}
                    <span class="loading loading-spinner loading-xs"></span>
                  {/if}
                  {$_("delete")}
                </button>

                <button class="btn btn-sm btn-ghost" on:click={() => toggleExpanded(exchange.exchange_id)}>
                  {expandedExchanges[exchange.exchange_id] ? $_("hide") : $_("show")} {$_("api_keys")}
                </button>
              </div>
            </div>

            {#if expandedExchanges[exchange.exchange_id]}
              {#if exchangeKeys.length === 0}
                <div class="rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-base-content/60">
                  {$_("no_api_keys_found")}
                </div>
              {:else}
                <div class="overflow-x-auto rounded-box border border-base-200">
                  <table class="table table-sm sm:table-md">
                    <thead>
                      <tr>
                        <th>{$_("label")}</th>
                        <th>{$_("key_id")}</th>
                        <th>{$_("status")}</th>
                        <th>{$_("enabled")}</th>
                        <th class="text-right">{$_("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each exchangeKeys as key (key.key_id)}
                        <tr class="hover:bg-base-200/30 transition-colors">
                          <td>
                            <div class="font-medium">{key.name}</div>
                          </td>
                          <td>
                            <code class="font-mono text-xs">...{key.api_key.slice(-6)}</code>
                          </td>
                          <td>
                            {#if key.state === "alive"}
                              <span class="badge badge-success badge-sm">{$_("active")}</span>
                            {:else}
                              <span class="badge badge-ghost badge-sm">{key.state || $_("unknown")}</span>
                            {/if}
                          </td>
                          <td>
                            <button
                              class={clsx(
                                "btn btn-xs",
                                key.enabled !== false ? "btn-success" : "btn-outline",
                              )}
                              on:click={() => toggleAPIKey(key)}
                              disabled={!!updatingKeyIds[key.key_id]}
                            >
                              {#if updatingKeyIds[key.key_id]}
                                <span class="loading loading-spinner loading-xs"></span>
                              {/if}
                              {key.enabled !== false ? $_("enabled") : $_("disabled")}
                            </button>
                          </td>
                          <td class="text-right">
                            <button
                              class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                              on:click={() => handleDeleteAPIKey(key.key_id)}
                              disabled={!!deletingKeyIds[key.key_id]}
                            >
                              {#if deletingKeyIds[key.key_id]}
                                <span class="loading loading-spinner loading-xs"></span>
                              {/if}
                              {$_("delete")}
                            </button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
