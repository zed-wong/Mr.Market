<script lang="ts">
  import Spot from "$lib/components/admin/orders/spot.svelte";
  import Swap from "$lib/components/admin/orders/swap.svelte";
</script>

<div class="flex flex-col space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8">
  <Spot />
  <Swap />
</div>
