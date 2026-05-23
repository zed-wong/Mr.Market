<script lang="ts">
  interface Props {
    title?: string;
    eyebrow?: string;
    caption?: string;
    children?: any;
    actions?: any;
    divider?: boolean;
  }

  let { title, eyebrow, caption, children, actions, divider = true }: Props = $props();
</script>

<section class="pt-10 first:pt-0 {divider ? 'mt-10 first:mt-0 border-t border-base-300 first:border-t-0' : ''}">
  {#if eyebrow || title || caption || actions}
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        {#if eyebrow}
          <span class="eyebrow">{eyebrow}</span>
        {/if}
        {#if title}
          <span class="font-display text-2xl md:text-3xl tracking-tight text-base-content">{title}</span>
        {/if}
        {#if caption}
          <span class="text-sm text-base-content/60">{caption}</span>
        {/if}
      </div>
      {#if actions}
        <div class="flex items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/if}
  {@render children?.()}
</section>
