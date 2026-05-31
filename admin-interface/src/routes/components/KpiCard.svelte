<script lang="ts">
  import Sparkline from './Sparkline.svelte';

  interface Props {
    label: string;
    value: string;
    unit?: string;
    deltaPct?: number;
    series?: number[];
    tone?: 'neutral' | 'success' | 'warning' | 'error';
  }

  let { label, value, unit, deltaPct = 0, series = [], tone = 'neutral' }: Props = $props();

  let positive = $derived(deltaPct >= 0);
  let deltaText = $derived(
    `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`,
  );
</script>

<div class="card-surface card-hover anim-card-enter p-5">
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="eyebrow">{label}</span>
      {#if deltaPct !== 0}
        <span
          class="font-mono-num text-xs"
          class:text-success={positive}
          class:text-error={!positive}
        >
          {deltaText}
        </span>
      {/if}
    </div>

    <div class="flex items-baseline gap-1.5">
      <span
        class="font-mono-num text-2xl font-semibold tracking-tight md:text-3xl"
        class:text-base-content={tone === 'neutral'}
        class:text-success={tone === 'success'}
        class:text-warning={tone === 'warning'}
        class:text-error={tone === 'error'}
      >
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
    {/if}
  </div>
</div>
