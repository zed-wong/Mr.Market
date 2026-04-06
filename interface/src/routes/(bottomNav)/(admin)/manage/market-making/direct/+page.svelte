<script lang="ts">
  import { onMount } from "svelte";
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
  import AllCampaignsModal from "$lib/components/market-making/direct/AllCampaignsModal.svelte";
  import JoinCampaignModal from "$lib/components/market-making/direct/JoinCampaignModal.svelte";
  import OrderDetailsDialog from "$lib/components/market-making/direct/OrderDetailsDialog.svelte";

  type OverrideRow = { key: string; value: string };

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
  let orderAmount = "";
  let orderQuoteAmount = "";
  let orderSpread = "";
  let configRows: OverrideRow[] = [{ key: "", value: "" }];

  let showStopAllConfirm = false;
  let isStoppingAll = false;

  let stopOrderCandidate: DirectOrderSummary | null = null;
  let isStopping = false;

  let showOrderDetails = false;
  let detailsOrder: DirectOrderSummary | null = null;
  let detailsData: DirectOrderStatus | null = null;
  let detailsLoading = false;

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
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    } finally {
      isStopping = false;
    }
  }

  async function handleResumeOrder(order: DirectOrderSummary) {
    const token = getToken();

    if (!token) return;

    try {
      const result = await resumeDirectOrder(order.orderId, token);
      await refreshPage();
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

      if (showOrderDetails && detailsOrder?.orderId === order.orderId) {
        closeOrderDetails();
      }
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: getRecoveryHint(error),
      });
    }
  }

  async function openOrderDetails(order: DirectOrderSummary) {
    detailsOrder = order;
    showOrderDetails = true;
    detailsLoading = true;
    const token = getToken();
    if (!token) {
      detailsLoading = false;
      return;
    }
    try {
      detailsData = await getDirectOrderStatus(order.orderId, token);
    } catch {
      detailsData = null;
    } finally {
      detailsLoading = false;
    }
  }

  function closeOrderDetails() {
    showOrderDetails = false;
    detailsOrder = null;
    detailsData = null;
    detailsLoading = false;
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
      const results = await Promise.all(
        stoppedOrders.map((order) => resumeDirectOrder(order.orderId, token)),
      );

      await refreshPage();
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
  onStartOrder={() => detailsOrder && handleResumeOrder(detailsOrder)}
  onStopOrder={() => {
    if (detailsOrder) {
      closeOrderDetails();
      stopOrderCandidate = detailsOrder;
    }
  }}
/>
