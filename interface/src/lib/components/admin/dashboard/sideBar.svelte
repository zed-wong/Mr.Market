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
                on:click={() => goto("/manage")}
            >
                <div class="avatar placeholder">
                    <div
                        class="bg-primary text-primary-content rounded-lg w-10 flex items-center justify-center"
                    >
                        <span class="text-xl font-bold">A</span>
                    </div>
                </div>
                <span class="text-lg font-bold text-base-content"
                    >{$_("admin")}</span
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
                <span class="text-sm">{$_("toggle_theme")}</span>
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
        <p class="py-3 text-sm text-base-content/70">{$_("exit_admin_message")}</p>
        <div class="modal-action">
            <button class="btn btn-ghost" on:click={() => exitDialogEl?.close()}>
                {$_("cancel")}
            </button>
            <button class="btn btn-error" on:click={confirmExit}>{$_("exit")}</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button aria-label="close">close</button>
    </form>
</dialog>
