<script lang="ts">
    import BigNumber from "bignumber.js";
    import { browser } from "$app/environment";
    import { onDestroy, onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import AdminStatePanel from "$lib/components/admin/shared/AdminStatePanel.svelte";
    import {
        classifyAdminError,
        type AdminErrorState,
    } from "$lib/helpers/admin/common-states";

    import { getAllAPIKeys } from "$lib/helpers/mrm/admin/exchanges";
    import {
        getDirectWalletStatus,
        getDirectOrderStatus,
        getMarketMakingOrderPerformance,
        joinAdminCampaign,
        listAdminCampaigns,
        listDirectOrders,
        listDirectStrategies,
        removeDirectOrder,
        resumeDirectOrder,
        startDirectOrder,
        stopDirectOrder,
    } from "$lib/helpers/mrm/admin/direct-market-making";
    import { getCcxtExchangeMarkets } from "$lib/helpers/mrm/admin/growdata";
    import { getGrowBasicInfoStrict } from "$lib/helpers/mrm/grow";
    import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import type {
        AdminCampaign,
        DirectOrderStatus,
        DirectOrderSummary,
        DirectWalletStatus,
    } from "$lib/types/hufi/admin-direct-market-making";
    import type { GrowInfo } from "$lib/types/hufi/grow";
    import type { OrderPerformance } from "$lib/types/hufi/order-performance";

    import {
        buildGenericSchemaConfigOverrides,
        formatOrderAmountForDisplay,
        getDirectOrderActionAvailability,
        getErrorMessage,
        getRecoveryHint,
        isDualDirectOrderControllerType,
        isSchemaDrivenDirectOrderControllerType,
        normalizeConfigOverrides,
        resolveMinOrderAmount,
        type StrategySchema,
        type ExchangeMarketMetadata,
    } from "$lib/helpers/market-making/direct/helpers";
    import {
        buildDirectOrderExchangeOptions,
        filterExecutableApiKeys,
        getBlockedDirectApiKeyUseViews,
    } from "$lib/helpers/market-making/direct/api-key-filter";
    import ApiKeysPanel from "$lib/components/market-making/direct/ApiKeysPanel.svelte";
    import CampaignsPanel from "$lib/components/market-making/direct/CampaignsPanel.svelte";
    import EvmWalletStatusBar from "$lib/components/market-making/direct/EvmWalletStatusBar.svelte";
    import OrdersTable from "$lib/components/market-making/direct/OrdersTable.svelte";
    import CreateOrderModal from "$lib/components/market-making/direct/CreateOrderModal.svelte";
    import StartAllModal from "$lib/components/market-making/direct/StartAllModal.svelte";
    import StopAllModal from "$lib/components/market-making/direct/StopAllModal.svelte";
    import StopOrderModal from "$lib/components/market-making/direct/StopOrderModal.svelte";
    import ResumeOrderModal from "$lib/components/market-making/direct/ResumeOrderModal.svelte";
    import RemoveOrderModal from "$lib/components/market-making/direct/RemoveOrderModal.svelte";
    import AllCampaignsModal from "$lib/components/market-making/direct/AllCampaignsModal.svelte";
    import CampaignDetailsModal from "$lib/components/market-making/direct/CampaignDetailsModal.svelte";
    import JoinCampaignModal from "$lib/components/market-making/direct/JoinCampaignModal.svelte";
    import OrderDetailsDialog from "$lib/components/market-making/direct/OrderDetailsDialog.svelte";

    type OverrideRow = { key: string; value: string };

    const ORDER_DETAILS_REFRESH_INTERVAL_MS = 5000;
    const PAGE_AUTO_REFRESH_INTERVAL_MS = 30000;
    const ADAPTIVE_PMM_SCHEMA_EXCLUDED_FIELDS = [
        "userId",
        "clientId",
        "marketMakingOrderId",
        "pair",
        "symbol",
        "exchangeName",
        "accountLabel",
        "apiKeyId",
        "bidSpread",
        "askSpread",
        "orderAmount",
        "orderRefreshTime",
        "numberOfLayers",
        "amountChangePerLayer",
        "amountChangeType",
        "ceilingPrice",
        "floorPrice",
        "oracleExchangeName",
    ];

    let growInfo: GrowInfo | null = null;
    let strategies: MarketMakingStrategy[] = [];
    let apiKeys: AdminSingleKey[] = [];
    let initialOrders: DirectOrderSummary[] = [];
    let initialCampaigns: AdminCampaign[] = [];
    let walletStatus: DirectWalletStatus = { configured: false, address: null };
    let pageLoading = true;
    let pageLoadError: AdminErrorState | null = null;
    let supportingLoadErrors: string[] = [];
    let pageLoadRequestId = 0;

    $: pairs = growInfo?.market_making?.pairs || [];

    const DIRECT_MM_SESSION_ERROR =
        "Session expired. Sign in again before viewing direct market-making operations.";

    async function settle<T>(task: Promise<T>, fallback: T) {
        try {
            return { value: await task, error: null };
        } catch (cause) {
            return {
                value: fallback,
                error:
                    cause instanceof Error
                        ? cause.message
                        : "Direct market-making data failed to load",
            };
        }
    }

    function clearPageData() {
        growInfo = null;
        strategies = [];
        apiKeys = [];
        initialOrders = [];
        initialCampaigns = [];
        walletStatus = { configured: false, address: null };
        pageLoadError = null;
        supportingLoadErrors = [];
    }

    async function loadPageData(options: { showLoading?: boolean } = {}) {
        const requestId = ++pageLoadRequestId;
        const showLoading = options.showLoading ?? true;
        const token = getToken();

        if (!token) {
            clearPageData();
            pageLoadError = classifyAdminError(
                new Error(DIRECT_MM_SESSION_ERROR),
                "Direct market-making orders failed to load",
            );
            pageLoading = false;
            return;
        }

        if (showLoading) {
            pageLoading = true;
            clearPageData();
        } else {
            pageLoadError = null;
            supportingLoadErrors = [];
        }

        try {
            const [gInfo, strats, keys, orders, camps, wallet] = await Promise.all([
                settle(getGrowBasicInfoStrict(token), null),
                settle(listDirectStrategies(token), []),
                settle(getAllAPIKeys(token), []),
                settle(listDirectOrders(token), []),
                settle(listAdminCampaigns(token), []),
                settle(getDirectWalletStatus(token), {
                    configured: false,
                    address: null,
                }),
            ]);

            if (requestId !== pageLoadRequestId) {
                return;
            }

            growInfo = gInfo.value || null;
            strategies = strats.value || [];
            apiKeys = keys.value || [];
            initialOrders = orders.value || [];
            initialCampaigns = camps.value || [];
            walletStatus = wallet.value || { configured: false, address: null };
            pageLoadError = orders.error
                ? classifyAdminError(
                      new Error(String(orders.error)),
                      "Direct market-making orders failed to load",
                  )
                : null;
            supportingLoadErrors = [
                gInfo.error ? `exchange configuration: ${gInfo.error}` : "",
                strats.error ? `strategies: ${strats.error}` : "",
                keys.error ? `API keys: ${keys.error}` : "",
                camps.error ? `campaigns: ${camps.error}` : "",
                wallet.error ? `wallet: ${wallet.error}` : "",
            ].filter(Boolean);
        } finally {
            if (requestId === pageLoadRequestId) {
                pageLoading = false;
            }
        }
    }

    let pageRefreshTimer: ReturnType<typeof setInterval> | null = null;
    let pageRefreshing = false;

    function hasBlockingPageDialogOpen() {
        return Boolean(
            showStartForm ||
                showStartAllModal ||
                showStopAllConfirm ||
                stopOrderCandidate ||
                resumeOrderCandidate ||
                removeOrderCandidate ||
                showAllCampaigns ||
                showJoinModal ||
                selectedCampaignForDetails,
        );
    }

    async function silentRefresh() {
        if (
            pageLoading ||
            pageRefreshing ||
            hasBlockingPageDialogOpen() ||
            document.visibilityState !== "visible"
        ) {
            return;
        }

        const token = getToken();
        if (!token) return;

        pageRefreshing = true;

        try {
            const [newOrders, newCampaigns] = await Promise.all([
                listDirectOrders(token).catch(() => null),
                listAdminCampaigns(token).catch(() => null),
            ]);
            if (newOrders) initialOrders = newOrders;
            if (newCampaigns) initialCampaigns = newCampaigns;
        } catch {
            // silent — don't disrupt UI
        } finally {
            pageRefreshing = false;
        }
    }

    function refreshPageWhenVisible() {
        if (document.visibilityState === "visible") {
            void silentRefresh();
        }
    }

    onMount(() => {
        void loadPageData();
        pageRefreshTimer = setInterval(
            silentRefresh,
            PAGE_AUTO_REFRESH_INTERVAL_MS,
        );
        document.addEventListener("visibilitychange", refreshPageWhenVisible);
    });

    let orders = initialOrders;
    let campaigns = initialCampaigns;

    let showStartForm = false;
    let showStartAllModal = false;
    let isStartingAll = false;
    let isStarting = false;
    let startCooldown = false;
    let startExchangeName = "";
    let startPair = "";
    let startStrategyDefinitionId = "";
    let startApiKeyId = "";
    let startMakerApiKeyId = "";
    let startTakerApiKeyId = "";
    let orderAmount = "";
    let orderSpread = "";
    let intervalTime = "30";
    let numTrades = "100";
    let pricePushRate = "0";
    let postOnlySide = "buy";
    let dynamicRoleSwitching = false;
    let targetQuoteVolume = "";
    let configRows: OverrideRow[] = [{ key: "", value: "" }];
    let genericConfig: Record<string, unknown> = {};
    let genericConfigStrategyDefinitionId = "";
    let exchangeMarketsById: Record<string, ExchangeMarketMetadata[]> = {};
    let loadingExchangeMarketIds: string[] = [];
    let loadedExchangeMarketIds: string[] = [];

    let showStopAllConfirm = false;
    let isStoppingAll = false;

    let stopOrderCandidate: DirectOrderSummary | null = null;
    let isStopping = false;

    let resumeOrderCandidate: DirectOrderSummary | null = null;
    let isResuming = false;
    let removeOrderCandidate: DirectOrderSummary | null = null;
    let isRemoving = false;

    let showOrderDetails = false;
    let detailsOrder: DirectOrderSummary | null = null;
    let detailsData: DirectOrderStatus | null = null;
    let detailsPerformance: OrderPerformance | null = null;
    let detailsError: AdminErrorState | null = null;
    let detailsLoading = false;
    let detailsRefreshTimer: ReturnType<typeof setInterval> | null = null;
    let detailsRefreshing = false;
    let detailsRefreshingOrderId: string | null = null;
    let detailsPollingOrderId: string | null = null;
    let pendingOrderDetailsRefresh: {
        orderId: string;
        options: { silent?: boolean };
    } | null = null;
    let prefillingFromOrderId: string | null = null;

    let showAllCampaigns = false;
    let showJoinModal = false;
    let isJoiningCampaign = false;
    let joinCampaignAddress = "";
    let joinCampaignChainId = 0;
    let joinCampaignApiKeyId = "";
    let joinCampaignEvmAddress = "";
    let selectedCampaign: AdminCampaign | null = null;
    let selectedCampaignForDetails: AdminCampaign | null = null;

    $: orders = initialOrders;
    $: campaigns = initialCampaigns;
    $: stoppableOrdersCount = orders.filter(isOrderStoppable).length;
    $: stoppedOrdersCount = orders.filter(
        (o) => o.runtimeState === "stopped",
    ).length;
    $: exchangeOptions = buildDirectOrderExchangeOptions(growInfo, apiKeys);
    $: filteredPairs = pairs.filter(
        (pair) => !startExchangeName || pair.exchange_id === startExchangeName,
    );
    $: selectedPairConfig =
        pairs.find(
            (pair) =>
                pair.exchange_id === startExchangeName &&
                pair.symbol === startPair,
        ) || null;
    $: selectedExchangeMarkets = startExchangeName
        ? exchangeMarketsById[startExchangeName] || []
        : [];
    $: minOrderAmount = resolveMinOrderAmount(
        selectedPairConfig?.min_order_amount,
        selectedExchangeMarkets,
        startPair,
        selectedPairConfig?.base_price,
        selectedPairConfig?.target_price,
    );
    $: displayMinOrderAmount = formatOrderAmountForDisplay(
        minOrderAmount,
        selectedPairConfig?.amount_significant_figures,
    );
    $: selectedStrategy =
        strategies.find(
            (strategy) => strategy.id === startStrategyDefinitionId,
        ) || null;
    $: selectedControllerType = selectedStrategy?.controllerType || "";
    $: selectedStrategySchema =
        (selectedStrategy?.configSchema as StrategySchema) || {};
    $: isDualAccountStrategy =
        selectedStrategy?.directExecutionMode === "dual_account" ||
        isDualDirectOrderControllerType(selectedControllerType);
    $: isSchemaDrivenStrategy =
        isSchemaDrivenDirectOrderControllerType(selectedControllerType);
    $: isPureMarketMakingStrategy =
        selectedControllerType === "pureMarketMaking";
    $: filteredApiKeys = filterExecutableApiKeys(apiKeys, startExchangeName);
    $: blockedStartApiKeyViews = getBlockedDirectApiKeyUseViews(
        apiKeys,
        startExchangeName,
        "trade",
    );
    $: selectedApiKey =
        filteredApiKeys.find((key) => String(key.key_id) === String(startApiKeyId)) || null;
    $: selectedMakerApiKey =
        filteredApiKeys.find((key) => String(key.key_id) === String(startMakerApiKeyId)) ||
        null;
    $: selectedTakerApiKey =
        filteredApiKeys.find((key) => String(key.key_id) === String(startTakerApiKeyId)) ||
        null;
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
    $: if (
        startStrategyDefinitionId &&
        startStrategyDefinitionId !== genericConfigStrategyDefinitionId
    ) {
        genericConfigStrategyDefinitionId = startStrategyDefinitionId;
        genericConfig = { ...(selectedStrategy?.defaultConfig || {}) };
    }

    function getToken(): string {
        if (!browser) return "";
        return localStorage.getItem("admin-access-token") || "";
    }

    async function refreshPage() {
        await loadPageData({ showLoading: false });
    }

    function isOrderStoppable(order: DirectOrderSummary): boolean {
        return getDirectOrderActionAvailability(order).canStop;
    }

    function applyOrderPatch(
        orderId: string,
        patch: Partial<DirectOrderSummary>,
    ) {
        initialOrders = initialOrders.map((o) =>
            o.orderId === orderId ? { ...o, ...patch } : o,
        );
        orders = orders.map((o) =>
            o.orderId === orderId ? { ...o, ...patch } : o,
        );
        if (detailsOrder?.orderId === orderId) {
            detailsOrder = { ...detailsOrder, ...patch };
        }
    }

    function applyStatusToOrderSummary(status: DirectOrderStatus) {
        applyOrderPatch(status.orderId, {
            state: status.state,
            runtimeState: status.runtimeState,
            lastTickAt: status.lastTickAt,
            apiKeyId: status.apiKeyId,
            makerApiKeyId: status.makerApiKeyId,
            takerApiKeyId: status.takerApiKeyId,
            accountLabel: status.accountLabel,
            makerAccountLabel: status.makerAccountLabel,
            takerAccountLabel: status.takerAccountLabel,
            makerAccountName: status.makerAccountName,
            takerAccountName: status.takerAccountName,
        });
    }

    async function ensureExchangeMarketsLoaded(exchangeId: string) {
        if (
            !exchangeId ||
            loadedExchangeMarketIds.includes(exchangeId) ||
            loadingExchangeMarketIds.includes(exchangeId)
        ) {
            return;
        }

        const token = getToken();
        if (!token) {
            return;
        }

        loadingExchangeMarketIds = [...loadingExchangeMarketIds, exchangeId];

        try {
            const markets = await getCcxtExchangeMarkets(exchangeId, token);
            exchangeMarketsById = {
                ...exchangeMarketsById,
                [exchangeId]: Array.isArray(markets)
                    ? (markets as ExchangeMarketMetadata[])
                    : [],
            };
        } catch (error) {
            console.error(`Failed to fetch markets for ${exchangeId}`, error);
        } finally {
            loadingExchangeMarketIds = loadingExchangeMarketIds.filter(
                (id) => id !== exchangeId,
            );
            loadedExchangeMarketIds = [
                ...new Set([...loadedExchangeMarketIds, exchangeId]),
            ];
        }
    }

    $: if (showStartForm && startExchangeName) {
        void ensureExchangeMarketsLoaded(startExchangeName);
    }

    function resetStartForm() {
        showStartForm = false;
        prefillingFromOrderId = null;
        startExchangeName = "";
        startPair = "";
        startStrategyDefinitionId = "";
        startApiKeyId = "";
        startMakerApiKeyId = "";
        startTakerApiKeyId = "";
        configRows = [{ key: "", value: "" }];
        genericConfig = {};
        genericConfigStrategyDefinitionId = "";
        orderAmount = "";
        orderSpread = "";
        intervalTime = "30";
        numTrades = "100";
        pricePushRate = "0";
        postOnlySide = "buy";
        dynamicRoleSwitching = false;
        targetQuoteVolume = "";
    }

    function applyOrderStatusToStartForm(
        order: DirectOrderSummary,
        status: DirectOrderStatus,
    ) {
        startExchangeName = order.exchangeName;
        startPair = order.pair;
        startStrategyDefinitionId = order.strategyDefinitionId || "";
        startApiKeyId = order.apiKeyId || "";
        startMakerApiKeyId = order.makerApiKeyId || "";
        startTakerApiKeyId = order.takerApiKeyId || "";
        orderAmount = status.orderConfig.orderAmount || "";
        orderSpread = status.orderConfig.baseIncrementPercentage || "";
        intervalTime =
            status.orderConfig.baseIntervalTime !== null
                ? String(status.orderConfig.baseIntervalTime)
                : "30";
        numTrades =
            status.orderConfig.numTrades !== null
                ? String(status.orderConfig.numTrades)
                : "100";
        pricePushRate = status.orderConfig.pricePushRate || "0";
        postOnlySide = status.orderConfig.postOnlySide || "buy";
        dynamicRoleSwitching = status.orderConfig.dynamicRoleSwitching ?? false;
        targetQuoteVolume = status.orderConfig.targetQuoteVolume || "";
        configRows = [{ key: "", value: "" }];
        genericConfig = {
            ...(strategies.find(
                (strategy) => strategy.id === startStrategyDefinitionId,
            )?.defaultConfig || {}),
        };
        genericConfigStrategyDefinitionId = startStrategyDefinitionId;
        showStartForm = true;
        prefillingFromOrderId = order.orderId;
    }

    async function handleStartOrder() {
        if (isStarting || startCooldown) return;
        const token = getToken();
        const missingSingleAccount = !isDualAccountStrategy && !selectedApiKey;
        const missingDualAccount =
            isDualAccountStrategy &&
            (!selectedMakerApiKey || !selectedTakerApiKey);
        const insufficientDualAccounts =
            isDualAccountStrategy && filteredApiKeys.length < 2;

        if (
            !token ||
            !startExchangeName ||
            !startPair ||
            !startStrategyDefinitionId ||
            missingSingleAccount ||
            missingDualAccount
        ) {
            const missing: string[] = [];
            if (!token) missing.push("token");
            if (!startExchangeName) missing.push("exchange");
            if (!startPair) missing.push("pair");
            if (!startStrategyDefinitionId) missing.push("strategy");
            if (missingSingleAccount) missing.push("API key");
            if (missingDualAccount) missing.push("maker/taker API keys");
            toast.error($_("admin_direct_mm_error_missing_fields"), {
                description: `${$_("admin_direct_mm_recovery_required_fields")} (${missing.join(", ")})`,
            });
            return;
        }

        if (insufficientDualAccounts) {
            toast.error($_("admin_direct_mm_error_dual_accounts_required"), {
                description: $_("admin_direct_mm_recovery_dual_accounts_required"),
            });
            return;
        }

        if (
            isDualAccountStrategy &&
            selectedMakerApiKey &&
            selectedTakerApiKey &&
            String(selectedMakerApiKey.key_id) === String(selectedTakerApiKey.key_id)
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
                    values: { amount: displayMinOrderAmount || minOrderAmount },
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
            const baseConfigOverrides = normalizeConfigOverrides(
                selectedControllerType,
                configRows,
                orderAmount,
                orderSpread,
                {
                    intervalTime,
                    numTrades,
                    pricePushRate,
                    postOnlySide,
                    dynamicRoleSwitching,
                    targetQuoteVolume,
                    cadenceVariance: "",
                    tradeAmountVariance: "",
                    priceOffsetVariance: "",
                },
            );
            const configOverrides = isSchemaDrivenStrategy
                ? buildGenericSchemaConfigOverrides(
                      selectedStrategySchema,
                      genericConfig,
                  )
                : {
                      ...baseConfigOverrides,
                      ...(isPureMarketMakingStrategy
                          ? buildGenericSchemaConfigOverrides(
                                selectedStrategySchema,
                                genericConfig,
                                ADAPTIVE_PMM_SCHEMA_EXCLUDED_FIELDS,
                            )
                          : {}),
                  };
            const payload = isDualAccountStrategy
                ? {
                      exchangeName: startExchangeName,
                      pair: startPair,
                      strategyDefinitionId: startStrategyDefinitionId,
                      makerApiKeyId: selectedMakerApiKey!.key_id,
                      takerApiKeyId: selectedTakerApiKey!.key_id,
                      configOverrides,
                  }
                : {
                      exchangeName: startExchangeName,
                      pair: startPair,
                      strategyDefinitionId: startStrategyDefinitionId,
                      apiKeyId: selectedApiKey!.key_id,
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
            const stoppableOrders = orders.filter(isOrderStoppable);
            if (stoppableOrders.length === 0) {
                showStopAllConfirm = false;
                return;
            }
            const stoppableIds = new Set(stoppableOrders.map((o) => o.orderId));
            await Promise.all(
                stoppableOrders.map((o) => stopDirectOrder(o.orderId, token)),
            );
            initialOrders = initialOrders.map((o) =>
                stoppableIds.has(o.orderId)
                    ? { ...o, runtimeState: "stopped" as const, state: "stopped" }
                    : o,
            );
            orders = orders.map((o) =>
                stoppableIds.has(o.orderId)
                    ? { ...o, runtimeState: "stopped" as const, state: "stopped" }
                    : o,
            );
            await silentRefresh();
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
            applyOrderPatch(stoppedOrderId, {
                runtimeState: "stopped",
                state: "stopped",
            });
            await silentRefresh();
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

    function handleRemoveOrder(order: DirectOrderSummary) {
        removeOrderCandidate = order;
    }

    async function confirmResumeOrder() {
        if (!resumeOrderCandidate || isResuming) return;
        const token = getToken();

        if (!token) return;

        isResuming = true;
        const order = resumeOrderCandidate;

        try {
            const result = await resumeDirectOrder(order.orderId, token);
            applyOrderPatch(order.orderId, {
                runtimeState: "running",
                state: "running",
            });
            await silentRefresh();
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

    async function confirmRemoveOrder() {
        if (!removeOrderCandidate || isRemoving) return;
        const token = getToken();

        if (!token) return;

        isRemoving = true;
        const order = removeOrderCandidate;

        try {
            await removeDirectOrder(order.orderId, token);
            initialOrders = initialOrders.filter((o) => o.orderId !== order.orderId);
            orders = orders.filter((o) => o.orderId !== order.orderId);
            toast.success($_("admin_direct_mm_remove_success"), {
                description: $_("admin_direct_mm_remove_success_hint", {
                    values: { pair: order.pair },
                }),
            });
            removeOrderCandidate = null;

            if (showOrderDetails && detailsOrder?.orderId === order.orderId) {
                closeOrderDetails();
            }
        } catch (error) {
            toast.error(getErrorMessage(error), {
                description: getRecoveryHint(error),
            });
        } finally {
            isRemoving = false;
        }
    }

    async function openOrderDetails(order: DirectOrderSummary) {
        detailsOrder = order;
        detailsData = null;
        detailsPerformance = null;
        detailsError = null;
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
        options: { silent?: boolean; throwOnError?: boolean } = {},
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
                const sessionError = new Error("Session expired. Sign in again before viewing direct market-making operations.");
                detailsError = classifyAdminError(
                    sessionError,
                    "Direct market-making order diagnosis failed to load",
                );
                if (options.throwOnError) {
                    throw sessionError;
                }
                return;
            }

            const [nextDetails, nextPerformance] = await Promise.all([
                getDirectOrderStatus(orderId, token),
                getMarketMakingOrderPerformance(orderId, token),
            ]);

            if (detailsOrder?.orderId === orderId) {
                detailsData = nextDetails;
                detailsPerformance = nextPerformance;
                detailsError = null;
                applyStatusToOrderSummary(nextDetails);
            }
        } catch (error) {
            if (detailsOrder?.orderId === orderId) {
                detailsError = classifyAdminError(
                    error,
                    "Direct market-making order diagnosis failed to load",
                );
            }
            if (options.throwOnError) {
                throw error;
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
        detailsPerformance = null;
        detailsError = null;
        detailsLoading = false;
    }

    onDestroy(() => {
        pageLoadRequestId += 1;
        stopOrderDetailsPolling();
        if (pageRefreshTimer) {
            clearInterval(pageRefreshTimer);
            pageRefreshTimer = null;
        }
        document.removeEventListener("visibilitychange", refreshPageWhenVisible);
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
        joinCampaignChainId = Number(
            campaign.chain_id || campaign.chainId || 137,
        );
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
                stoppedOrders.map((order) =>
                    resumeDirectOrder(order.orderId, token),
                ),
            );
            orders = orders.map((o) =>
                stoppedIds.has(o.orderId)
                    ? { ...o, runtimeState: "running" as const, state: "running" }
                    : o,
            );
            initialOrders = initialOrders.map((o) =>
                stoppedIds.has(o.orderId)
                    ? { ...o, runtimeState: "running" as const, state: "running" }
                    : o,
            );
            await silentRefresh();
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

<div class="min-h-screen pb-10 bg-base-100">
    <div class="max-w-350 mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        {#if pageLoading}
            <div data-testid="direct-mm-loading" class="space-y-6">
                <div class="skeleton h-12 w-full rounded-xl"></div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="skeleton h-48 w-full rounded-xl"></div>
                    <div class="skeleton h-48 w-full rounded-xl"></div>
                </div>
                <div class="skeleton h-64 w-full rounded-xl"></div>
            </div>
        {:else if pageLoadError}
            <AdminStatePanel
                kind={pageLoadError.kind}
                context={$_("admin_direct_mm_context")}
                title={pageLoadError.title}
                message={pageLoadError.message}
                actionLabel={pageLoadError.kind === "session" ? $_("admin_sign_in_again") : $_("admin_retry")}
                actionHref={pageLoadError.kind === "session" ? "/login" : ""}
                onAction={pageLoadError.kind === "session" ? undefined : () => void refreshPage()}
                testId="direct-mm-error"
            />
        {:else}
            {#if supportingLoadErrors.length > 0}
                <AdminStatePanel
                    kind="error"
                    context={$_("admin_direct_mm_supporting_data_context")}
                    title={$_("admin_direct_mm_supporting_data_error_title")}
                    message={supportingLoadErrors.join(" · ")}
                    actionLabel={$_("admin_retry")}
                    onAction={() => void refreshPage()}
                    testId="direct-mm-supporting-error"
                />
            {/if}
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
                    onViewDetails={(campaign) => (selectedCampaignForDetails = campaign)}
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
                onRemoveOrder={handleRemoveOrder}
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
    blockedApiKeyViews={blockedStartApiKeyViews}
    {strategies}
    {prefillingFromOrderId}
    {selectedStrategySchema}
    bind:genericConfig
    bind:startExchangeName
    bind:startPair
    bind:startStrategyDefinitionId
    {selectedControllerType}
    directExecutionMode={selectedStrategy?.directExecutionMode ?? null}
    bind:startApiKeyId
    bind:startMakerApiKeyId
    bind:startTakerApiKeyId
    bind:orderAmount
    {minOrderAmount}
    displayMinOrderAmount={displayMinOrderAmount || minOrderAmount}
    bind:orderSpread
    bind:intervalTime
    bind:numTrades
    bind:pricePushRate
    bind:postOnlySide
    bind:dynamicRoleSwitching
    bind:targetQuoteVolume
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
    activeOrdersCount={stoppableOrdersCount}
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

<CampaignDetailsModal
    show={Boolean(selectedCampaignForDetails)}
    campaign={selectedCampaignForDetails}
    token={getToken()}
    serverAddress={walletStatusAddress}
    onClose={() => (selectedCampaignForDetails = null)}
/>

<OrderDetailsDialog
    show={showOrderDetails}
    order={detailsOrder}
    data={detailsData}
    performance={detailsPerformance}
    loading={detailsLoading}
    refreshing={detailsRefreshing && !detailsLoading}
    error={detailsError}
    onClose={closeOrderDetails}
    onRefresh={() => {
        if (detailsOrder) {
            void toast.promise(loadOrderDetails(detailsOrder.orderId, { throwOnError: true }), {
                loading: "refreshing order diagnosis",
                success: "order diagnosis refreshed",
                error: "failed to refresh order diagnosis",
            });
        }
    }}
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
    onRemoveOrder={() => {
        if (detailsOrder) {
            const order = detailsOrder;
            closeOrderDetails();
            handleRemoveOrder(order);
        }
    }}
/>

<RemoveOrderModal
    order={removeOrderCandidate}
    {isRemoving}
    onConfirm={confirmRemoveOrder}
    onCancel={() => (removeOrderCandidate = null)}
/>
