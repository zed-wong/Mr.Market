<script>
    import clsx from "clsx";
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import { page } from "$app/stores";
    import { correct, showTokenExpired } from "$lib/stores/admin";
    import Login from "$lib/components/admin/login.svelte";
    import { autoCheckPassword, exit } from "$lib/helpers/mrm/admin";
    import SideBar from "$lib/components/admin/dashboard/sideBar.svelte";
    import { darkTheme } from "$lib/stores/theme";
    import { toAdminTheme } from "$lib/theme/themes";
    let sidebarOpen = false;
    /** @type {HTMLDialogElement | undefined} */
    let tokenExpiredDialogEl;

    $: if ($showTokenExpired && tokenExpiredDialogEl) {
        tokenExpiredDialogEl.showModal();
    }

    const confirmTokenExpired = () => {
        tokenExpiredDialogEl?.close();
        showTokenExpired.set(false);
        exit();
    };

    $: adminTheme = toAdminTheme($darkTheme);

    onMount(() => {
        autoCheckPassword($page.url.pathname);

        const mediaQuery = window.matchMedia("(min-width: 1024px)");
        const syncSidebarState = () => {
            sidebarOpen = mediaQuery.matches;
        };

        syncSidebarState();
        mediaQuery.addEventListener("change", syncSidebarState);

        return () => {
            mediaQuery.removeEventListener("change", syncSidebarState);
        };
    });
</script>

<main class="px-0! py-0! min-h-screen bg-base-200" data-theme={adminTheme}>
    {#if $correct}
        <div class="flex h-screen overflow-hidden bg-base-200">
            <SideBar bind:sidebarOpen />

            <div
                class={clsx(
                    "relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-[margin] duration-300",
                    sidebarOpen ? "lg:ml-72" : "lg:ml-0",
                )}
            >
                <header
                    class="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur"
                >
                    <div class="flex items-center gap-3 px-3 py-3 sm:px-4 md:px-6">
                        <button
                            class="btn btn-ghost btn-sm"
                            on:click={() => (sidebarOpen = !sidebarOpen)}
                            aria-label={sidebarOpen ? "close sidebar" : "open sidebar"}
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
                                    d="M3.75 6.75h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5"
                                />
                            </svg>
                        </button>

                    </div>
                </header>

                <div class="flex-1">
                    <div class="mx-auto w-full max-w-screen-2xl p-4 md:p-6 2xl:p-8">
                        <slot />
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="h-screen flex justify-center items-center">
            <Login />
        </div>
    {/if}

    <dialog bind:this={tokenExpiredDialogEl} class="modal modal-bottom sm:modal-middle">
        <div class="modal-box rounded-2xl p-8">
            <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-primary">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 14.652" />
                </svg>
            </div>
            <span class="text-xl font-bold text-base-content">{$_("token_expired_title")}</span>
            <p class="pt-3 pb-6 text-sm text-base-content/60 leading-relaxed">
                {$_("token_expired_message")}
            </p>
            <div class="flex items-center gap-3 justify-end">
                <button
                    class="btn btn-ghost text-primary font-semibold"
                    on:click={() => { tokenExpiredDialogEl?.close(); showTokenExpired.set(false); }}
                >
                    {$_("cancel")}
                </button>
                <button class="btn btn-primary rounded-xl px-8" on:click={confirmTokenExpired}>
                    {$_("login_again")}
                </button>
            </div>
        </div>
    </dialog>
</main>
