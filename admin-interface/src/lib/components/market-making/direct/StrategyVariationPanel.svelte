<script lang="ts">
    import { _ } from "svelte-i18n";
    import type {
        DirectVariationFieldMetadata,
        DirectVariationMetadata,
    } from "$lib/types/hufi/admin-direct-market-making";
    import {
        buildDirectVariationConfigOverrides,
        getDirectVariationEditableFields,
        initializeDirectVariationFormValues,
    } from "$lib/helpers/market-making/direct/helpers";

    export let metadata: DirectVariationMetadata | null = null;
    export let loading = false;
    export let error: string | null = null;
    export let saving = false;
    export let saveError: string | null = null;
    export let onSave: (configOverrides: Record<string, unknown>) => void | Promise<void> =
        async () => {};

    let formValues: Record<string, string | boolean> = {};
    let initializedSignature = "";
    let localValidationError = "";

    function fieldSignature(nextMetadata: DirectVariationMetadata | null): string {
        if (!nextMetadata) return "";

        return `${nextMetadata.orderId}:${nextMetadata.state}:${nextMetadata.fields
            .map((field) => `${field.key}:${String(field.currentValue)}`)
            .join("|")}`;
    }

    $: editableFields = getDirectVariationEditableFields(metadata);
    $: isEditable = Boolean(metadata?.editable);
    $: disabled = !isEditable || saving;
    $: editabilityMessage =
        metadata?.editability?.reason === "order_not_paused"
            ? $_("admin_direct_mm_variation_active_disabled")
            : "";
    $: {
        const nextSignature = fieldSignature(metadata);
        if (nextSignature && nextSignature !== initializedSignature) {
            formValues = initializeDirectVariationFormValues(metadata);
            initializedSignature = nextSignature;
            localValidationError = "";
        }
        if (!nextSignature) {
            formValues = {};
            initializedSignature = "";
            localValidationError = "";
        }
    }

    function humanizeFieldName(key: string): string {
        return key
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .trim();
    }

    function fieldLabel(field: DirectVariationFieldMetadata): string {
        return field.title || humanizeFieldName(field.key);
    }

    function fieldInputType(field: DirectVariationFieldMetadata): string {
        if (field.type === "number" || field.type === "integer") return "number";
        return "text";
    }

    function setFieldValue(key: string, value: string | boolean) {
        formValues = { ...formValues, [key]: value };
        localValidationError = "";
    }

    async function submitVariation() {
        if (!metadata || !isEditable || saving) {
            return;
        }

        try {
            const payload = buildDirectVariationConfigOverrides(metadata, formValues);
            await onSave(payload);
            localValidationError = "";
        } catch (cause) {
            localValidationError =
                cause instanceof Error
                    ? cause.message
                    : $_("admin_direct_mm_variation_validation_error");
        }
    }
</script>

<div
    class="rounded-xl border border-base-300 bg-base-100 p-4"
    data-testid="direct-variation-panel"
>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
            <span class="block text-xs font-bold text-base-content">
                {$_("admin_direct_mm_variation_title")}
            </span>
            <span class="block text-[11px] text-base-content/55">
                {$_("admin_direct_mm_variation_hint")}
            </span>
        </div>
        {#if metadata}
            <span
                class="w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize {isEditable
                    ? 'border-success/20 bg-success/10 text-success'
                    : 'border-base-300 bg-base-content/5 text-base-content/60'}"
                data-testid="direct-variation-editability"
            >
                {isEditable
                    ? $_("admin_direct_mm_variation_paused_editable")
                    : $_("admin_direct_mm_variation_disabled")}
            </span>
        {/if}
    </div>

    {#if loading}
        <div class="mt-3 rounded-lg border border-base-300 bg-base-200/30 p-3">
            <span class="block text-xs font-semibold text-base-content">
                {$_("admin_direct_mm_variation_loading_title")}
            </span>
            <span class="mt-1 block text-[11px] text-base-content/55">
                {$_("admin_direct_mm_variation_loading_message")}
            </span>
        </div>
    {:else if error}
        <div
            class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3"
            data-testid="direct-variation-error"
        >
            <span class="block text-xs font-bold text-warning">
                {$_("admin_direct_mm_variation_unavailable")}
            </span>
            <span class="mt-1 block text-xs text-base-content/75">{error}</span>
        </div>
    {:else if !metadata}
        <div class="mt-3 rounded-lg border border-base-300 bg-base-200/30 p-3">
            <span class="block text-xs text-base-content/55">
                {$_("admin_direct_mm_variation_empty")}
            </span>
        </div>
    {:else}
        {#if editabilityMessage}
            <div
                class="mt-3 rounded-lg border border-base-300 bg-base-200/30 p-3"
                data-testid="direct-variation-disabled-state"
            >
                <span class="block text-xs font-semibold text-base-content">
                    {editabilityMessage}
                </span>
                <span class="mt-1 block text-[11px] text-base-content/55">
                    {$_("admin_direct_mm_variation_pause_to_edit")}
                </span>
            </div>
        {/if}

        {#if editableFields.length === 0}
            <div class="mt-3 rounded-lg border border-base-300 bg-base-200/30 p-3">
                <span class="block text-xs text-base-content/55">
                    {$_("admin_direct_mm_variation_no_fields")}
                </span>
            </div>
        {:else}
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                {#each editableFields as field}
                    <label
                        class="flex flex-col gap-1.5 rounded-lg border border-base-300 p-3"
                        data-testid={`direct-variation-field-${field.key}`}
                    >
                        <span class="text-[10px] font-semibold text-base-content/50">
                            {fieldLabel(field)}{field.required ? " *" : ""}
                        </span>

                        {#if field.enum && field.enum.length > 0}
                            <select
                                class="select select-sm select-bordered w-full bg-base-100"
                                value={String(formValues[field.key] ?? "")}
                                {disabled}
                                on:change={(event) =>
                                    setFieldValue(
                                        field.key,
                                        (event.currentTarget as HTMLSelectElement).value,
                                    )}
                            >
                                {#each field.enum as option}
                                    <option value={String(option)}>{String(option)}</option>
                                {/each}
                            </select>
                        {:else if field.type === "boolean"}
                            <input
                                class="toggle toggle-sm"
                                type="checkbox"
                                checked={Boolean(formValues[field.key])}
                                {disabled}
                                on:change={(event) =>
                                    setFieldValue(
                                        field.key,
                                        (event.currentTarget as HTMLInputElement).checked,
                                    )}
                            />
                        {:else if field.type === "object" || field.type === "array"}
                            <textarea
                                class="textarea textarea-bordered min-h-20 bg-base-100 text-xs"
                                value={String(formValues[field.key] ?? "")}
                                {disabled}
                                on:input={(event) =>
                                    setFieldValue(
                                        field.key,
                                        (event.currentTarget as HTMLTextAreaElement).value,
                                    )}
                            ></textarea>
                        {:else}
                            <input
                                class="input input-sm input-bordered w-full bg-base-100"
                                type={fieldInputType(field)}
                                min={field.minimum}
                                value={String(formValues[field.key] ?? "")}
                                {disabled}
                                on:input={(event) =>
                                    setFieldValue(
                                        field.key,
                                        (event.currentTarget as HTMLInputElement).value,
                                    )}
                            />
                        {/if}

                        {#if field.description}
                            <span class="text-[11px] text-base-content/45">
                                {field.description}
                            </span>
                        {/if}
                    </label>
                {/each}
            </div>

            {#if localValidationError || saveError}
                <div
                    class="mt-3 rounded-lg border border-error/30 bg-error/10 p-3"
                    data-testid="direct-variation-validation-error"
                >
                    <span class="block text-xs font-bold text-error">
                        {$_("admin_direct_mm_variation_validation_error")}
                    </span>
                    <span class="mt-1 block text-xs text-base-content/75">
                        {localValidationError || saveError}
                    </span>
                </div>
            {/if}

            <div class="mt-4 flex items-center justify-between gap-3">
                <span class="text-[11px] text-base-content/50">
                    {$_("admin_direct_mm_variation_payload_hint")}
                </span>
                <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    disabled={disabled}
                    on:click={submitVariation}
                    data-testid="direct-variation-save"
                >
                    {saving
                        ? $_("admin_direct_mm_variation_saving")
                        : $_("admin_direct_mm_variation_save")}
                </button>
            </div>
        {/if}
    {/if}
</div>
