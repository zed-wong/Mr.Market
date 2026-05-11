<script lang="ts">  
  import Stats from "$lib/components/admin/health/stats.svelte";
  import Errors from "$lib/components/admin/health/errors.svelte";
</script>

<div class="p-4 sm:p-6 lg:p-8 space-y-6">
  <Stats />
  <Errors />
</div>
