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
  let orderAmount = "";
  let orderSpread = "";
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
    const accumulator = configRows.reduce<Record<string, unknown>>((acc, row) => {
      if (!row.key.trim()) return acc;
      acc[row.key.trim()] = row.value.trim();
      return acc;
    }, {});
    if (orderAmount) accumulator["amount"] = orderAmount;
    if (orderSpread) accumulator["spread"] = orderSpread;
    return accumulator;
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
      orderAmount = "";
      orderSpread = "";
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

<div class="bg-[#F8F8FA] min-h-screen pb-10">
  <div class="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
    
    <!-- Top Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- Exchange API Keys -->
      <div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-[1.1rem] font-bold text-base-content">Exchange API Keys</h2>
          <div class="text-[#4F39F6] cursor-pointer bg-transparent hover:bg-[#F1F0FF] p-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/><path d="m15 18-6-6 6-6"/></svg>
          </div>
        </div>

        <div class="flex flex-col gap-3 flex-grow mt-2">
          {#each apiKeys as apiKey, i}
            {#if i < 3}
              <div class="flex items-center justify-between p-4 rounded-xl bg-[#FCFCFD] border border-[#F1F1F5]">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center border border-gray-100">
                    <ExchangeIcon exchangeName={apiKey.exchange} clazz="w-5 h-5" />
                  </div>
                  <div class="flex flex-col">
                    <span class="font-bold text-sm text-base-content">{apiKey.exchange} {apiKey.name}</span>
                    <span class="text-xs text-base-content/50">
                      {#if i === 0}
                        Trading Active • 4 Pairs
                      {:else if i === 1}
                        Last sync 2m ago
                      {:else}
                        Key expired
                      {/if}
                    </span>
                  </div>
                </div>
                <div>
                  {#if i === 2}
                    <div class="bg-[#FFEFEF] text-[#D83232] text-[10px] font-bold px-3 py-1 rounded border border-[#FFDADA] tracking-wide uppercase">Disconnected</div>
                  {:else}
                    <div class="bg-[#E5F9E3] text-[#1CAD48] text-[10px] font-bold px-3 py-1 rounded border border-[#CFF0CF] tracking-wide uppercase">Connected</div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
          {#if apiKeys.length === 0}
             <div class="text-center text-sm text-base-content/50 my-auto">No API keys found</div>
          {/if}
        </div>

        <button class="w-full mt-4 py-3 rounded-xl bg-[#F4F2FF] text-[#4F39F6] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#EAE7FF] transition-colors border-none" on:click={() => window.open('/manage/api-keys', '_blank')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Manage API Connections
        </button>
      </div>

      <!-- Available Campaigns -->
      <div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full">
        <div class="mb-4">
          <h2 class="text-[1.1rem] font-bold text-base-content">Available Campaigns</h2>
          <p class="text-[13px] text-base-content/50 mt-1">Boost liquidity and earn additional rewards.</p>
        </div>

        <div class="flex flex-col gap-4 mt-2 h-full">
          {#each campaigns.slice(0,2) as campaign, i}
            <div class="bg-[#F6F5FC] rounded-xl p-5 flex flex-col justify-between">
              <div class="flex justify-between items-start w-full">
                <div class="flex flex-col gap-1 w-full">
                  <span class="text-[#4F39F6] font-bold text-[15px]">{String(campaign.symbol || campaign.name || (i===0 ? "SOL-USDT Volatility Shield" : "ETH-BTC Arbitrage Engine"))}</span>
                  <span class="text-xs text-base-content/50">Reward Pool: {String(campaign.rewardPool || (i===0 ? "50,000 USDT" : "12.5 BTC"))}</span>
                </div>
                <div class="flex flex-col items-end whitespace-nowrap">
                  <span class="font-bold text-[15px] text-base-content">{String(campaign.apr || (i===0 ? "18.5% APR" : "12.2% APR"))}</span>
                  <span class="text-[10px] font-bold text-base-content/40 tracking-wider">EST. YIELD</span>
                </div>
              </div>
              
              <div class="flex items-center justify-between gap-4 w-full mt-5">
                <button class="bg-[#4F39F6] hover:bg-[#432EEB] text-white text-sm font-semibold py-2.5 px-4 rounded-lg flex-grow transition-colors shadow-sm" on:click={() => openJoinModal(campaign)}>
                  Join Campaign
                </button>
                <div class="w-[80px] flex justify-center">
                  <button class="text-[#4F39F6] text-sm font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">Details</button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

    </div>

    <!-- Market Making -->
    <div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50">
      <div class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6">
        <div>
          <h2 class="text-[1.1rem] font-bold text-base-content">Market Making</h2>
          <p class="text-[13px] text-base-content/50 mt-1">Strategic execution and real-time liquidity management.</p>
        </div>
        
        <div class="flex flex-wrap items-center gap-3">
          <button class="btn bg-[#503CF5] hover:bg-[#432EEB] text-white border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm" on:click={() => (showStartForm = !showStartForm)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            Create New Order
          </button>
          <button class="btn bg-[#F0EEF7] hover:bg-[#E5E2F0] text-base-content border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm text-opacity-90">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="mr-1"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start All
          </button>
          <button class="btn bg-[#FDEDEE] hover:bg-[#FADDE0] text-[#D83232] border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="mr-1.5"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
            Stop All
          </button>
        </div>
      </div>



      <div class="overflow-x-auto w-full">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr>
              <th class="py-4 px-4 text-xs font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Exchange</th>
              <th class="py-4 px-4 text-xs font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Trading Pair</th>
              <th class="py-4 px-2 text-xs font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Strategy</th>
              <th class="py-4 px-2 text-xs font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Status</th>
              <th class="py-4 px-2 text-xs font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Created Time</th>
              <th class="py-4 px-4 text-xs text-right font-bold text-base-content/50 uppercase tracking-widest border-b border-gray-100">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#if orders.length === 0}
               <tr>
                 <td colspan="6" class="text-center py-10 text-base-content/50">No orders active</td>
               </tr>
            {/if}
            {#each orders as order, i}
              <tr class="hover:bg-base-200/30 transition-colors border-b border-gray-50 last:border-0 cursor-pointer" on:click={() => openStatusDrawer(order)}>
                <td class="py-4 px-4">
                  <div class="flex items-center gap-3">
                    <div class="bg-[#F8F9FE] w-8 h-8 rounded-full flex items-center justify-center border border-[#EDEEF4]">
                      <ExchangeIcon exchangeName={order.exchangeName} clazz="w-4 h-4" />
                    </div>
                    <span class="font-bold text-sm text-base-content">{order.exchangeName}</span>
                  </div>
                </td>
                <td class="py-4 px-4">
                  <span class="font-bold text-[14px] text-base-content whitespace-nowrap">{order.pair.replace('-', ' / ').replace('_', ' / ')}</span>
                </td>
                <td class="py-4 px-2">
                  <span class="inline-flex bg-[#F5F4FF] text-[#4F39F6] px-2.5 py-1 rounded-[6px] text-xs font-semibold whitespace-nowrap">
                    {order.strategyName || (i===0 ? "Cross-Exchange" : (i===1 ? "Market Maker" : "Pure MM"))}
                  </span>
                </td>
                <td class="py-4 px-2 whitespace-nowrap">
                  {#if order.runtimeState === 'running' || order.runtimeState === 'active'}
                    <span class="inline-flex items-center gap-1.5 bg-[#EAF8EE] text-[#1CAD48] px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase">
                      <span class="w-1.5 h-1.5 bg-[#1CAD48] rounded-full"></span>
                      Running
                    </span>
                  {:else if order.runtimeState === 'stopped'}
                    <span class="inline-flex items-center gap-1.5 bg-[#F1F0F5] text-[#6E6A7D] px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase">
                      Paused
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1.5 bg-[#EAF8EE] text-[#1CAD48] px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase">
                      <span class="w-1.5 h-1.5 bg-[#1CAD48] rounded-full"></span>
                      Running
                    </span>
                  {/if}
                </td>
                <td class="py-4 px-2">
                  <span class="text-[13px] text-base-content/60 whitespace-nowrap text-opacity-80">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " • " + new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : (i===0 ? "Oct 24, 2023 • 14:20" : (i===1 ? "Oct 22, 2023 • 09:15" : "Oct 20, 2023 • 18:45"))}
                  </span>
                </td>
                <td class="py-4 px-4 flex justify-end items-center gap-3">
                  {#if order.runtimeState === 'running' || order.runtimeState === 'active'}
                    <button class="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#D83232] hover:bg-[#FDEFEF] transition-colors" aria-label="Stop" on:click|stopPropagation={() => (stopOrderCandidate = order)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="5" y="5" rx="2" fill="currentColor"/></svg>
                    </button>
                  {:else}
                    <button class="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#4F39F6] hover:bg-[#F3F2FF] transition-colors" aria-label="Play">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    </button>
                  {/if}
                  <button class="bg-[#F5F4FF] text-[#4F39F6] px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#EAE7FF] transition-colors whitespace-nowrap">
                    Details
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

{#if showStartForm}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div class="modal-box bg-base-100 p-8 rounded-2xl max-w-[480px] shadow-2xl border border-base-200/50">
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-bold text-[22px] text-base-content tracking-tight">Create New Order</h3>
        <button class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200" on:click={() => (showStartForm = false)}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="flex flex-col gap-5">
        <!-- Exchange -->
        <div class="form-control w-full">
          <label class="label pb-2 pt-0"><span class="label-text font-semibold text-base-content">Exchange</span></label>
          <select class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={startExchangeName}>
            <option value="" disabled selected>Select Exchange</option>
            {#each exchangeOptions as exchangeName}
              <option value={exchangeName}>{exchangeName}</option>
            {/each}
          </select>
        </div>

        <!-- Trading Pair -->
        <div class="form-control w-full">
          <label class="label pb-2 pt-0"><span class="label-text font-semibold text-base-content">Trading Pair</span></label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-base-content/50"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <select class="select select-bordered w-full pl-10 h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={startPair}>
              <option value="" disabled selected>Select Trading Pair</option>
              {#each filteredPairs as pair}
                <option value={pair.symbol}>{pair.symbol}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Strategy -->
        <div class="form-control w-full">
          <label class="label pb-2 pt-0"><span class="label-text font-semibold text-base-content">Strategy</span></label>
          <select class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={startStrategyDefinitionId}>
            <option value="" disabled selected>Select Strategy</option>
            {#each strategies as strategy}
              <option value={strategy.id}>{strategy.name}</option>
            {/each}
          </select>
        </div>

        <!-- API Key -->
        <div class="form-control w-full">
          <label class="label pb-2 pt-0"><span class="label-text font-semibold text-base-content">API Key</span></label>
          <select class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={startApiKeyId}>
            <option value="" disabled selected>Select API Key</option>
            {#each filteredApiKeys as apiKey}
              <option value={apiKey.key_id}>{apiKey.name}</option>
            {/each}
          </select>
        </div>

        <!-- Order Parameters (Amount & Spread %) -->
        <div class="form-control w-full mt-1">
          <label class="label pb-3 pt-0"><span class="label-text font-semibold text-base-content">Order Parameters</span></label>
          <div class="flex gap-4">
            <div class="flex-1">
              <span class="text-sm text-base-content/80 mb-2 block font-medium">Amount</span>
              <input type="text" placeholder="Amount" class="input input-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={orderAmount} />
            </div>
            <div class="flex-1">
              <span class="text-sm text-base-content/80 mb-2 block font-medium">Spread %</span>
              <input type="text" placeholder="Spread %" class="input input-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-[#4F39F6] focus:ring-1 focus:ring-[#4F39F6] shadow-sm" bind:value={orderSpread} />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 justify-end mt-4">
          <button class="btn bg-[#F0EEF7] hover:bg-[#E5E2F0] border-none text-base-content px-6 h-[44px] min-h-[44px] rounded-lg font-semibold shadow-sm" on:click={() => (showStartForm = false)}>Cancel</button>
          <button class="btn bg-[#503CF5] hover:bg-[#432EEB] border-none text-white px-6 h-[44px] min-h-[44px] rounded-lg font-semibold shadow-sm" on:click={handleStartOrder} disabled={isStarting}>
            {isStarting ? 'Launching...' : 'Launch Order'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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
