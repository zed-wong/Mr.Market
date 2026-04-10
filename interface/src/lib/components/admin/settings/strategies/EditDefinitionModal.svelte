<script lang="ts">
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import { updateStrategyDefinition } from "$lib/helpers/mrm/admin/strategy";
    import SchemaConfigForm from "./SchemaConfigForm.svelte";
    import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";

    export let show = false;
    export let definition: StrategyDefinition | null = null;
    export let isSubmitting = false;
    export let onSuccess: () => void;
    export let onClose: () => void;

    let name = "";
    let description = "";
    let configSchema: Record<string, unknown> = {};
    let defaultConfig: Record<string, unknown> = {};
    let visibility = "system";
    let createdBy = "";

    let schemaOpen = false;

    $: if (definition) {
        name = definition.name || "";
        description = definition.description || "";
        configSchema =
            (definition.configSchema as Record<string, unknown>) || {};
        defaultConfig =
            (definition.defaultConfig as Record<string, unknown>) || {};
        visibility = definition.visibility || "system";
        createdBy = definition.createdBy || "";
        schemaOpen = false;
    }

    function handleClose() {
        onClose();
    }

    async function handleSubmit() {
        if (!definition) return;

        if (!name.trim()) {
            toast.error($_("admin_strategy_required_fields"));
            return;
        }

        isSubmitting = true;

        try {
            await updateStrategyDefinition(
                definition.id,
                {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    defaultConfig,
                    visibility,
                    createdBy: createdBy.trim() || undefined,
                },
                getToken(),
            );

            toast.success($_("admin_strategy_definition_updated"));
            onSuccess();
        } catch (error) {
            toast.error($_("admin_strategy_update_failed"), {
                description: String(error),
            });
        } finally {
            isSubmitting = false;
        }
    }

    function getToken(): string {
        return localStorage.getItem("admin-access-token") || "";
    }
</script>

<svelte:window
    on:keydown={(e) => show && e.key === "Escape" && handleClose()}
/>

{#if show && definition}
    <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
        <div
            class="modal-box bg-base-100 p-0 rounded-2xl max-w-[640px] shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto no-scrollbar"
        >
            <!-- Header -->
            <div class="px-7 pt-6 pb-4">
                <div class="flex items-start justify-between">
                    <div
                        class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="w-5 h-5 text-primary"
                        >
                            <path
                                d="m15.232 5.232 3.536 3.536m-2.036-5.036a2.5 2.5 0 1 1 3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                        </svg>
                    </div>
                    <button
                        class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
                        on:click={handleClose}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="w-5 h-5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
                <span class="text-xl font-bold text-base-content block mt-3"
                    >{$_("admin_strategy_edit_definition")}</span
                >
                <span
                    class="text-sm text-base-content/50 block mt-1 font-mono bg-base-200/60 px-2 py-0.5 rounded inline-block"
                >
                    {definition.key}
                </span>
            </div>

            <!-- Form -->
            <div class="px-7 pb-7 flex flex-col gap-4">
                <!-- Name -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_strategy_name")} *</span
                    >
                    <input
                        type="text"
                        class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                        bind:value={name}
                    />
                </div>

                <!-- Description -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_strategy_description")}</span
                    >
                    <textarea
                        class="textarea textarea-bordered w-full bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 resize-none h-20"
                        bind:value={description}
                    ></textarea>
                </div>

                <!-- Config Schema (read-only, collapsible) -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <div class="flex items-center justify-between mb-2">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider"
                            >{$_("admin_strategy_config_schema")}</span
                        >
                        <button
                            class="text-xs text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer flex items-center gap-1"
                            on:click={() => (schemaOpen = !schemaOpen)}
                        >
                            {#if schemaOpen}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path d="m18 15-6-6-6 6" /></svg
                                >
                                Hide
                            {:else}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path d="m6 9 6 6 6-6" /></svg
                                >
                                View
                            {/if}
                        </button>
                    </div>
                    {#if schemaOpen}
                        <pre
                            class="text-xs text-base-content/70 font-mono bg-base-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(
                                configSchema,
                                null,
                                2,
                            )}</pre>
                    {/if}
                </div>

                <!-- Default Config — form-based editor -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-3"
                        >{$_("admin_strategy_default_config")}</span
                    >
                    <SchemaConfigForm
                        schema={configSchema}
                        bind:config={defaultConfig}
                    />
                </div>

                <!-- Visibility + CreatedBy row -->
                <div class="flex gap-3">
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_visibility")}</span
                        >
                        <select
                            class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                            bind:value={visibility}
                        >
                            <option value="system">System</option>
                            <option value="public">Public</option>
                        </select>
                    </div>
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_created_by")}</span
                        >
                        <input
                            type="text"
                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                            bind:value={createdBy}
                        />
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex gap-3 justify-end mt-2">
                    <button
                        class="btn btn-ghost text-base-content font-semibold px-6"
                        on:click={handleClose}
                    >
                        {$_("admin_strategy_cancel")}
                    </button>
                    <button
                        class="btn btn-primary text-primary-content font-semibold px-6 gap-2"
                        on:click={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {#if isSubmitting}
                            <span class="loading loading-spinner loading-sm"
                            ></span>
                        {:else}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                class="w-4 h-4"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                                />
                            </svg>
                        {/if}
                        {$_("admin_strategy_save")}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
