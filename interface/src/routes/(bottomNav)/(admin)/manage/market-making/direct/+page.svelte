<script lang="ts">
  import { invalidate } from "$app/navigation";
  import { page } from "$app/stores";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { onDestroy } from "svelte";

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
  import JoinCampaignModal from "$lib/components/market-making/direct/JoinCampaignModal.svelte";
  import AllCampaignsModal from "$lib/components/market-making/direct/AllCampaignsModal.svelte";
  import StatusDrawer from "$lib/components/market-making/direct/StatusDrawer.svelte";

  type OverrideRow = { key: string; value: string };

  $: growInfo = ($page.data.growInfo || null) as GrowInfo | null;
  $: strategies = ($page.data.strategies || []) as MarketMakingStrategy[];
  $: apiKeys = ($page.data.apiKeys || []) as AdminSingleKey[];
  $: initialOrders = ($page.data.directOrders || []) as DirectOrderSummary[];
  $: initialCampaigns = ($page.data.campaigns || []) as Array<
    Record<string, unknown>
  >;
  $: initialCampaignJoins = ($page.data.campaignJoins ||
    []) as CampaignJoinRecord[];
  $: walletStatus = ($page.data.walletStatus || {
    configured: false,
    address: null,
  }) as DirectWalletStatus;
  $: pairs = growInfo?.market_making?.pairs || [];

  let orders = initialOrders;
  let campaigns = initialCampaigns;
  let campaignJoins = initialCampaignJoins;

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
  let orderAmount = "";
  let orderQuoteAmount = "";
  let orderSpread = "";
  let configRows: OverrideRow[] = [{ key: "", value: "" }];

  let showStopAllConfirm = false;
  let isStoppingAll = false;

  let stopOrderCandidate: DirectOrderSummary | null = null;
  let isStopping = false;

  let statusDrawerOrder: DirectOrderSummary | null = null;
  let statusDrawerData: DirectOrderStatus | null = null;
  let statusLoading = false;
  let nowMs = Date.now();
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  let showAllCampaigns = false;
  let showJoinModal = false;
  let isJoiningCampaign = false;
  let joinCampaignAddress = "";
  let joinCampaignChainId = 0;
  let joinCampaignApiKeyId = "";
  let joinCampaignEvmAddress = "";
  let selectedCampaign: Record<string, unknown> = {};

  $: orders = initialOrders;
  $: campaigns = initialCampaigns;
  $: campaignJoins = initialCampaignJoins;
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
  $: filteredApiKeys = apiKeys.filter(
    (key) => !startExchangeName || key.exchange === startExchangeName,
  );
  $: selectedApiKey =
    apiKeys.find((key) => key.key_id === startApiKeyId) || null;
  $: walletStatusAddress = walletStatus.address || "";
  $: hasWalletConfigured = walletStatus.configured;
  $: walletStatusHint = hasWalletConfigured
    ? $_("admin_direct_mm_wallet_status_loaded_hint")
    : $_("admin_direct_mm_wallet_status_missing_hint");

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

  async function refreshPage() {
    isRefreshing = true;
    await invalidate("admin:market-making:direct");
    isRefreshing = false;
  }

  async function handleStartOrder() {
    if (isStarting || startCooldown) return;
    const token = getToken();

    if (
      !token ||
      !startExchangeName ||
      !startPair ||
      !startStrategyDefinitionId ||
      !selectedApiKey
    ) {
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
          configOverrides: normalizeConfigOverrides(
            configRows,
            orderAmount,
            orderQuoteAmount,
            orderSpread,
          ),
        },
        token,
      );

      await refreshPage();
      showStartForm = false;
      configRows = [{ key: "", value: "" }];
      orderAmount = "";
      orderQuoteAmount = "";
      orderSpread = "";
      toast.success(
        $_("admin_direct_mm_start_success", {
          values: { exchange: startExchangeName, pair: startPair },
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
      await Promise.all(
        activeOrders.map((o) => stopDirectOrder(o.orderId, token)),
      );
      await refreshPage();
      toast.success($_("admin_direct_mm_stop_all_success"), {
        description: $_("admin_direct_mm_recovery_refresh_status"),
      });
      showStopAllConfirm = false;
      if (
        statusDrawerOrder &&
        activeOrders.some((o) => o.orderId === statusDrawerOrder!.orderId)
      ) {
        statusDrawerData = null;
      }
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

  function openJoinFromAll(campaign: Record<string, unknown>) {
    showAllCampaigns = false;
    openJoinModal(campaign);
  }

  function openJoinModal(campaign: Record<string, unknown>) {
    selectedCampaign = campaign;
    joinCampaignAddress = String(campaign.address || "");
    joinCampaignChainId = Number(campaign.chainId || 0);
    joinCampaignEvmAddress = walletStatusAddress;
    showJoinModal = true;
  }

  function handleStartAll() {
    isStartingAll = true;
    setTimeout(() => {
      isStartingAll = false;
      showStartAllModal = false;
    }, 1000);
  }
</script>

<div class="min-h-screen pb-10 bg-slate-50">
  <div class="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
    <EvmWalletStatusBar
      evmAddress={walletStatusAddress}
      {hasWalletConfigured}
      hint={walletStatusHint}
    />

    <!-- Top Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ApiKeysPanel {apiKeys} />
      <CampaignsPanel {campaigns} onJoin={openJoinModal} onViewAll={() => (showAllCampaigns = true)} />
    </div>

    <!-- Market Making -->
    <OrdersTable
      {orders}
      onCreateClick={() => (showStartForm = !showStartForm)}
      onStartAllClick={() => (showStartAllModal = true)}
      onStopAllClick={() => (showStopAllConfirm = true)}
      onStopOrder={(order) => (stopOrderCandidate = order)}
      onOrderClick={openStatusDrawer}
    />
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
  bind:startApiKeyId
  bind:orderAmount
  bind:orderQuoteAmount
  bind:orderSpread
  onSubmit={handleStartOrder}
  onClose={() => (showStartForm = false)}
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
  campaign={selectedCampaign}
  bind:joinCampaignApiKeyId
  bind:joinCampaignEvmAddress
  onConfirm={submitCampaignJoin}
  onCancel={() => (showJoinModal = false)}
/>

<StatusDrawer
  order={statusDrawerOrder}
  data={statusDrawerData}
  loading={statusLoading}
  {nowMs}
  onClose={closeStatusDrawer}
/>
