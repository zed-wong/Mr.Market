<script lang="ts">
  import Sparkline from './Sparkline.svelte';

  interface Props {
    label: string;
    value: string;
    unit?: string;
    deltaPct?: number;
    series?: number[];
  }

  let { label, value, unit, deltaPct = 0, series = [] }: Props = $props();

  let positive = $derived(deltaPct >= 0);
  let deltaText = $derived(
    `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`,
  );
</script>

<div class="card border border-base-300 bg-base-100 shadow-none">
  <div class="card-body gap-3 p-5">
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium text-base-content/60 capitalize tracking-wide">{label}</span>
      {#if deltaPct !== 0}
        <span
          class="font-mono text-xs"
          class:text-success={positive}
          class:text-error={!positive}
        >
          {deltaText}
        </span>
      {:else}
        <span class="font-mono text-xs text-base-content/40">—</span>
      {/if}
    </div>

    <div class="flex items-baseline gap-1.5">
      <span class="font-mono text-2xl font-semibold tracking-tight text-base-content md:text-3xl">
        {value}
      </span>
      {#if unit}
        <span class="text-xs text-base-content/50">{unit}</span>
      {/if}
    </div>

    {#if series.length > 1}
      <div class="h-9">
        <Sparkline values={series} {positive} width={240} height={36} />
      </div>
    {:else}
      <span class="text-xs text-base-content/40 capitalize">trend unavailable</span>
    {/if}
  </div>
</div>
