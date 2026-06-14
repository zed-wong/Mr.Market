<script lang="ts">
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";
    import { createStrategyDefinition } from "$lib/helpers/mrm/admin/strategy";
    import { CONFIG_SCHEMA_TEMPLATES } from "$lib/helpers/admin/settings/strategies/configTemplates";
    import SchemaConfigForm from "./SchemaConfigForm.svelte";
    import type { StrategyDefinitionVisibility } from "$lib/types/hufi/strategy-definition";

    export let show = false;
    export let isSubmitting = false;
    export let onSuccess: () => void;
    export let onClose: () => void;

    let key = "";
    let name = "";
    let description = "";
    let controllerType = "pureMarketMaking";
    let configSchema: Record<string, unknown> = {};
    let defaultConfig: Record<string, unknown> = {};
    let visibility: StrategyDefinitionVisibility = "admin";
    let createdBy = "";

    let schemaError = false;
    let schemaText = "";
    let showSchemaEditor = false;
    let previousShow = false;

    const CONTROLLER_TYPES = [
        { value: "pureMarketMaking", labelKey: "admin_strategy_controller_market_making" },
        { value: "arbitrage", labelKey: "admin_strategy_controller_arbitrage" },
        { value: "volume", labelKey: "admin_strategy_controller_volume" },
        { value: "efficientDualAccountVolume", labelKey: "admin_direct_mm_strategy_efficient_dual_account_volume" },
        { value: "timeIndicator", labelKey: "admin_strategy_controller_time_indicator" },
    ];

    function getInitialSchema(type: string): Record<string, unknown> {
        const template = CONFIG_SCHEMA_TEMPLATES[type];
        return template ? JSON.parse(JSON.stringify(template)) : {};
    }

    function applyTemplate(type: string) {
        configSchema = getInitialSchema(type);
        schemaText = JSON.stringify(configSchema, null, 2);
        defaultConfig = {};
    }

    function handleControllerTypeChange(type: string) {
        controllerType = type;
        applyTemplate(type);
    }

    function reset() {
        key = "";
        name = "";
        description = "";
        controllerType = "pureMarketMaking";
        configSchema = {};
        schemaText = "";
        defaultConfig = {};
        visibility = "admin";
        createdBy = "";
        schemaError = false;
        showSchemaEditor = false;
    }

    function handleClose() {
        reset();
        onClose();
    }

    function handleSchemaTextChange() {
        schemaError = false;
        try {
            configSchema = JSON.parse(schemaText);
            schemaError = false;
        } catch {
            schemaError = true;
        }
    }

    async function handleSubmit() {
        if (schemaError || schemaText.trim() === "") {
            toast.error($_("admin_strategy_invalid_json"));
            return;
        }

        if (!key.trim() || !name.trim()) {
            toast.error($_("admin_strategy_required_fields"));
            return;
        }

        isSubmitting = true;

        try {
            await createStrategyDefinition(
                {
                    key: key.trim(),
                    name: name.trim(),
                    description: description.trim() || undefined,
                    controllerType,
                    configSchema,
                    defaultConfig,
                    visibility,
                    createdBy: createdBy.trim() || undefined,
                },
                getToken(),
            );

            toast.success($_("admin_strategy_definition_created"));
            reset();
            onSuccess();
        } catch (error) {
            toast.error($_("admin_strategy_create_failed"), {
                description: String(error),
            });
        } finally {
            isSubmitting = false;
        }
    }

    function getToken(): string {
        return localStorage.getItem("admin-access-token") || "";
    }

    $: {
        if (show && !previousShow) {
            applyTemplate(controllerType);
        }
        previousShow = show;
    }
</script>

<svelte:window
    on:keydown={(e) => show && e.key === "Escape" && handleClose()}
/>

{#if show}
    <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
        <div
            class="modal-box bg-base-100 p-0 rounded-2xl w-[calc(100vw-2rem)] max-w-[720px] shadow-2xl border border-base-300 max-h-[90vh] overflow-hidden"
        >
            <!-- Header -->
            <div class="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-base-200/70">
                <div class="flex items-start justify-between">
                    <div
                        class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="w-5 h-5 text-primary"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </div>
                    <button
                        class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
                        on:click={handleClose}
                        aria-label={$_("admin_strategy_cancel")}
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
                    >{$_("admin_strategy_new_definition")}</span
                >
                <span class="text-sm text-base-content/50 block mt-1"
                    >{$_("admin_strategy_create_description")}</span
                >
            </div>

            <!-- Form -->
            <div class="px-5 sm:px-7 py-5 flex max-h-[calc(90vh-156px)] flex-col gap-4 overflow-y-auto no-scrollbar">
                <!-- Key + Name row -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_key")} *</span
                        >
                        <input
                            type="text"
                            placeholder={$_("admin_strategy_key_placeholder")}
                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 font-mono"
                            bind:value={key}
                        />
                    </div>
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_name")} *</span
                        >
                        <input
                            type="text"
                            placeholder={$_("admin_strategy_name_placeholder")}
                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                            bind:value={name}
                        />
                    </div>
                </div>

                <!-- Description -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_strategy_description")}</span
                    >
                    <textarea
                        placeholder={$_("admin_strategy_description_placeholder")}
                        class="textarea textarea-bordered w-full bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300 resize-none h-20"
                        bind:value={description}
                    ></textarea>
                </div>

                <!-- Controller Type -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <span
                        class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                        >{$_("admin_strategy_controller_type")}</span
                    >
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {#each CONTROLLER_TYPES as type}
                            <button
                                class="flex items-center justify-center px-3 py-2.5 rounded-lg text-sm transition-colors border
                  {controllerType === type.value
                                    ? 'bg-primary/5 text-primary font-semibold border-primary/20'
                                    : 'text-base-content bg-base-300 hover:bg-base-300 border-transparent'}"
                                on:click={() =>
                                    handleControllerTypeChange(type.value)}
                            >
                                {$_(type.labelKey)}
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Config Schema -->
                <div class="bg-base-200/40 rounded-xl p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider"
                                >{$_("admin_strategy_config_schema")}</span
                            >
                            <p class="mt-1 text-xs text-base-content/45">
                                {$_("admin_strategy_schema_editor_hint")}
                            </p>
                        </div>
                        <div class="flex items-center gap-3">
                            <button
                                class="text-xs text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
                                on:click={() => applyTemplate(controllerType)}
                            >
                                {$_("admin_strategy_reset_to_template")}
                            </button>
                            <button
                                class="rounded-lg bg-base-100 px-3 py-1.5 text-xs font-semibold text-base-content shadow-sm border border-base-300"
                                on:click={() => (showSchemaEditor = !showSchemaEditor)}
                            >
                                {showSchemaEditor ? $_("admin_strategy_hide_schema") : $_("admin_strategy_edit_schema")}
                            </button>
                        </div>
                    </div>

                    {#if showSchemaEditor}
                        <textarea
                            class="textarea textarea-bordered mt-3 w-full bg-base-100 text-base-content text-sm font-mono focus:outline-none focus:border-primary border-base-300 resize-none h-36
                  {schemaError ? 'border-error' : ''}"
                            bind:value={schemaText}
                            on:input={handleSchemaTextChange}
                        ></textarea>
                        {#if schemaError}
                            <span class="text-xs text-error mt-1 block"
                                >{$_("admin_strategy_invalid_json")}</span
                            >
                        {/if}
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
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_visibility")}</span
                        >
                        <select
                            class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
                            bind:value={visibility}
                        >
                            <option value="public">{$_("admin_strategy_visibility_public")}</option>
                            <option value="admin">{$_("admin_strategy_visibility_admin")}</option>
                        </select>
                    </div>
                    <div class="flex-1 bg-base-200/40 rounded-xl p-4">
                        <span
                            class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
                            >{$_("admin_strategy_created_by")}</span
                        >
                        <input
                            type="text"
                            placeholder={$_("optional")}
                            class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                            bind:value={createdBy}
                        />
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="sticky bottom-0 flex gap-3 justify-end border-t border-base-200/70 bg-base-100 px-5 sm:px-7 py-4">
                <button
                    class="btn btn-ghost text-base-content font-semibold px-5"
                    on:click={handleClose}
                >
                    {$_("admin_strategy_cancel")}
                </button>
                <button
                    class="btn btn-primary text-primary-content font-semibold px-5 gap-2"
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
                    {$_("admin_strategy_create")}
                </button>
            </div>
        </div>
    </div>
{/if}
