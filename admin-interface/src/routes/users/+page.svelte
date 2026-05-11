<script lang="ts">
  import Search from "$lib/components/admin/users/search.svelte";
  import Table from '$lib/components/admin/users/table.svelte';
</script>

<div class="flex flex-col space-y-4 p-4 sm:p-6 lg:p-8">
  <Search />
  <Table />
</div>
