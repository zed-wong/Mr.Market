<script>
    import clsx from "clsx";
    import { _ } from "svelte-i18n";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    const links = [
        {
            name: "exchanges",
            path: "/manage/settings/exchanges",
            // Bank/Building icon
            icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z",
        },
        {
            name: "spot_trading",
            path: "/manage/settings/spot-trading",
            // Candlestick Chart icon
            icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
        },
        {
            name: "market_making",
            path: "/manage/settings/market-making",
            // Market Making icon
            icon: "M2,19.99l7.5-7.51l4,4l7.09-7.97L22,9.92l-8.5,9.56l-4-4l-6,6.01L2,19.99z M3.5,15.49l6-6.01l4,4L22,3.92l-1.41-1.41 l-7.09,7.97l-4-4L2,13.99L3.5,15.49z",
            filled: true,
        },
        {
            name: "fees",
            path: "/manage/settings/fees",
            // Percentage/Ticket icon
            icon: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
        },
        {
            name: "strategies",
            path: "/manage/settings/strategies",
            icon: "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h5.25M3.75 3h11.25A2.25 2.25 0 0 1 17.25 5.25v5.25M3.75 3 9 8.25m8.25 8.25L21 20.25m0 0-3.75 3.75M21 20.25l-3.75-3.75",
        },
        {
            name: "api_keys",
            path: "/manage/settings/api-keys",
            // Key icon
            icon: "M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z",
        },
    ];
</script>

<div class="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-7xl mx-auto">
    <div class="flex flex-col space-y-2 text-start items-start justify-center">
        <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary">
            {$_("settings")}
        </span>
        <span class="text-base-content/60">
            {$_("manage_your_application_configuration")}
        </span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {#each links as link}
            <button
                on:click={() => goto(link.path)}
                class="card bg-base-100 shadow hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border border-base-200 cursor-pointer text-left"
            >
                <div
                    class="card-body p-4 sm:p-6 flex-row items-center gap-4 sm:gap-5"
                >
                    <div
                        class="p-3 rounded-xl {link.name === 'exchanges'
                            ? 'bg-blue-100 text-blue-600'
                            : link.name === 'spot_trading'
                              ? 'bg-purple-100 text-purple-600'
                            : link.name === 'market_making'
                                ? 'bg-purple-100 text-purple-600'
                              : link.name === 'fees'
                                  ? 'bg-green-100 text-green-600'
                                  : link.name === 'strategies'
                                    ? 'bg-orange-100 text-orange-600'
                                  : 'bg-yellow-100 text-yellow-600'}"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill={link.filled ? "currentColor" : "none"}
                            viewBox="0 0 24 24"
                            stroke-width={link.filled ? "0" : "1.5"}
                            stroke={link.filled ? "none" : "currentColor"}
                            class="w-7 h-7"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d={link.icon}
                            />
                        </svg>
                    </div>
                    <div class="space-y-1 flex-1">
                        <h2 class="font-bold text-lg">
                            {$_(link.name)}
                        </h2>
                        <p class="text-sm text-base-content/60">
                            {$_(`manage_${link.name}`)}
                        </p>
                    </div>
                </div>
            </button>
        {/each}
    </div>
</div>
