<script lang="ts">
    import StatsHeader from "$lib/components/market-making/order-details/StatsHeader.svelte";
    import RevenueCard from "$lib/components/market-making/order-details/RevenueCard.svelte";
    import BalanceCard from "$lib/components/market-making/order-details/BalanceCard.svelte";
    import DetailsCard from "$lib/components/market-making/order-details/DetailsCard.svelte";
    import FillHistory from "$lib/components/market-making/order-details/FillHistory.svelte";
    import BottomActions from "$lib/components/market-making/order-details/BottomActions.svelte";
    import CancelOrderDialog from "$lib/components/market-making/order-details/CancelOrderDialog.svelte";
    import ModifyOrderModal from "$lib/components/market-making/order-details/ModifyOrderDialog.svelte";
    import ExecutionDetailsDialog from "$lib/components/market-making/order-details/ExecutionDetailsDialog.svelte";
    import type { PageData } from "./$types";
    import { _ } from "svelte-i18n";
    import BigNumber from "bignumber.js";

    export let data: PageData;

    let showModifyModal = false;
    let showExecutionDetails = false;
    let isCancelDialogOpen = false;

    // Mock data fallback
    const mockOrder = {
        symbol: "BTC/USDT",
        ordersPlaced: "842",
        volume: "1.2M",
        active: true,
        totalRevenue: "$1,240.50",
        pnl: "+12.24%",
        profitFromSpreads: "$842.20",
        balances: {
            base: { symbol: "BTC", amount: "1.24" },
            quote: { symbol: "USDT", amount: "45,420" },
        },
        details: {
            symbol: "BTC/USDT",
            exchange: "MEXC Global",
            orderId: "#88291...ae2",
            type: "Market Maker",
            created: "Oct 24, 14:30:05",
            totalValue: "$39,675.00",
            fees: "$12.50",
        },
        fills: [
            {
                amount: "0.24 BTC",
                time: "14:32:05",
                price: "64,240.50 USDT",
                status: "Filled",
            },
        ],
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "---";
        return new Date(dateStr).toLocaleString();
    };

    $: backendOrder = data.order?.data || data.order;
    $: history = data.history || [];

    $: ordersPlaced = history.length.toString();
    $: volume = history
        .reduce((acc: BigNumber, curr: any) => {
            const amount = new BigNumber(curr.amount || 0);
            const price = new BigNumber(curr.price || 0);
            return acc.plus(amount.times(price));
        }, new BigNumber(0))
        .toFormat(2);

    $: fills = history.map((h: any) => ({
        amount: `${h.amount}`,
        time: new Date(h.executedAt).toLocaleTimeString(),
        price: `${h.price}`,
        status: h.status || "Filled",
        side: h.side,
    }));

    $: order = backendOrder
        ? {
              symbol: backendOrder.pair || "---",
              ordersPlaced: ordersPlaced,
              volume: volume,
              active:
                  backendOrder.state === "created" ||
                  backendOrder.state === "resumed" ||
                  backendOrder.state === "payment_complete" ||
                  backendOrder.state === "in_progress",
              totalRevenue: "---", // TODO: Calculate revenue
              pnl: "---", // TODO: Calculate PnL
              profitFromSpreads: "---",
              balances: {
                  base: {
                      symbol: backendOrder.pair?.split("/")[0] || "---",
                      amount: backendOrder.balanceA || "0",
                  },
                  quote: {
                      symbol: backendOrder.pair?.split("/")[1] || "---",
                      amount: backendOrder.balanceB || "0",
                  },
              },
              details: {
                  symbol: backendOrder.pair,
                  exchange: backendOrder.exchangeName,
                  orderId: backendOrder.orderId,
                  type: $_("market_making"),
                  created: formatDate(backendOrder.createdAt),
                  totalValue: "---",
                  fees: "---",
              },
              fills: fills,
          }
        : mockOrder;

    function handleCancelConfirm(event: CustomEvent) {
        const { action } = event.detail;
        console.log(`Order cancellation confirmed: ${action}`);
        // TODO: Implement actual pause/close logic here
    }
</script>

<div class="min-h-screen bg-gray-50 pb-10">
    <StatsHeader
        ordersPlaced={order.ordersPlaced || "0"}
        volume={order.volume || "0"}
        isActive={order.active}
        on:click={() => (showExecutionDetails = true)}
    />

    <RevenueCard
        totalRevenue={order.totalRevenue || "$0.00"}
        pnl={order.pnl || "0%"}
        profitFromSpreads={order.profitFromSpreads || "$0.00"}
    />

    {#if order.balances}
        <BalanceCard
            baseSymbol={order.balances.base?.symbol || "BASE"}
            baseAmount={order.balances.base?.amount || "0"}
            quoteSymbol={order.balances.quote?.symbol || "QUOTE"}
            quoteAmount={order.balances.quote?.amount || "0"}
        />
    {/if}

    {#if order.details}
        <DetailsCard
            symbol={order.details.symbol || order.symbol}
            exchange={order.details.exchange || "Unknown"}
            orderId={order.details.orderId || "---"}
            type={order.details.type || "Market Maker"}
            created={order.details.created || ""}
            totalValue={order.details.totalValue || ""}
            fees={order.details.fees || ""}
        />
    {/if}

    <FillHistory fills={order.fills || []} />

    <BottomActions
        on:cancel={() => (isCancelDialogOpen = true)}
        on:modify={() => (showModifyModal = true)}
    />

    <ModifyOrderModal
        isOpen={showModifyModal}
        baseSymbol={order.balances.base?.symbol}
        quoteSymbol={order.balances.quote?.symbol}
        currentBaseBalance={order.balances.base?.amount}
        currentQuoteBalance={order.balances.quote?.amount}
        on:close={() => (showModifyModal = false)}
        on:confirm={(e) => {
            console.log("Modify confirmed:", e.detail);
            showModifyModal = false;
        }}
    />

    <CancelOrderDialog
        isOpen={isCancelDialogOpen}
        pair={order.symbol}
        on:close={() => (isCancelDialogOpen = false)}
        on:confirm={handleCancelConfirm}
    />

    <ExecutionDetailsDialog
        isOpen={showExecutionDetails}
        totalOrders={order.ordersPlaced}
        totalVolume={order.volume}
        on:close={() => (showExecutionDetails = false)}
    />
</div>
