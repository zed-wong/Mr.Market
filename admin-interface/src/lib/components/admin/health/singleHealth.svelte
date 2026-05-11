<script lang="ts">
  import { _ } from "svelte-i18n";

  export let health = { name: "ping", state: "alive" }
</script>

<div class="stats shadow">  
  <div class="stat">
    <div class="stat-title">
      <span class="capitalize">{$_(health.name)}</span>
    </div>
    {#if health.state === 'alive'}
      <div class="stat-value text-green-500 my-1 mr-2">{$_(health.state)}</div>
    {:else}
      <div class="stat-value text-red-500 my-1 mr-2">{$_(health.state)}</div>
    {/if}
  </div>
</div>