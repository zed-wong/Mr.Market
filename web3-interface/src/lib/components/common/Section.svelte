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

<section class="mt-8 first:mt-0">
  {#if eyebrow || title || caption || actions}
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
      <div class="flex flex-col gap-1">
        {#if eyebrow}
          <span class="eyebrow">{eyebrow}</span>
        {/if}
        {#if title}
          <span class="font-display text-xl md:text-2xl text-base-content">{title}</span>
        {/if}
        {#if caption}
          <span class="text-body-muted">{caption}</span>
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
