<script>
  import { _ } from "svelte-i18n";

  const cards = [
    {
      key: "total_users",
      value: "2,340",
      change: "+14.6%",
      changeClass: "text-success",
      icon: "M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z",
    },
    {
      key: "active_users",
      value: "2,230",
      change: "+32.9%",
      changeClass: "text-success",
      icon: "M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z",
    },
    {
      key: "user_signups_this_week",
      value: "385",
      change: "-2.7%",
      changeClass: "text-error",
      icon: "M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z",
    },
  ];
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
  {#each cards as card}
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 md:p-6 gap-4">
        <span class="text-sm text-base-content/60">{$_(card.key)}</span>
        <div class="flex items-center justify-between gap-3">
          <span class="text-2xl sm:text-3xl leading-none font-bold text-base-content">{card.value}</span>
          <span class={`inline-flex items-center gap-1 text-sm font-semibold ${card.changeClass}`}>
            {card.change}
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" d={card.icon} clip-rule="evenodd"></path>
            </svg>
          </span>
        </div>
      </div>
    </div>
  {/each}
</div>
