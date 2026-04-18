<script>
  import { _ } from "svelte-i18n";

  const campaignTypes = [
    {
      title: "hufi_learn_more_type_market_making_title",
      desc: "hufi_learn_more_type_market_making_desc",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>`,
    },
    {
      title: "hufi_learn_more_type_threshold_title",
      desc: "hufi_learn_more_type_threshold_desc",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>`,
    },
    {
      title: "hufi_learn_more_type_holding_title",
      desc: "hufi_learn_more_type_holding_desc",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" /></svg>`,
    },
  ];

  const faq = [
    {
      q: "hufi_learn_more_faq_what_is_hufi_q",
      a: "hufi_learn_more_faq_what_is_hufi_a",
    },
    { q: "hufi_learn_more_faq_problem_q", a: "hufi_learn_more_faq_problem_a" },
    {
      q: "hufi_learn_more_faq_how_it_works_q",
      a: "hufi_learn_more_faq_how_it_works_a",
    },
    { q: "hufi_learn_more_faq_benefit_q", a: "hufi_learn_more_faq_benefit_a" },
    { q: "hufi_learn_more_faq_safety_q", a: "hufi_learn_more_faq_safety_a" },
    { q: "hufi_learn_more_faq_join_q", a: "hufi_learn_more_faq_join_a" },
    { q: "hufi_learn_more_faq_create_q", a: "hufi_learn_more_faq_create_a" },
  ];
</script>

<div class="bg-base-100 min-h-screen pb-24" data-testid="hufi-learn-more">
  <div class="mx-auto w-full max-w-4xl px-4 pt-6">
    <div class="flex flex-col gap-2">
      <span class="text-2xl font-semibold text-base-content">{$_("hufi_learn_more_title")}</span>
      <span class="text-sm text-base-content/70 leading-relaxed">{$_("hufi_learn_more_intro")}</span>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <span class="text-base font-semibold text-base-content">{$_("hufi_learn_more_campaign_types_title")}</span>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {#each campaignTypes as type}
          <div class="bg-base-200 rounded-2xl p-4 flex flex-col gap-2">
            <div class="text-base-content">{@html type.icon}</div>
            <span class="text-sm font-semibold text-base-content">{$_(type.title)}</span>
            <span class="text-sm text-base-content/70 leading-relaxed">{$_(type.desc)}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <span class="text-base font-semibold text-base-content">{$_("hufi_learn_more_faq_title")}</span>

      {#each faq as item, i}
        <details class="collapse collapse-arrow bg-base-100 border border-base-200 rounded-2xl">
          <summary class="collapse-title">
            <span class="text-base font-medium text-base-content">{$_(item.q)}</span>
          </summary>
          <div class="collapse-content">
            <span class="text-sm text-base-content/70 leading-relaxed">{$_(item.a)}</span>
          </div>
        </details>
      {/each}
    </div>
  </div>
</div>
