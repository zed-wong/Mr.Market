<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    document.documentElement.setAttribute('data-theme', 'landing-light');
  });
</script>

{@render children?.()}
