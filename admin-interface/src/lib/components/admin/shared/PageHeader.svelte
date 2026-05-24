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

<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
  <div class="flex flex-col gap-1">
    {#if eyebrow}
      <span class="eyebrow">{eyebrow}</span>
    {/if}
    <span class="font-display text-3xl text-base-content md:text-4xl capitalize">
      {title}
    </span>
    {#if subtitle}
      <span class="text-body-muted max-w-3xl">{subtitle}</span>
    {/if}
  </div>

  {#if actions}
    <div class="flex flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
