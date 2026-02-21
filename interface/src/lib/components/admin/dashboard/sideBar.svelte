<script lang="ts">
    import clsx from "clsx";
    import { _ } from "svelte-i18n";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { exit } from "$lib/helpers/mrm/admin";
    import { darkTheme, toggleTheme } from "$lib/stores/theme";
    import SideBarIcons from "./sideBarIcons.svelte";
    import { buildAdminSidebarMenu } from "./sidebar-menu";

    export let sidebarOpen = false;
    let currentPath = "/";
    let activeKey = "";
    let exitDialogEl: HTMLDialogElement | null = null;

    $: currentPath = $page.url.pathname.replace(/\/+$/, "") || "/";

    const closeSidebarOnMobile = () => {
        if (window.matchMedia("(max-width: 1023px)").matches) {
            sidebarOpen = false;
        }
    };

    const openExitDialog = () => {
        exitDialogEl?.showModal();
    };

    const confirmExit = () => {
        exitDialogEl?.close();
        closeSidebarOnMobile();
        exit();
    };

    const items = buildAdminSidebarMenu().map((item) => ({
        ...item,
        fn: () => {
            goto(item.value);
            closeSidebarOnMobile();
        },
        children: item.children?.map((child) => ({
            ...child,
            fn: () => {
                goto(child.value);
                closeSidebarOnMobile();
            },
        })),
    }));

    $: {
        activeKey = "";

        if (currentPath === "/manage") {
            activeKey = "dashboard";
        }

        const settings = items.find((item) => item.key === "settings");
        if (settings) {
            const activeChild = settings.children?.find(
                (child) =>
                    currentPath === child.value ||
                    currentPath.startsWith(`${child.value}/`),
            );

            if (activeChild) {
                activeKey = activeChild.key;
            } else if (
                currentPath === settings.value ||
                currentPath.startsWith(`${settings.value}/`)
            ) {
                activeKey = "settings";
            }
        }
    }
</script>

<button
    type="button"
    aria-label="close sidebar backdrop"
    class={clsx(
        "fixed inset-0 z-30 bg-base-content/40 transition-opacity duration-300 lg:hidden",
        sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
    )}
    on:click={() => (sidebarOpen = false)}
></button>

<aside
    id="sidebar"
    class={clsx(
        "fixed top-0 left-0 z-40 h-screen w-72 shrink-0 transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
    )}
    aria-label="Sidebar"
>
    <div
        class="relative flex h-full flex-1 flex-col border-r border-base-300 bg-base-100"
    >
        <div
            class="flex items-center justify-between border-base-300 px-5 py-4"
        >
            <button
                class="flex items-center gap-3"
                on:click={() => goto("/manage/settings")}
            >
                <div class="avatar placeholder">
                    <div
                        class="text-primary-content rounded-lg w-10 flex items-center justify-center"
                    >
                        <svg
                            class="w-8"
                            viewBox="0 0 142 151"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><g filter="url(#filter0_d_516_15834)"
                                ><path
                                    fill-rule="evenodd"
                                    clip-rule="evenodd"
                                    d="M61.5693 11.1915C61.5693 8.82375 63.4459 6.9043 65.7607 6.9043H76.2392C78.554 6.9043 80.4305 8.82375 80.4305 11.1915V34.7712H82.5262V21.9096C82.5262 19.5418 84.4028 17.6223 86.7176 17.6223H95.1004C97.4152 17.6223 99.2918 19.5418 99.2918 21.9096V34.8466C113.12 35.8448 124.302 46.6444 126.239 60.4945H128.631C132.104 60.4945 134.918 63.3737 134.918 66.9254V84.0742C134.918 87.6259 132.104 90.5051 128.631 90.5051H126.239C124.205 105.049 111.977 116.228 97.1961 116.228H80.4305V139.808C80.4305 142.176 78.554 144.095 76.2392 144.095H65.7607C63.4459 144.095 61.5693 142.176 61.5693 139.808V116.228H59.4737V124.803C59.4737 127.171 57.5971 129.09 55.2823 129.09H46.8995C44.5847 129.09 42.7081 127.171 42.7081 124.803V116.153C28.8803 115.155 17.6981 104.355 15.7613 90.5051H13.3685C9.89624 90.5051 7.08142 87.6259 7.08142 84.0742V66.9254C7.08142 63.3737 9.89624 60.4945 13.3685 60.4945H15.7613C17.7951 45.951 30.0231 34.7712 44.8038 34.7712H61.5693V11.1915ZM97.1961 45.4893H44.8038C34.3871 45.4893 25.9426 54.1268 25.9426 64.7817V86.2178C25.9426 96.8728 34.3871 105.51 44.8038 105.51H97.1961C107.613 105.51 116.057 96.8728 116.057 86.2178V64.7817C116.057 54.1268 107.613 45.4893 97.1961 45.4893ZM61.5693 75.4998C61.5693 81.4192 56.878 86.2178 51.0909 86.2178C45.3038 86.2178 40.6125 81.4192 40.6125 75.4998C40.6125 69.5804 45.3038 64.7817 51.0909 64.7817C56.878 64.7817 61.5693 69.5804 61.5693 75.4998ZM93.0047 86.2178C98.7918 86.2178 103.483 81.4192 103.483 75.4998C103.483 69.5804 98.7918 64.7817 93.0047 64.7817C87.2176 64.7817 82.5262 69.5804 82.5262 75.4998C82.5262 81.4192 87.2176 86.2178 93.0047 86.2178Z"
                                    fill="url(#paint0_linear_516_15834)"
                                /></g
                            ><defs
                                ><filter
                                    id="filter0_d_516_15834"
                                    x="0.845467"
                                    y="0.668343"
                                    width="140.309"
                                    height="149.663"
                                    filterUnits="userSpaceOnUse"
                                    color-interpolation-filters="sRGB"
                                    ><feFlood
                                        flood-opacity="0"
                                        result="BackgroundImageFix"
                                    /><feColorMatrix
                                        in="SourceAlpha"
                                        type="matrix"
                                        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                                        result="hardAlpha"
                                    /><feOffset /><feGaussianBlur
                                        stdDeviation="3.11798"
                                    /><feComposite
                                        in2="hardAlpha"
                                        operator="out"
                                    /><feColorMatrix
                                        type="matrix"
                                        values="0 0 0 0 0.121568 0 0 0 0 0.160784 0 0 0 0 0.215687 0 0 0 0.14 0"
                                    /><feBlend
                                        mode="normal"
                                        in2="BackgroundImageFix"
                                        result="effect1_dropShadow_516_15834"
                                    /><feBlend
                                        mode="normal"
                                        in="SourceGraphic"
                                        in2="effect1_dropShadow_516_15834"
                                        result="shape"
                                    /></filter
                                ><linearGradient
                                    id="paint0_linear_516_15834"
                                    x1="10.1994"
                                    y1="34.9661"
                                    x2="125.565"
                                    y2="123.828"
                                    gradientUnits="userSpaceOnUse"
                                    ><stop stop-color="#4338CA" /><stop
                                        offset="1"
                                        stop-color="#211C64"
                                    /></linearGradient
                                ></defs
                            ></svg
                        >
                    </div>
                </div>
                <span class="text-lg font-bold text-base-content"
                    >{$_("Mr.Market")}</span
                >
            </button>

            <button
                class="btn btn-ghost btn-sm lg:hidden"
                on:click={() => (sidebarOpen = false)}
                aria-label="close sidebar"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-5 h-5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-4">
            <div class="mb-3 px-2">
                <span class="text-xs font-semibold text-base-content/50"
                    >{$_("menu")}</span
                >
            </div>
            <ul class="menu menu-sm gap-1">
                {#each items as item}
                    <li>
                        <button
                            on:click={() => item.fn()}
                            class={clsx(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-base-content/70 transition-colors",
                                activeKey === item.key
                                    ? "bg-primary/12 text-primary"
                                    : "hover:bg-base-200 hover:text-base-content",
                            )}
                        >
                            <SideBarIcons name={item.icon} />
                            <span class="font-medium">{$_(item.labelKey)}</span>
                        </button>

                        {#if item.children?.length}
                            <ul class="mt-1 space-y-1 pl-10">
                                {#each item.children as child}
                                    <li>
                                        <button
                                            on:click={() => child.fn()}
                                            class={clsx(
                                                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                                activeKey === child.key
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-base-content/60 hover:bg-base-200 hover:text-base-content",
                                            )}
                                        >
                                            {$_(child.labelKey)}
                                        </button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </li>
                {/each}
            </ul>
        </div>

        <div class="border-t border-base-300 px-3 py-4">
            <button
                on:click={toggleTheme}
                class="btn btn-ghost btn-sm w-full justify-start gap-3 normal-case"
            >
                {#if !$darkTheme}
                    <!-- Sun icon for light mode -->
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-5 h-5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                        />
                    </svg>
                {:else}
                    <!-- Moon icon for dark mode -->
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-5 h-5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                        />
                    </svg>
                {/if}
                <span class="text-sm text-base-content/60"
                    >{$_("toggle_theme")}</span
                >
            </button>

            <button
                on:click={openExitDialog}
                class="btn btn-ghost btn-sm w-full justify-start gap-3 normal-case text-error hover:bg-error/10 mt-1"
            >
                <SideBarIcons name="exit" />
                <span class="text-sm">{$_("exit")}</span>
            </button>
        </div>
    </div>
</aside>

<dialog bind:this={exitDialogEl} class="modal modal-bottom sm:modal-middle">
    <div class="modal-box">
        <h3 class="font-semibold text-lg">{$_("exit_admin_title")}</h3>
        <p class="py-3 text-sm text-base-content/70">
            {$_("exit_admin_message")}
        </p>
        <div class="modal-action">
            <button
                class="btn btn-ghost"
                on:click={() => exitDialogEl?.close()}
            >
                {$_("cancel")}
            </button>
            <button class="btn btn-error" on:click={confirmExit}
                >{$_("exit")}</button
            >
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button aria-label="close">close</button>
    </form>
</dialog>
