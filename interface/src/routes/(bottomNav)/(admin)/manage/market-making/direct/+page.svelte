<script lang="ts">
  import BigNumber from "bignumber.js";
  import { onDestroy, onMount } from "svelte";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/stores";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";

  import {
    getDirectOrderStatus,
    joinAdminCampaign,
    resumeDirectOrder,
    startDirectOrder,
    stopDirectOrder,
  } from "$lib/helpers/mrm/admin/direct-market-making";
  import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";
  import type {
    AdminCampaign,
    DirectOrderStatus,
    DirectOrderSummary,
    DirectWalletStatus,
  } from "$lib/types/hufi/admin-direct-market-making";
  import type { GrowInfo } from "$lib/types/hufi/grow";

  import {
    getErrorMessage,
    getRecoveryHint,
    normalizeConfigOverrides,
  } from "$lib/components/market-making/direct/helpers";
  import ApiKeysPanel from "$lib/components/market-making/direct/ApiKeysPanel.svelte";
  import CampaignsPanel from "$lib/components/market-making/direct/CampaignsPanel.svelte";
  import EvmWalletStatusBar from "$lib/components/market-making/direct/EvmWalletStatusBar.svelte";
  import OrdersTable from "$lib/components/market-making/direct/OrdersTable.svelte";
  import CreateOrderModal from "$lib/components/market-making/direct/CreateOrderModal.svelte";
  import StartAllModal from "$lib/components/market-making/direct/StartAllModal.svelte";
  import StopAllModal from "$lib/components/market-making/direct/StopAllModal.svelte";
  import StopOrderModal from "$lib/components/market-making/direct/StopOrderModal.svelte";
  import ResumeOrderModal from "$lib/components/market-making/direct/ResumeOrderModal.svelte";
  import AllCampaignsModal from "$lib/components/market-making/direct/AllCampaignsModal.svelte";
  import JoinCampaignModal from "$lib/components/market-making/direct/JoinCampaignModal.svelte";
  import OrderDetailsDialog from "$lib/components/market-making/direct/OrderDetailsDialog.svelte";

  type OverrideRow = { key: string; value: string };

  const ORDER_DETAILS_REFRESH_INTERVAL_MS = 5000;

  let growInfo: GrowInfo | null = null;
  let strategies: MarketMakingStrategy[] = [];
  let apiKeys: AdminSingleKey[] = [];
  let initialOrders: DirectOrderSummary[] = [];
  let initialCampaigns: AdminCampaign[] = [];
  let walletStatus: DirectWalletStatus = { configured: false, address: null };
  let pageLoading = true;

  $: pairs = growInfo?.market_making?.pairs || [];

  async function resolvePageData() {
    pageLoading = true;
    try {
      const data = $page.data;
      const [gInfo, strats, keys, orders, camps, wallet] = await Promise.all([
        data.growInfo,
        data.strategies,
        data.apiKeys,
        data.directOrders,
        data.campaigns,
        data.walletStatus,
      ]);
      growInfo = gInfo || null;
      strategies = strats || [];
      apiKeys = keys || [];
      initialOrders = orders || [];
      initialCampaigns = camps || [];
      walletStatus = wallet || { configured: false, address: null };
    } finally {
      pageLoading = false;
    }
  }

  onMount(() => {
    resolvePageData();
  });

  $: if ($page.data) resolvePageData();

  let orders = initialOrders;
  let campaigns = initialCampaigns;

  let showStartForm = false;
  let showStartAllModal = false;
  let isStartingAll = false;
  let isStarting = false;
  let isRefreshing = false;
  let startCooldown = false;
  let startExchangeName = "";
  let startPair = "";
  let startStrategyDefinitionId = "";
  let startApiKeyId = "";
  let startMakerApiKeyId = "";
  let startTakerApiKeyId = "";
  let orderAmount = "";
  let orderSpread = "";
  let configRows: OverrideRow[] = [{ key: "", value: "" }];

  let showStopAllConfirm = false;
  let isStoppingAll = false;

  let stopOrderCandidate: DirectOrderSummary | null = null;
  let isStopping = false;

  let resumeOrderCandidate: DirectOrderSummary | null = null;
  let isResuming = false;

  let showOrderDetails = false;
  let detailsOrder: DirectOrderSummary | null = null;
  let detailsData: DirectOrderStatus | null = null;
  let detailsLoading = false;
  let detailsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let detailsRefreshing = false;
  let detailsRefreshingOrderId: string | null = null;
  let detailsPollingOrderId: string | null = null;
  let pendingOrderDetailsRefresh: {
    orderId: string;
    options: { silent?: boolean };
  } | null = null;

  let showAllCampaigns = false;
  let showJoinModal = false;
  let isJoiningCampaign = false;
  let joinCampaignAddress = "";
  let joinCampaignChainId = 0;
  let joinCampaignApiKeyId = "";
  let joinCampaignEvmAddress = "";
  let selectedCampaign: AdminCampaign | null = null;

  $: orders = initialOrders;
  $: campaigns = initialCampaigns;
  $: activeOrdersCount = orders.filter(
    (o) => o.runtimeState === "running" || o.runtimeState === "active",
  ).length;
  $: stoppedOrdersCount = orders.filter(
    (o) => o.runtimeState === "stopped",
  ).length;
  $: exchangeOptions = Array.from(new Set(apiKeys.map((key) => key.exchange)));
  $: filteredPairs = pairs.filter(
    (pair) => !startExchangeName || pair.exchange_id === startExchangeName,
  );
  $: selectedPairConfig =
    pairs.find(
      (pair) =>
        pair.exchange_id === startExchangeName && pair.symbol === startPair,
    ) || null;
  $: minOrderAmount = selectedPairConfig?.min_order_amount || "";
  $: selectedStrategy =
    strategies.find((strategy) => strategy.id === startStrategyDefinitionId) || null;
  $: selectedControllerType = selectedStrategy?.controllerType || "";
  $: isDualAccountStrategy = selectedControllerType === "dualAccountVolume";
  $: filteredApiKeys = apiKeys.filter(
    (key) =>
      key.permissions === "read-trade" &&
      (!startExchangeName || key.exchange === startExchangeName),
  );
  $: selectedApiKey =
    filteredApiKeys.find((key) => key.key_id === startApiKeyId) || null;
  $: selectedMakerApiKey =
    filteredApiKeys.find((key) => key.key_id === startMakerApiKeyId) || null;
  $: selectedTakerApiKey =
    filteredApiKeys.find((key) => key.key_id === startTakerApiKeyId) || null;
  $: walletStatusAddress = walletStatus.address || "";
  $: hasWalletConfigured = walletStatus.configured;
  $: walletStatusHint = hasWalletConfigured
    ? $_("admin_direct_mm_wallet_status_loaded_hint")
    : $_("admin_direct_mm_wallet_status_missing_hint");
  $: {
    const orderId = showOrderDetails ? detailsOrder?.orderId || null : null;

    if (orderId) {
      startOrderDetailsPolling(orderId);
    } else {
      stopOrderDetailsPolling();
    }
  }

  function getToken(): string {
    return localStorage.getItem("admin-access-token") || "";
  }

  async function refreshPage() {
    isRefreshing = true;
    await invalidate("admin:market-making:direct");
    isRefreshing = false;
  }

  function resetStartForm() {
    showStartForm = false;
    startExchangeName = "";
    startPair = "";
    startStrategyDefinitionId = "";
    startApiKeyId = "";
    startMakerApiKeyId = "";
    startTakerApiKeyId = "";
    configRows = [{ key: "", value: "" }];
    orderAmount = "";
    orderSpread = "";
  }

  async function handleStartOrder() {
    if (isStarting || startCooldown) return;
    const token = getToken();
    const missingSingleAccount = !isDualAccountStrategy && !selectedApiKey;
    const missingDualAccount =
      isDualAccountStrategy && (!selectedMakerApiKey || !selectedTakerApiKey);

    if (
      !token ||
      !startExchangeName ||
      !startPair ||
      !startStrategyDefinitionId ||
      missingSingleAccount ||
      missingDualAccount
    ) {
      toast.error($_("admin_direct_mm_error_missing_fields"), {
        description: $_("admin_direct_mm_recovery_required_fields"),
      });
      return;
    }

    if (
      isDualAccountStrategy &&
      selectedMakerApiKey &&
      selectedTakerApiKey &&
      selectedMakerApiKey.exchange_index === selectedTakerApiKey.exchange_index
    ) {
      toast.error($_("admin_direct_mm_error_distinct_accounts"), {
        description: $_("admin_direct_mm_recovery_distinct_accounts"),
      });
      return;
    }

    if (
      orderAmount &&
      minOrderAmount &&
      new BigNumber(orderAmount).isFinite() &&
      new BigNumber(orderAmount).isLessThan(minOrderAmount)
    ) {
      toast.error($_("admin_direct_mm_error_order_amount_too_low"), {
        description: $_("admin_direct_mm_order_amount_minimum_hint", {
          values: { amount: minOrderAmount },
        }),
      });
      return;
    }

    isStarting = true;
    startCooldown = true;
    setTimeout(() => {
      startCooldown = false;
    }, 2000);

    try {
      const configOverrides = normalizeConfigOverrides(
        selectedControllerType,
        configRows,
        orderAmount,
        orderSpread,
      );
      const payload = isDualAccountStrategy
        ? {
            exchangeName: startExchangeName,
            pair: startPair,
            strategyDefinitionId: startStrategyDefinitionId,
            makerApiKeyId: selectedMakerApiKey!.key_id,
            takerApiKeyId: selectedTakerApiKey!.key_id,
            makerAccountLabel: selectedMakerApiKey!.exchange_index,
            takerAccountLabel: selectedTakerApiKey!.exchange_index,
            configOverrides,
          }
        : {
            exchangeName: startExchangeName,
            pair: startPair,
            strategyDefinitionId: startStrategyDefinitionId,
            apiKeyId: selectedApiKey!.key_id,
            accountLabel: selectedApiKey!.exchange_index,
            configOverrides,
          };
      const result = await startDirectOrder(payload, token);
      const successExchange = startExchangeName;
      const successPair = startPair;

      await refreshPage();
      resetStartForm();
      toast.success(
        $_("admin_direct_mm_start_success", {
          values: { exchange: successExchange, pair: successPair },
        }),
        {
          description:
            result.warnings.length > 0
              ? result.warnings.join(" · ")
              : $_("admin_direct_mm_recovery_monitor_status"),
        },
      );
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStarting = false;
    }
  }

  async function handleStopAll() {
    if (isStoppingAll) return;
    const token = getToken();

    if (!token) return;

    isStoppingAll = true;

    try {
      const activeOrders = orders.filter(
        (o) => o.runtimeState === "running" || o.runtimeState === "active",
      );
      const activeIds = new Set(activeOrders.map((o) => o.orderId));
      await Promise.all(
        activeOrders.map((o) => stopDirectOrder(o.orderId, token)),
      );
      orders = orders.map((o) =>
        activeIds.has(o.orderId)
          ? { ...o, runtimeState: "stopped" as const }
          : o,
      );
      toast.success($_("admin_direct_mm_stop_all_success"), {
        description: $_("admin_direct_mm_recovery_refresh_status"),
      });
      showStopAllConfirm = false;
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStoppingAll = false;
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
      orders = orders.map((o) =>
        o.orderId === stoppedOrderId
          ? { ...o, runtimeState: "stopped" as const }
          : o,
      );
      toast.success($_("admin_direct_mm_stop_success"), {
        description: $_("admin_direct_mm_recovery_refresh_status"),
      });
      stopOrderCandidate = null;
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStopping = false;
    }
  }

  function handleResumeOrder(order: DirectOrderSummary) {
    resumeOrderCandidate = order;
  }

  async function confirmResumeOrder() {
    if (!resumeOrderCandidate || isResuming) return;
    const token = getToken();

    if (!token) return;

    isResuming = true;
    const order = resumeOrderCandidate;

    try {
      const result = await resumeDirectOrder(order.orderId, token);
      orders = orders.map((o) =>
        o.orderId === order.orderId
          ? { ...o, runtimeState: "running" as const }
          : o,
      );
      toast.success(
        $_("admin_direct_mm_start_success", {
          values: { exchange: order.exchangeName, pair: order.pair },
        }),
        {
          description:
            result.warnings.length > 0
              ? result.warnings.join(" · ")
              : $_("admin_direct_mm_recovery_monitor_status"),
        },
      );
      resumeOrderCandidate = null;

      if (showOrderDetails && detailsOrder?.orderId === order.orderId) {
        closeOrderDetails();
      }
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isResuming = false;
    }
  }

  async function openOrderDetails(order: DirectOrderSummary) {
    detailsOrder = order;
    showOrderDetails = true;
    await loadOrderDetails(order.orderId);
  }

  function stopOrderDetailsPolling() {
    if (detailsRefreshTimer) {
      clearInterval(detailsRefreshTimer);
      detailsRefreshTimer = null;
    }

    detailsPollingOrderId = null;
  }

  function startOrderDetailsPolling(orderId: string) {
    if (detailsRefreshTimer && detailsPollingOrderId === orderId) {
      return;
    }

    stopOrderDetailsPolling();
    detailsPollingOrderId = orderId;
    detailsRefreshTimer = setInterval(async () => {
      if (!showOrderDetails || detailsOrder?.orderId !== orderId) {
        return;
      }

      await loadOrderDetails(orderId, { silent: true });
    }, ORDER_DETAILS_REFRESH_INTERVAL_MS);
  }

  async function loadOrderDetails(
    orderId: string,
    options: { silent?: boolean } = {},
  ) {
    if (detailsRefreshing) {
      if (detailsRefreshingOrderId !== orderId) {
        pendingOrderDetailsRefresh = { orderId, options };
      }

      return;
    }

    detailsRefreshing = true;
    detailsRefreshingOrderId = orderId;

    if (!options.silent) {
      detailsLoading = true;
    }

    try {
      const token = getToken();
      if (!token) {
        return;
      }

      const nextDetails = await getDirectOrderStatus(orderId, token);

      if (detailsOrder?.orderId === orderId) {
        detailsData = nextDetails;
      }
    } catch {
      if (detailsOrder?.orderId === orderId) {
        detailsData = null;
      }
    } finally {
      detailsRefreshing = false;
      detailsRefreshingOrderId = null;
      detailsLoading = false;

      const nextRefresh = pendingOrderDetailsRefresh;
      pendingOrderDetailsRefresh = null;

      if (
        nextRefresh &&
        showOrderDetails &&
        detailsOrder?.orderId === nextRefresh.orderId
      ) {
        void loadOrderDetails(nextRefresh.orderId, nextRefresh.options);
      }
    }
  }

  function closeOrderDetails() {
    stopOrderDetailsPolling();
    showOrderDetails = false;
    detailsOrder = null;
    detailsData = null;
    detailsLoading = false;
  }

  onDestroy(() => {
    stopOrderDetailsPolling();
  });

  async function submitCampaignJoin() {
    if (isJoiningCampaign) return;
    const token = getToken();

    if (
      !token ||
      !joinCampaignApiKeyId ||
      !joinCampaignAddress ||
      !joinCampaignEvmAddress
    ) {
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
      toast.success($_("admin_direct_mm_campaign_join_success"), {
        description: $_("admin_direct_mm_joined_campaigns"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isJoiningCampaign = false;
    }
  }

  function openJoinFromAll(campaign: AdminCampaign) {
    showAllCampaigns = false;
    openJoinModal(campaign);
  }

  function openJoinModal(campaign: AdminCampaign) {
    selectedCampaign = campaign;
    joinCampaignAddress = String(campaign.address || "");
    joinCampaignChainId = Number(campaign.chain_id || campaign.chainId || 137);
    joinCampaignEvmAddress = walletStatusAddress;
    joinCampaignApiKeyId = "";
    showJoinModal = true;
  }

  async function handleStartAll() {
    if (isStartingAll) return;

    const token = getToken();
    if (!token) return;

    const stoppedOrders = orders.filter(
      (order) => order.runtimeState === "stopped",
    );
    if (stoppedOrders.length === 0) {
      showStartAllModal = false;
      return;
    }

    isStartingAll = true;

    try {
      const stoppedIds = new Set(stoppedOrders.map((o) => o.orderId));
      const results = await Promise.all(
        stoppedOrders.map((order) => resumeDirectOrder(order.orderId, token)),
      );
      orders = orders.map((o) =>
        stoppedIds.has(o.orderId)
          ? { ...o, runtimeState: "running" as const }
          : o,
      );
      showStartAllModal = false;

      const warnings = results.flatMap((result) => result.warnings);
      toast.success($_("admin_direct_mm_start_all_success"), {
        description:
          warnings.length > 0
            ? warnings.join(" · ")
            : $_("admin_direct_mm_recovery_monitor_status"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStartingAll = false;
    }
  }
</script>

<div class="min-h-screen pb-10 bg-slate-50">
  <div class="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
    {#if pageLoading}
      <div class="skeleton h-12 w-full rounded-xl"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="skeleton h-48 w-full rounded-xl"></div>
        <div class="skeleton h-48 w-full rounded-xl"></div>
      </div>
      <div class="skeleton h-64 w-full rounded-xl"></div>
    {:else}
      <EvmWalletStatusBar
        evmAddress={walletStatusAddress}
        {hasWalletConfigured}
        hint={walletStatusHint}
      />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ApiKeysPanel {apiKeys} {orders} />
        <CampaignsPanel
          {campaigns}
          onJoin={openJoinModal}
          onViewAll={() => (showAllCampaigns = true)}
        />
      </div>

      <OrdersTable
        {orders}
        onCreateClick={() => (showStartForm = !showStartForm)}
        onStartAllClick={() => (showStartAllModal = true)}
        onStopAllClick={() => (showStopAllConfirm = true)}
        onStopOrder={(order) => (stopOrderCandidate = order)}
        onResumeOrder={handleResumeOrder}
        onOrderClick={openOrderDetails}
      />
    {/if}
  </div>
</div>

<CreateOrderModal
  show={showStartForm}
  {isStarting}
  {exchangeOptions}
  {filteredPairs}
  {filteredApiKeys}
  {strategies}
  bind:startExchangeName
  bind:startPair
  bind:startStrategyDefinitionId
  {selectedControllerType}
  bind:startApiKeyId
  bind:startMakerApiKeyId
  bind:startTakerApiKeyId
  bind:orderAmount
  {minOrderAmount}
  bind:orderSpread
  onSubmit={handleStartOrder}
  onClose={resetStartForm}
/>

<StartAllModal
  show={showStartAllModal}
  {isStartingAll}
  {stoppedOrdersCount}
  onConfirm={handleStartAll}
  onCancel={() => (showStartAllModal = false)}
/>

<StopAllModal
  show={showStopAllConfirm}
  {isStoppingAll}
  {activeOrdersCount}
  onConfirm={handleStopAll}
  onCancel={() => (showStopAllConfirm = false)}
/>

<StopOrderModal
  order={stopOrderCandidate}
  {isStopping}
  onConfirm={confirmStopOrder}
  onCancel={() => (stopOrderCandidate = null)}
/>

<ResumeOrderModal
  order={resumeOrderCandidate}
  {isResuming}
  onConfirm={confirmResumeOrder}
  onCancel={() => (resumeOrderCandidate = null)}
/>

<AllCampaignsModal
  show={showAllCampaigns}
  {campaigns}
  onJoin={openJoinFromAll}
  onClose={() => (showAllCampaigns = false)}
/>

<JoinCampaignModal
  show={showJoinModal}
  {isJoiningCampaign}
  {apiKeys}
  campaign={selectedCampaign || {}}
  bind:joinCampaignApiKeyId
  bind:joinCampaignEvmAddress
  onConfirm={submitCampaignJoin}
  onCancel={() => (showJoinModal = false)}
/>

<OrderDetailsDialog
  show={showOrderDetails}
  order={detailsOrder}
  data={detailsData}
  loading={detailsLoading}
  onClose={closeOrderDetails}
  onStartOrder={() => {
    if (detailsOrder) {
      const order = detailsOrder;
      closeOrderDetails();
      handleResumeOrder(order);
    }
  }}
  onStopOrder={() => {
    if (detailsOrder) {
      const order = detailsOrder;
      closeOrderDetails();
      stopOrderCandidate = order;
    }
  }}
/>
