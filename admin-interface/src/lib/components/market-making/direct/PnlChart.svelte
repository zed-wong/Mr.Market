<script lang="ts">
    import BigNumber from "bignumber.js";
    import { _ } from "svelte-i18n";
    import { AreaChart } from "layerchart";
    import { scalePoint } from "d3-scale";
    import type { OrderPerformancePoint } from "$lib/types/hufi/order-performance";

    interface Props {
        series: OrderPerformancePoint[];
    }

    let { series = [] }: Props = $props();

    function toNumber(value: string): number {
        const parsed = new BigNumber(value);
        return parsed.isFinite() ? parsed.toNumber() : 0;
    }

    let chartData = $derived(
        series
            .map((point, i) => ({
                index: i,
                label: point.t,
                net: toNumber(point.net),
            }))
            .filter((point) => Number.isFinite(point.net))
    );

    let latestNet = $derived(
        chartData.length ? chartData[chartData.length - 1].net : 0
    );

    let canRenderChart = $derived(chartData.length >= 2);
    let lineColor = $derived(latestNet >= 0 ? "var(--color-success)" : "var(--color-error)");
</script>

<div class="border border-base-300 rounded-xl p-4 bg-base-100">
    <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-bold text-base-content">
            {$_("admin_direct_mm_pnl_chart_title")}
        </span>
        <span class="text-[10px] text-base-content/50">
            {series.length} {$_("admin_direct_mm_pnl_chart_points")}
        </span>
    </div>

    {#if !canRenderChart}
        <div class="h-[180px] flex items-center justify-center bg-base-200 rounded-lg">
            <span class="text-xs text-base-content/50">
                {$_("admin_direct_mm_pnl_chart_empty")}
            </span>
        </div>
    {:else}
        <div class="h-[180px]">
            <AreaChart
                data={chartData}
                x="index"
                xScale={scalePoint()}
                y="net"
                yBaseline={0}
                yNice
                series={[
                    {
                        key: "net",
                        value: "net",
                        color: lineColor,
                    },
                ]}
                props={{
                    area: { fillOpacity: 0.12 },
                    line: { strokeWidth: 2.5 },
                }}
                axis={false}
                grid={false}
                rule={false}
                legend={false}
                tooltipContext={false}
                highlight={false}
            />
        </div>
    {/if}
</div>
