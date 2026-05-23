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
</script>

{#if href}
  <a
    href={href}
    class="flex items-center justify-between gap-4 border-b border-base-300 py-5 transition-colors hover:bg-base-200/40"
    data-testid={testid}
  >
    <div class="flex min-w-0 flex-col">
      <div class="flex items-center gap-2">
        <span class="font-medium text-base-content">{label}</span>
        {#if badge}
          <span class="rounded-full border border-base-300 px-2 py-0.5 text-[10px] capitalize tracking-wider text-base-content/60">{badge}</span>
        {/if}
      </div>
      {#if sublabel}
        <span class="mt-0.5 text-xs text-base-content/50">{sublabel}</span>
      {/if}
    </div>
    <div class="flex flex-col items-end text-right">
      <span class="font-mono-num text-base text-base-content">{value}</span>
      {#if subvalue}
        <span class="mt-0.5 text-xs text-base-content/50">{subvalue}</span>
      {/if}
    </div>
  </a>
{:else}
  <div
    class="flex items-center justify-between gap-4 border-b border-base-300 py-5"
    data-testid={testid}
  >
    <div class="flex min-w-0 flex-col">
      <div class="flex items-center gap-2">
        <span class="font-medium text-base-content">{label}</span>
        {#if badge}
          <span class="rounded-full border border-base-300 px-2 py-0.5 text-[10px] capitalize tracking-wider text-base-content/60">{badge}</span>
        {/if}
      </div>
      {#if sublabel}
        <span class="mt-0.5 text-xs text-base-content/50">{sublabel}</span>
      {/if}
    </div>
    <div class="flex flex-col items-end text-right">
      <span class="font-mono-num text-base text-base-content">{value}</span>
      {#if subvalue}
        <span class="mt-0.5 text-xs text-base-content/50">{subvalue}</span>
      {/if}
    </div>
  </div>
{/if}
