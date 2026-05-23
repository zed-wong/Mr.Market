<script lang="ts">
  interface Props {
    label: string;
    sublabel?: string;
    value: string;
    subvalue?: string;
    href?: string;
    badge?: string;
    testid?: string;
  }

  let { label, sublabel, value, subvalue, href, badge, testid }: Props = $props();

  const rowClass = 'flex items-center justify-between gap-4 card-surface px-4 py-3.5 mb-2 last:mb-0';
</script>

{#if href}
  <a href={href} class="{rowClass} card-hover" data-testid={testid}>
    <div class="flex min-w-0 flex-col">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-base-content">{label}</span>
        {#if badge}
          <span class="rounded-full bg-base-100 px-2 py-0.5 text-[10px] font-medium capitalize tracking-tight text-base-content/60">{badge}</span>
        {/if}
      </div>
      {#if sublabel}
        <span class="mt-0.5 text-xs text-base-content/55">{sublabel}</span>
      {/if}
    </div>
    <div class="flex flex-col items-end text-right">
      <span class="font-mono-num font-semibold text-base-content">{value}</span>
      {#if subvalue}
        <span class="mt-0.5 text-xs text-base-content/55">{subvalue}</span>
      {/if}
    </div>
  </a>
{:else}
  <div class="{rowClass}" data-testid={testid}>
    <div class="flex min-w-0 flex-col">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-base-content">{label}</span>
        {#if badge}
          <span class="rounded-full bg-base-100 px-2 py-0.5 text-[10px] font-medium capitalize tracking-tight text-base-content/60">{badge}</span>
        {/if}
      </div>
      {#if sublabel}
        <span class="mt-0.5 text-xs text-base-content/55">{sublabel}</span>
      {/if}
    </div>
    <div class="flex flex-col items-end text-right">
      <span class="font-mono-num font-semibold text-base-content">{value}</span>
      {#if subvalue}
        <span class="mt-0.5 text-xs text-base-content/55">{subvalue}</span>
      {/if}
    </div>
  </div>
{/if}
