<script lang="ts">
  import type { UserResponse } from "@mixin.dev/mixin-node-sdk";
  import { _ } from "svelte-i18n";

  let users: UserResponse[] = [
    {
      type: "user",
      user_id: "27788c37-9139-4b6f-b535-488bda185dc1",
      identity_number: "25566",
      phone: "",
      full_name: "Human",
      biography: "",
      avatar_url:
        "https://images.mixin.one/HvYGJsV5TGeZ-X9Ek3FEQohQZ3fE9LBEBGcOcn4c4BNHovP4fW4YB97Dg5LcXoQ1hUjMEgjbl1DPlKg1TW7kK6XP=s128",
      relationship: "",
      mute_until: "",
      created_at: "2023-01-27 21:23:42",
      is_verified: false,
      is_scam: false,
      has_safe: false,
    },
    {
      type: "user",
      user_id: "27788c37-9139-4b6f-b535-488bda185dc1",
      identity_number: "25566",
      phone: "",
      full_name: "Human",
      biography: "",
      avatar_url:
        "https://images.mixin.one/96l-LTbahgBXnKfLRHtiQybyk9kpA-eVIMYnzs4twATFtIq3Ayvw5zRfhGrt5IOGqUxxJuFXINJMTNkRlWpnFVbsA4Ep6FAn0pWP=s128",
      relationship: "",
      mute_until: "",
      created_at: "2023-01-27 21:23:42",
      is_verified: false,
      is_scam: false,
      has_safe: false,
    },
    {
      type: "user",
      user_id: "27788c37-9139-4b6f-b535-488bda185dc1",
      identity_number: "25566",
      phone: "",
      full_name: "Human",
      biography: "",
      avatar_url:
        "https://images.mixin.one/-oE4Jsi3aMIkxUPUsvDozyL8D0ccmPkggIdIDu1z8THDQyJcCIsbNwC4amFBiRlkQiLNNjiuMBsNw8sAnehTuI0=s128",
      relationship: "",
      mute_until: "",
      created_at: "2023-01-27 21:23:42",
      is_verified: false,
      is_scam: false,
      has_safe: false,
    },
    {
      type: "user",
      user_id: "27788c37-9139-4b6f-b535-488bda185dc1",
      identity_number: "25566",
      phone: "",
      full_name: "Human",
      biography: "",
      avatar_url:
        "https://images.mixin.one/T0pGzs4lg7sIKIEIb1diV_8kbrG5R96dOQD7ukTwBmSxE_xwYayRihxQ2but5Ed3zOor9zcQ5Qq4bpyzVaj6FPxymRSc7fjC_l_E=s128",
      relationship: "",
      mute_until: "",
      created_at: "2023-01-27 21:23:42",
      is_verified: false,
      is_scam: false,
      has_safe: false,
    },
    {
      type: "user",
      user_id: "27788c37-9139-4b6f-b535-488bda185dc1",
      identity_number: "25566",
      phone: "",
      full_name: "Human",
      biography: "",
      avatar_url:
        "https://images.mixin.one/zVDjOxNTQvVsA8h2B4ZVxuHoCF3DJszufYKWpd9duXUSbSapoZadC7_13cnWBqg0EmwmRcKGbJaUpA8wFfpgZA=s128",
      relationship: "",
      mute_until: "",
      created_at: "2023-01-27 21:23:42",
      is_verified: false,
      is_scam: false,
      has_safe: false,
    },
  ];
</script>

<div class="grid grid-cols-1 2xl:grid-cols-2 xl:gap-4 my-4">
  <div class="card bg-base-100 border border-base-300 shadow-sm h-full">
    <div class="card-body p-4 sm:p-5">
    <div class="flex items-center justify-between mb-4">
      <span class="text-lg font-semibold leading-none text-base-content">{$_("latest_users")}</span>
      <a
        href="/manage/users"
        class="btn btn-ghost btn-sm normal-case"
      >
        {$_("view_all")}
      </a>
    </div>
    <div class="flow-root">
      <ul role="list" class="divide-y divide-base-300">
        {#each users as user}
          <li class="py-3 sm:py-4">
            <div class="flex items-center space-x-4">
              <div class="flex-shrink-0">
                <img
                  class="h-8 w-8 rounded-full"
                  src={user.avatar_url}
                  alt=""
                />
              </div>
              <div class="flex-1 min-w-0">
                <span class="block text-sm font-medium text-base-content truncate">
                  {user.full_name}
                </span>
                <span class="block text-sm text-base-content/60 truncate">
                  {user.identity_number}
                </span>
              </div>
              <div class="inline-flex items-center text-base text-base-content">
                {user.created_at}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </div>
  </div>
</div>
