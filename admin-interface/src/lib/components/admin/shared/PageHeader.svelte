<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    actions?: Snippet;
  }

  let { eyebrow, title, subtitle, actions }: Props = $props();
</script>

<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
  <div class="flex flex-col gap-1">
    {#if eyebrow}
      <span class="text-xs font-medium text-base-content/50 capitalize tracking-wide">{eyebrow}</span>
    {/if}
    <span class="text-2xl font-semibold tracking-tight text-base-content md:text-3xl capitalize">
      {title}
    </span>
    {#if subtitle}
      <span class="text-sm text-base-content/60">{subtitle}</span>
    {/if}
  </div>

  {#if actions}
    <div class="flex items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
