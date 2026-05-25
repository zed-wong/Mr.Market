<script lang="ts">
  import Slogan from "$lib/components/grow/marketMaking/initIntro/slogan.svelte";
  import IntroButtons from "$lib/components/grow/marketMaking/initIntro/introButtons.svelte";
  import BasicStats from "$lib/components/grow/marketMaking/baseSection/basicHuFiStats.svelte";
  import Loading from "$lib/components/common/loading.svelte";
  import Card from "$lib/components/grow/marketMaking/card.svelte";

  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { isFirstTimeMarketMaking } from "$lib/stores/market_making";
  import Bar from "$lib/components/grow/marketMaking/baseSection/bar.svelte";
  import BaseIntro from "$lib/components/grow/marketMaking/baseSection/baseIntro.svelte";
  const MARKET_MAKING_INTRO_KEY = "market-making-intro-seen";

  if (browser) {
    const hasSeenIntro =
      localStorage.getItem(MARKET_MAKING_INTRO_KEY) === "true";
    isFirstTimeMarketMaking.set(!hasSeenIntro);

    if (!hasSeenIntro) {
      localStorage.setItem(MARKET_MAKING_INTRO_KEY, "true");
    }
  }

  const normalizeOrders = (raw: unknown): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray((raw as any).data)) return (raw as any).data;
    return [];
  };
</script>

<!-- If not connected, show start market making, button redirect to connect wallet -->
<!-- If connected and first time user, show start market making, button go to market-making -->
{#if $isFirstTimeMarketMaking}
  <div class="flex flex-col grow space-y-0">
    <Slogan />
    <div class="">
      <IntroButtons />
    </div>
  </div>
{:else}
  {#await $page.data.campaign_stats}
    <div class="flex flex-col items-center justify-center grow h-screen">
      <Loading />
    </div>
  {:then data}
    <div class="flex flex-col grow space-y-0 mx-4">
      <BasicStats
        rewardsPool={data.rewards_pool_usd}
        activeCampaigns={data.n_active_campaigns}
      />

      <Bar />

      {#await $page.data.orders}
        <div class="flex flex-col items-center justify-center py-12">
          <Loading />
        </div>
      {:then ordersRaw}
        {@const orders = normalizeOrders(ordersRaw)}
        {#if orders.length === 0}
          <BaseIntro />
        {:else}
          <div class="flex flex-col space-y-3 mt-2">
            {#each orders as order (order.orderId)}
              <Card data={order} />
            {/each}
          </div>
        {/if}
      {/await}
    </div>
  {/await}
{/if}
