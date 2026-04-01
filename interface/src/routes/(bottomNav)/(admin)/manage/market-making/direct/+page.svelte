<script lang="ts">
  import { invalidate } from "$app/navigation";
  import { page } from "$app/stores";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { onDestroy } from "svelte";

  import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";

  import {
    getDirectOrderStatus,
    joinAdminCampaign,
    startDirectOrder,
    stopDirectOrder,
  } from "$lib/helpers/mrm/admin/direct-market-making";
  import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";
  import type {
    CampaignJoinRecord,
    DirectOrderStatus,
    DirectOrderSummary,
  } from "$lib/types/hufi/admin-direct-market-making";
  import type { GrowInfo } from "$lib/types/hufi/grow";

  type OverrideRow = { key: string; value: string };

  const errorKeyMap: Record<string, string> = {
    "API key not found": "admin_direct_mm_error_api_key_not_found",
    "API key exchange does not match request": "admin_direct_mm_error_api_key_exchange_mismatch",
    "API key account label does not match request": "admin_direct_mm_error_api_key_account_mismatch",
    "Strategy definition not found": "admin_direct_mm_error_definition_not_found",
    "Order not found": "admin_direct_mm_error_order_not_found",
    "Order already stopped": "admin_direct_mm_error_already_stopped",
    "API key authentication failed": "admin_direct_mm_error_authentication",
    "Rate limited, try again": "admin_direct_mm_error_rate_limit",
    "Exchange timeout": "admin_direct_mm_error_timeout",
    "Campaign join already exists": "admin_direct_mm_error_campaign_join_exists",
  };

  $: growInfo = ($page.data.growInfo || null) as GrowInfo | null;
  $: strategies = ($page.data.strategies || []) as MarketMakingStrategy[];
  $: apiKeys = ($page.data.apiKeys || []) as AdminSingleKey[];
  $: initialOrders = ($page.data.directOrders || []) as DirectOrderSummary[];
  $: initialCampaigns = ($page.data.campaigns || []) as Array<Record<string, unknown>>;
  $: initialCampaignJoins = ($page.data.campaignJoins || []) as CampaignJoinRecord[];
  $: pairs = growInfo?.market_making?.pairs || [];

  let orders = initialOrders;
  let campaigns = initialCampaigns;
  let campaignJoins = initialCampaignJoins;

  let activeTab: "direct" | "campaigns" = "direct";
  let showStartForm = false;
  let isStarting = false;
  let isRefreshing = false;
  let startCooldown = false;
  let startExchangeName = "";
  let startPair = "";
  let startStrategyDefinitionId = "";
  let startApiKeyId = "";
  let configRows: OverrideRow[] = [{ key: "", value: "" }];

  let stopOrderCandidate: DirectOrderSummary | null = null;
  let isStopping = false;

  let statusDrawerOrder: DirectOrderSummary | null = null;
  let statusDrawerData: DirectOrderStatus | null = null;
  let statusLoading = false;
  let nowMs = Date.now();
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  let showJoinModal = false;
  let isJoiningCampaign = false;
  let joinCampaignAddress = "";
  let joinCampaignChainId = 0;
  let joinCampaignApiKeyId = "";
  let joinCampaignEvmAddress = "";

  $: orders = initialOrders;
  $: campaigns = initialCampaigns;
  $: campaignJoins = initialCampaignJoins;
  $: exchangeOptions = Array.from(new Set(apiKeys.map((key) => key.exchange)));
  $: filteredPairs = pairs.filter(
    (pair) => !startExchangeName || pair.exchange_id === startExchangeName,
  );
  $: filteredApiKeys = apiKeys.filter(
    (key) => !startExchangeName || key.exchange === startExchangeName,
  );
  $: selectedApiKey = apiKeys.find((key) => key.key_id === startApiKeyId) || null;
  $: campaignJoinApiKeyLabels = new Map(
    apiKeys.map((key) => [key.key_id, key.name + " · " + key.exchange_index]),
  );

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
  }

  onDestroy(() => {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  });

  function getToken(): string {
    return localStorage.getItem("admin-access-token") || "";
  }

  function getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const key = errorKeyMap[message];

    return key ? $_(key) : message;
  }

  function getRecoveryHint(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("API key")) {
      return $_("admin_direct_mm_recovery_api_keys");
    }
    if (message.includes("Strategy definition")) {
      return $_("admin_direct_mm_recovery_strategy");
    }

    return $_("admin_direct_mm_recovery_retry");
  }

  function getBadgeClass(state: string): string {
    if (state === "running" || state === "active") return "badge badge-success";
    if (state === "created" || state === "pending" || state === "linked") return "badge badge-warning";
    if (state === "failed") return "badge badge-error";
    return "badge";
  }

  function getStateLabel(state: string): string {
    const map: Record<string, string> = {
      active: "admin_direct_mm_state_running",
      running: "admin_direct_mm_state_running",
      created: "admin_direct_mm_state_created",
      stopped: "admin_direct_mm_state_stopped",
      failed: "admin_direct_mm_state_failed",
      pending: "admin_direct_mm_state_pending",
      linked: "admin_direct_mm_state_linked",
      detached: "admin_direct_mm_state_detached",
      joined: "admin_direct_mm_state_joined",
      gone: "admin_direct_mm_state_gone",
      stale: "admin_direct_mm_state_stale",
    };

    return $_(map[state] || "admin_direct_mm_state_unknown");
  }

  function formatTimestamp(value: string | null): string {
    if (!value) return $_("admin_direct_mm_na");

    return new Date(value).toLocaleString();
  }

  function secondsAgo(value: string | null): number {
    if (!value) return 0;

    return Math.max(0, Math.floor((nowMs - Date.parse(value)) / 1000));
  }

  function statusAgeLabel(value: string | null): string {
    return $_("admin_direct_mm_seconds_ago", { values: { seconds: secondsAgo(value) } });
  }

  function normalizeConfigOverrides(): Record<string, unknown> {
    return configRows.reduce<Record<string, unknown>>((accumulator, row) => {
      if (!row.key.trim()) return accumulator;

      accumulator[row.key.trim()] = row.value.trim();
      return accumulator;
    }, {});
  }

  async function refreshPage() {
    isRefreshing = true;
    await invalidate("admin:market-making:direct");
    isRefreshing = false;
  }

  async function handleStartOrder() {
    if (isStarting || startCooldown) return;
    const token = getToken();

    if (!token || !startExchangeName || !startPair || !startStrategyDefinitionId || !selectedApiKey) {
      toast.error($_("admin_direct_mm_error_missing_fields"), {
        description: $_("admin_direct_mm_recovery_required_fields"),
      });
      return;
    }

    isStarting = true;
    startCooldown = true;
    setTimeout(() => {
      startCooldown = false;
    }, 2000);

    try {
      const result = await startDirectOrder(
        {
          exchangeName: startExchangeName,
          pair: startPair,
          strategyDefinitionId: startStrategyDefinitionId,
          apiKeyId: selectedApiKey.key_id,
          accountLabel: selectedApiKey.exchange_index,
          configOverrides: normalizeConfigOverrides(),
        },
        token,
      );

      await refreshPage();
      showStartForm = false;
      configRows = [{ key: "", value: "" }];
      toast.success($_("admin_direct_mm_start_success", {
        values: { exchange: startExchangeName, pair: startPair },
      }), {
        description:
          result.warnings.length > 0
            ? result.warnings.join(" · ")
            : $_("admin_direct_mm_recovery_monitor_status"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStarting = false;
    }
  }

  async function confirmStopOrder() {
    if (!stopOrderCandidate || isStopping) return;
    const token = getToken();

    if (!token) return;

    isStopping = true;

    try {
      const stoppedOrderId = stopOrderCandidate.orderId;
      await stopDirectOrder(stoppedOrderId, token);
      await refreshPage();
      toast.success($_("admin_direct_mm_stop_success"), {
        description: $_("admin_direct_mm_recovery_refresh_status"),
      });
      stopOrderCandidate = null;
      if (statusDrawerOrder?.orderId === stoppedOrderId) {
        statusDrawerData = null;
      }
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStopping = false;
    }
  }

  async function openStatusDrawer(order: DirectOrderSummary) {
    statusDrawerOrder = order;
    statusLoading = true;
    await loadStatus(order.orderId);

    if (statusPollTimer) {
      clearInterval(statusPollTimer);
    }

    statusPollTimer = setInterval(() => {
      if (statusDrawerOrder) {
        void loadStatus(statusDrawerOrder.orderId);
      }
    }, 5000);
  }

  async function loadStatus(orderId: string) {
    const token = getToken();

    if (!token) return;

    try {
      statusDrawerData = await getDirectOrderStatus(orderId, token);
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      statusLoading = false;
    }
  }

  function closeStatusDrawer() {
    statusDrawerOrder = null;
    statusDrawerData = null;
    statusLoading = false;
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  async function submitCampaignJoin() {
    if (isJoiningCampaign) return;
    const token = getToken();

    if (!token || !joinCampaignApiKeyId || !joinCampaignAddress || !joinCampaignEvmAddress) {
      toast.error($_("admin_direct_mm_error_missing_fields"), {
        description: $_("admin_direct_mm_recovery_required_fields"),
      });
      return;
    }

    isJoiningCampaign = true;

    try {
      await joinAdminCampaign(
        {
          apiKeyId: joinCampaignApiKeyId,
          evmAddress: joinCampaignEvmAddress,
          campaignAddress: joinCampaignAddress,
          chainId: joinCampaignChainId,
        },
        token,
      );
      await refreshPage();
      showJoinModal = false;
      toast.success($_("admin_direct_mm_campaign_join_pending"), {
        description: $_("admin_direct_mm_recovery_monitor_status"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isJoiningCampaign = false;
    }
  }

  function openJoinModal(campaign: Record<string, unknown>) {
    joinCampaignAddress = String(campaign.address || "");
    joinCampaignChainId = Number(campaign.chainId || 0);
    showJoinModal = true;
  }
</script>

<div class="bg-base-200 min-h-screen">
  <div class="max-w-7xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-2xl font-semibold text-base-content">{$_("admin_direct_mm_title")}</span>
        <span class="text-sm text-base-content/60">{$_("admin_direct_mm_subtitle")}</span>
      </div>
      <button class="btn btn-ghost" on:click={() => window.history.back()} aria-label={$_("admin_direct_mm_back") }>
        <span>{$_("admin_direct_mm_back")}</span>
      </button>
    </div>

    <div class="flex items-center justify-between gap-3">
      <div class="tabs tabs-boxed">
        <button class:tab-active={activeTab === "direct"} class="tab" on:click={() => (activeTab = "direct") }>
          <span>{$_("admin_direct_mm_tab_direct")}</span>
        </button>
        <button class:tab-active={activeTab === "campaigns"} class="tab" on:click={() => (activeTab = "campaigns") }>
          <span>{$_("admin_direct_mm_tab_campaigns")}</span>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost" on:click={refreshPage}>
          <span>{isRefreshing ? $_("admin_direct_mm_refreshing") : $_("admin_direct_mm_refresh")}</span>
        </button>
        <button class="btn btn-primary" on:click={() => (showStartForm = !showStartForm)}>
          <span>{$_("admin_direct_mm_start_order")}</span>
        </button>
      </div>
    </div>

    {#if activeTab === "direct"}
      <div class="bg-base-100 rounded-box border border-base-300 p-4 space-y-4">
        {#if showStartForm}
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label class="form-control w-full">
              <span class="label-text text-base-content">{$_("admin_direct_mm_exchange")}</span>
              <select class="select select-bordered" bind:value={startExchangeName}>
                <option value="">{$_("admin_direct_mm_select_exchange")}</option>
                {#each exchangeOptions as exchangeName}
                  <option value={exchangeName}>{exchangeName}</option>
                {/each}
              </select>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-base-content">{$_("admin_direct_mm_pair")}</span>
              <select class="select select-bordered" bind:value={startPair}>
                <option value="">{$_("admin_direct_mm_select_pair")}</option>
                {#each filteredPairs as pair}
                  <option value={pair.symbol}>{pair.symbol}</option>
                {/each}
              </select>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-base-content">{$_("admin_direct_mm_strategy")}</span>
              <select class="select select-bordered" bind:value={startStrategyDefinitionId}>
                <option value="">{$_("admin_direct_mm_select_strategy")}</option>
                {#each strategies as strategy}
                  <option value={strategy.id}>{strategy.name}</option>
                {/each}
              </select>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-base-content">{$_("admin_direct_mm_api_key")}</span>
              <select class="select select-bordered" bind:value={startApiKeyId}>
                <option value="">{$_("admin_direct_mm_select_api_key")}</option>
                {#each filteredApiKeys as apiKey}
                  <option value={apiKey.key_id}>{apiKey.name} · {apiKey.exchange_index}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="overflow-x-auto border border-base-300 rounded-box">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th><span>{$_("admin_direct_mm_override_key")}</span></th>
                  <th><span>{$_("admin_direct_mm_override_value")}</span></th>
                </tr>
              </thead>
              <tbody>
                {#each configRows as row, index}
                  <tr>
                    <td>
                      <input class="input input-bordered w-full" bind:value={row.key} />
                    </td>
                    <td>
                      <input class="input input-bordered w-full" bind:value={row.value} />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex items-center justify-between gap-3">
            <button class="btn btn-ghost" on:click={() => (configRows = [...configRows, { key: "", value: "" }])}>
              <span>{$_("admin_direct_mm_add_row")}</span>
            </button>
            <button class="btn btn-primary" disabled={isStarting || startCooldown} on:click={handleStartOrder}>
              <span>{isStarting ? $_("admin_direct_mm_starting") : $_("admin_direct_mm_start")}</span>
            </button>
          </div>
        {/if}

        <div class="overflow-x-auto">
          <table class="table table-striped min-w-[900px]">
            <thead>
              <tr>
                <th><span>{$_("admin_direct_mm_exchange")}</span></th>
                <th><span>{$_("admin_direct_mm_pair")}</span></th>
                <th><span>{$_("admin_direct_mm_strategy")}</span></th>
                <th><span>{$_("admin_direct_mm_status")}</span></th>
                <th><span>{$_("admin_direct_mm_created_time")}</span></th>
                <th><span>{$_("admin_direct_mm_last_tick")}</span></th>
                <th><span>{$_("admin_direct_mm_actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {#if orders.length === 0}
                <tr>
                  <td colspan="7" class="text-center py-10">
                    <div class="flex flex-col gap-2">
                      <span class="text-base-content">{$_("admin_direct_mm_empty_title")}</span>
                      <span class="text-base-content/60">{$_("admin_direct_mm_empty_body")}</span>
                    </div>
                  </td>
                </tr>
              {/if}

              {#each orders as order}
                <tr class="cursor-pointer hover:bg-base-200" on:click={() => openStatusDrawer(order)}>
                  <td>
                    <div class="flex items-center gap-3">
                      <ExchangeIcon exchangeName={order.exchangeName} clazz="w-8 h-8 rounded-full" />
                      <div class="flex flex-col gap-1">
                        <span>{order.exchangeName}</span>
                        <span class="text-xs text-base-content/60">{order.accountLabel}</span>
                      </div>
                    </div>
                  </td>
                  <td><span>{order.pair}</span></td>
                  <td><span>{order.strategyName}</span></td>
                  <td><span class={getBadgeClass(order.state)}>{getStateLabel(order.runtimeState)}</span></td>
                  <td><span>{formatTimestamp(order.createdAt)}</span></td>
                  <td><span>{formatTimestamp(order.lastTickAt)}</span></td>
                  <td>
                    <button
                      class="btn btn-error btn-sm"
                      aria-label={$_("admin_direct_mm_stop")}
                      disabled={order.state === "stopped"}
                      on:click|stopPropagation={() => (stopOrderCandidate = order)}
                    >
                      <span>{$_("admin_direct_mm_stop")}</span>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    {#if activeTab === "campaigns"}
      <details open class="collapse collapse-arrow bg-base-100 border border-base-300">
        <summary class="collapse-title text-lg font-semibold text-base-content">{$_("admin_direct_mm_campaign_panel")}</summary>
        <div class="collapse-content grid gap-4 lg:grid-cols-2">
        <div class="space-y-3">
          <span class="text-sm text-base-content/60">{$_("admin_direct_mm_available_campaigns")}</span>
          {#if campaigns.length === 0}
            <span class="text-base-content/60">{$_("admin_direct_mm_campaigns_empty")}</span>
          {/if}
          {#each campaigns as campaign}
            <div class="border border-base-300 rounded-box p-3 flex items-center justify-between gap-3">
              <div class="flex flex-col gap-1 min-w-0">
                <span class="truncate">{String(campaign.symbol || campaign.address || "")}</span>
                <span class="text-xs text-base-content/60 truncate">{String(campaign.exchangeName || "")}</span>
              </div>
              <button class="btn btn-primary btn-sm" on:click={() => openJoinModal(campaign)}>
                <span>{$_("admin_direct_mm_join")}</span>
              </button>
            </div>
          {/each}
        </div>

        <div class="space-y-3">
          <span class="text-sm text-base-content/60">{$_("admin_direct_mm_joined_campaigns")}</span>
          <div class="overflow-x-auto">
            <table class="table table-striped min-w-[520px]">
              <thead>
                <tr>
                  <th><span>{$_("admin_direct_mm_campaign")}</span></th>
                  <th><span>{$_("admin_direct_mm_api_key")}</span></th>
                  <th><span>{$_("admin_direct_mm_status")}</span></th>
                </tr>
              </thead>
              <tbody>
                {#if campaignJoins.length === 0}
                  <tr>
                    <td colspan="3" class="text-center">
                      <span class="text-base-content/60">{$_("admin_direct_mm_campaign_joins_empty")}</span>
                    </td>
                  </tr>
                {/if}
                {#each campaignJoins as join}
                  <tr>
                    <td><span>{join.campaignAddress}</span></td>
                    <td><span>{campaignJoinApiKeyLabels.get(join.apiKeyId) || join.apiKeyId}</span></td>
                    <td><span class={getBadgeClass(join.status)}>{getStateLabel(join.status)}</span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </details>
    {/if}
  </div>
</div>

{#if stopOrderCandidate}
  <div class="modal modal-open">
    <div class="modal-box">
      <div class="flex flex-col gap-3">
        <span class="text-lg font-semibold text-base-content">{$_("admin_direct_mm_stop_confirm_title")}</span>
        <span class="text-base-content/70">{$_("admin_direct_mm_stop_confirm_body", { values: { pair: stopOrderCandidate.pair } })}</span>
        <div class="modal-action">
          <button class="btn btn-ghost" on:click={() => (stopOrderCandidate = null)}>
            <span>{$_("admin_direct_mm_cancel")}</span>
          </button>
          <button class="btn btn-error" disabled={isStopping} on:click={confirmStopOrder}>
            <span>{isStopping ? $_("admin_direct_mm_stopping") : $_("admin_direct_mm_stop")}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showJoinModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <div class="flex flex-col gap-3">
        <span class="text-lg font-semibold text-base-content">{$_("admin_direct_mm_join_campaign_title")}</span>
        <label class="form-control w-full">
          <span class="label-text text-base-content">{$_("admin_direct_mm_evm_address")}</span>
          <input class="input input-bordered" bind:value={joinCampaignEvmAddress} />
        </label>
        <label class="form-control w-full">
          <span class="label-text text-base-content">{$_("admin_direct_mm_api_key")}</span>
          <select class="select select-bordered" bind:value={joinCampaignApiKeyId}>
            <option value="">{$_("admin_direct_mm_select_api_key")}</option>
            {#each apiKeys as apiKey}
              <option value={apiKey.key_id}>{apiKey.name} · {apiKey.exchange} · {apiKey.exchange_index}</option>
            {/each}
          </select>
        </label>
        <div class="modal-action">
          <button class="btn btn-ghost" on:click={() => (showJoinModal = false)}>
            <span>{$_("admin_direct_mm_cancel")}</span>
          </button>
          <button class="btn btn-primary" disabled={isJoiningCampaign} on:click={submitCampaignJoin}>
            <span>{isJoiningCampaign ? $_("admin_direct_mm_joining") : $_("admin_direct_mm_join")}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if statusDrawerOrder}
  <div class="fixed inset-y-0 right-0 w-full md:w-96 bg-base-100 border-l border-base-300 shadow-2xl z-40 overflow-y-auto">
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold text-base-content">{statusDrawerOrder.pair}</span>
          <span class="text-sm text-base-content/60">{statusDrawerOrder.exchangeName}</span>
        </div>
        <button class="btn btn-ghost" on:click={closeStatusDrawer} aria-label={$_("admin_direct_mm_close") }>
          <span>{$_("admin_direct_mm_close")}</span>
        </button>
      </div>

      {#if statusLoading && !statusDrawerData}
        <span class="text-base-content/60">{$_("admin_direct_mm_updating")}</span>
      {:else if statusDrawerData}
        <div class="flex items-center justify-between gap-3">
          <span class={getBadgeClass(statusDrawerData.runtimeState)}>{getStateLabel(statusDrawerData.runtimeState)}</span>
          <span class="text-sm text-base-content/60">{$_("admin_direct_mm_last_updated", { values: { age: statusAgeLabel(statusDrawerData.lastUpdatedAt) } })}</span>
        </div>

        {#if secondsAgo(statusDrawerData.lastUpdatedAt) > 15}
          <div class="badge badge-warning">{$_("admin_direct_mm_status_stale")}</div>
        {/if}

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content">{$_("admin_direct_mm_spread")}</span>
          <div class="grid grid-cols-3 gap-2 text-sm">
            <span>{$_("admin_direct_mm_bid")}: {statusDrawerData.spread?.bid || $_("admin_direct_mm_na")}</span>
            <span>{$_("admin_direct_mm_ask")}: {statusDrawerData.spread?.ask || $_("admin_direct_mm_na")}</span>
            <span>{$_("admin_direct_mm_absolute")}: {statusDrawerData.spread?.absolute || $_("admin_direct_mm_na")}</span>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content">{$_("admin_direct_mm_inventory_balances")}</span>
          {#each statusDrawerData.inventoryBalances as balance}
            <div class="border border-base-300 rounded-box p-2 text-sm">
              <span>{balance.asset}</span>
              <span class="block text-base-content/60">{$_("admin_direct_mm_free")}: {balance.free}</span>
              <span class="block text-base-content/60">{$_("admin_direct_mm_used")}: {balance.used}</span>
              <span class="block text-base-content/60">{$_("admin_direct_mm_total")}: {balance.total}</span>
            </div>
          {/each}
        </div>

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content">{$_("admin_direct_mm_open_orders")}</span>
          {#if statusDrawerData.openOrders.length === 0}
            <span class="text-sm text-base-content/60">{$_("admin_direct_mm_no_open_orders")}</span>
          {/if}
          {#each statusDrawerData.openOrders as openOrder}
            <div class="border border-base-300 rounded-box p-2 text-sm">
              <span>{openOrder.side} · {openOrder.price} · {openOrder.qty}</span>
              <span class="block text-base-content/60">{openOrder.exchangeOrderId}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
