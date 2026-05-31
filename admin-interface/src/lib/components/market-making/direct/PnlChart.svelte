<script lang="ts">
    import BigNumber from "bignumber.js";
    import { _ } from "svelte-i18n";
    import type { OrderPerformancePoint } from "$lib/types/hufi/order-performance";

    export let series: OrderPerformancePoint[] = [];

    const width = 640;
    const height = 180;
    const paddingX = 14;
    const paddingY = 18;

    function toNumber(value: string): number {
        const parsed = new BigNumber(value);
        return parsed.isFinite() ? parsed.toNumber() : 0;
    }

    $: values = series.map((point) => toNumber(point.net));
    $: minValue = values.length ? Math.min(0, ...values) : 0;
    $: maxValue = values.length ? Math.max(0, ...values) : 0;
    $: valueRange = maxValue - minValue || 1;
    $: latestNet = values.length ? values[values.length - 1] : 0;
    $: lineClass = latestNet >= 0 ? "text-success" : "text-error";
    $: points = values.map((value, index) => {
        const x =
            paddingX +
            (series.length <= 1
                ? 0
                : (index * (width - paddingX * 2)) / (series.length - 1));
        const y =
            paddingY +
            ((maxValue - value) * (height - paddingY * 2)) / valueRange;

        return { x, y };
    });
    $: zeroY =
        paddingY + ((maxValue - 0) * (height - paddingY * 2)) / valueRange;
    $: linePath = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
    $: areaPath =
        points.length > 0
            ? `${linePath} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`
            : "";
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

    {#if series.length === 0}
        <div class="h-[180px] flex items-center justify-center bg-base-200 rounded-lg">
            <span class="text-xs text-base-content/50">
                {$_("admin_direct_mm_pnl_chart_empty")}
            </span>
        </div>
    {:else}
        <svg
            class="w-full h-[180px] block"
            viewBox="0 0 {width} {height}"
            role="img"
            aria-label={$_("admin_direct_mm_pnl_chart_title")}
            preserveAspectRatio="none"
        >
            <line
                x1={paddingX}
                x2={width - paddingX}
                y1={zeroY}
                y2={zeroY}
                class="text-base-content/20"
                stroke="currentColor"
                stroke-width="1"
            />
            <path
                d={areaPath}
                class={lineClass}
                fill="currentColor"
                opacity="0.12"
            />
            <path
                d={linePath}
                class={lineClass}
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            {#each points as point}
                <circle
                    cx={point.x}
                    cy={point.y}
                    r="2.5"
                    class={lineClass}
                    fill="currentColor"
                    opacity="0.85"
                />
            {/each}
        </svg>
    {/if}
</div>
