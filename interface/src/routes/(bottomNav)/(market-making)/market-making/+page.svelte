<script lang="ts">
  import Slogan from "$lib/components/grow/marketMaking/initIntro/slogan.svelte";
  import IntroButtons from "$lib/components/grow/marketMaking/initIntro/introButtons.svelte";
  import BasicStats from "$lib/components/grow/marketMaking/baseSection/basicHuFiStats.svelte";
  import Loading from "$lib/components/common/loading.svelte";

  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { mixinConnected } from "$lib/stores/home";
  import { isFirstTimeMarketMaking } from "$lib/stores/market_making";
  import Bar from "$lib/components/grow/marketMaking/baseSection/bar.svelte";
  import BaseIntro from "$lib/components/grow/marketMaking/baseSection/baseIntro.svelte";
  import { _ } from "svelte-i18n";

  const MARKET_MAKING_INTRO_KEY = "market-making-intro-seen";

  if (browser) {
    const hasSeenIntro =
      localStorage.getItem(MARKET_MAKING_INTRO_KEY) === "true";
    isFirstTimeMarketMaking.set(!hasSeenIntro);

    if (!hasSeenIntro) {
      localStorage.setItem(MARKET_MAKING_INTRO_KEY, "true");
    }
  }
</script>

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
      <BaseIntro />

      <div class="mt-4 p-4 bg-base-200 rounded-2xl">
        <div class="flex items-center justify-between mb-3">
          <span class="font-semibold text-base text-base-content">{$_("hufi_your_orders")}</span>
        </div>
        <div class="flex flex-col items-center justify-center py-8 text-base-content/50">
          <span class="text-sm mb-3">{$_("hufi_no_orders_yet")}</span>
          <a href="/market-making/hufi" class="btn btn-sm btn-primary text-base-100">{$_("hufi_browse_campaigns")}</a>
        </div>
      </div>
    </div>
  {/await}
{/if}
