<script lang="ts">
    import { _ } from "svelte-i18n";

    type SchemaProperty = {
        type?: string;
        enum?: string[];
        description?: string;
    };

    type Schema = {
        type?: string;
        required?: string[];
        properties?: Record<string, SchemaProperty>;
    };

    export let schema: Schema = {};
    export let config: Record<string, unknown> = {};
    export let readOnly = false;

    let showRawJson = false;

    const descriptionKeyMap: Record<string, string> = {
        userId: "admin_strategy_field_user_id_hint",
        clientId: "admin_strategy_field_client_id_hint",
        marketMakingOrderId: "admin_strategy_field_market_making_order_id_hint",
        pair: "admin_strategy_field_pair_hint",
        exchangeName: "admin_strategy_field_exchange_name_hint",
        oracleExchangeName: "admin_strategy_field_oracle_exchange_name_hint",
        bidSpread: "admin_strategy_field_bid_spread_hint",
        askSpread: "admin_strategy_field_ask_spread_hint",
        orderAmount: "admin_strategy_field_order_amount_hint",
        orderRefreshTime: "admin_strategy_field_order_refresh_time_hint",
        numberOfLayers: "admin_strategy_field_number_of_layers_hint",
        priceSourceType: "admin_strategy_field_price_source_type_hint",
        amountChangePerLayer: "admin_strategy_field_amount_change_per_layer_hint",
        amountChangeType: "admin_strategy_field_amount_change_type_hint",
        ceilingPrice: "admin_strategy_field_ceiling_price_hint",
        floorPrice: "admin_strategy_field_floor_price_hint",
        hangingOrdersEnabled: "admin_strategy_field_hanging_orders_enabled_hint",
        makerHeavyMode: "admin_strategy_field_maker_heavy_mode_hint",
        makerHeavyBiasBps: "admin_strategy_field_maker_heavy_bias_bps_hint",
        inventoryTargetBaseRatio: "admin_strategy_field_inventory_target_base_ratio_hint",
        inventorySkewFactor: "admin_strategy_field_inventory_skew_factor_hint",
        currentBaseRatio: "admin_strategy_field_current_base_ratio_hint",
    };

    function fieldDescription(key: string, description: string): string {
        const i18nKey = descriptionKeyMap[key];
        return i18nKey ? $_(i18nKey) : description;
    }
    let rawJsonText = "";

    $: properties = schema.properties || {};
    $: requiredFields = schema.required || [];

    $: if (showRawJson) {
        rawJsonText = JSON.stringify(config, null, 2);
    }

    function isRequired(fieldName: string): boolean {
        return requiredFields.includes(fieldName);
    }

    function getFieldValue(key: string): unknown {
        return config[key] ?? "";
    }

    function setFieldValue(key: string, value: unknown) {
        config = { ...config, [key]: value };
    }

    function handleRawJsonChange() {
        try {
            config = JSON.parse(rawJsonText);
            showRawJson = false;
        } catch {
            // keep as-is, let user fix
        }
    }
</script>

<div class="flex flex-col gap-3">
    {#if Object.keys(properties).length === 0 && !readOnly}
        <div class="text-sm text-base-content/50 text-center py-4">
            {$_("admin_strategy_no_schema_fields")}
        </div>
    {:else if !showRawJson}
        <!-- Dynamic form fields -->
        <div class="grid gap-3">
            {#each Object.entries(properties) as [key, prop]}
                {@const isReq = isRequired(key)}
                {@const val = getFieldValue(key)}
                {@const fieldType = prop.type || "string"}

                {#if fieldType === "boolean"}
                    <div
                        class="flex items-center gap-3 bg-base-200/40 rounded-xl p-4"
                    >
                        <label
                            class="flex items-center gap-2 cursor-pointer flex-1"
                            for="field-{key}"
                        >
                            <input
                                id="field-{key}"
                                type="checkbox"
                                class="toggle toggle-sm toggle-primary"
                                checked={Boolean(val)}
                                disabled={readOnly}
                                on:change={(e) =>
                                    setFieldValue(key, e.currentTarget.checked)}
                            />
                            <span class="text-sm text-base-content">
                                {key}
                                {#if isReq}<span class="text-error ml-0.5"
                                        >*</span
                                    >{/if}
                            </span>
                        </label>
                    </div>
                {:else if fieldType === "number"}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <label class="flex flex-col gap-1.5" for="field-{key}">
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider"
                            >
                                {key}{#if isReq}<span class="text-error ml-0.5"
                                        >*</span
                                    >{/if}
                            </span>
                            <input
                                id="field-{key}"
                                type="number"
                                step="any"
                                class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                                value={val}
                                disabled={readOnly}
                                on:input={(e) =>
                                    setFieldValue(
                                        key,
                                        parseFloat(e.currentTarget.value) || 0,
                                    )}
                            />
                            {#if prop.description}
                                <span class="text-xs text-base-content/40"
                                    >{fieldDescription(key, prop.description)}</span
                                >
                            {/if}
                        </label>
                    </div>
                {:else if prop.enum && prop.enum.length > 0}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <label class="flex flex-col gap-1.5" for="field-{key}">
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider"
                            >
                                {key}{#if isReq}<span class="text-error ml-0.5"
                                        >*</span
                                    >{/if}
                            </span>
                            <select
                                id="field-{key}"
                                class="select select-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                                value={val || ""}
                                disabled={readOnly}
                                on:change={(e) =>
                                    setFieldValue(key, e.currentTarget.value)}
                            >
                                <option value="" disabled>{$_("select_placeholder")}</option>
                                {#each prop.enum as opt}
                                    <option value={opt}>{opt}</option>
                                {/each}
                            </select>
                            {#if prop.description}
                                <span class="text-xs text-base-content/40"
                                    >{fieldDescription(key, prop.description)}</span
                                >
                            {/if}
                        </label>
                    </div>
                {:else if fieldType === "array"}
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <label class="flex flex-col gap-1.5" for="field-{key}">
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider"
                            >
                                {key}{#if isReq}<span class="text-error ml-0.5"
                                        >*</span
                                    >{/if}
                            </span>
                            <input
                                id="field-{key}"
                                type="text"
                                placeholder={$_("array_placeholder")}
                                class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm font-mono focus:outline-none focus:border-primary border-base-300"
                                value={Array.isArray(val)
                                    ? JSON.stringify(val)
                                    : ""}
                                disabled={readOnly}
                                on:input={(e) => {
                                    try {
                                        setFieldValue(
                                            key,
                                            JSON.parse(e.currentTarget.value),
                                        );
                                    } catch {
                                        // ignore partial input
                                    }
                                }}
                            />
                            {#if prop.description}
                                <span class="text-xs text-base-content/40"
                                    >{fieldDescription(key, prop.description)}</span
                                >
                            {/if}
                        </label>
                    </div>
                {:else}
                    <!-- Default: text input -->
                    <div class="bg-base-200/40 rounded-xl p-4">
                        <label class="flex flex-col gap-1.5" for="field-{key}">
                            <span
                                class="text-xs font-semibold text-base-content/50 tracking-wider"
                            >
                                {key}{#if isReq}<span class="text-error ml-0.5"
                                        >*</span
                                    >{/if}
                            </span>
                            <input
                                id="field-{key}"
                                type="text"
                                class="input input-bordered w-full h-10 min-h-10 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                                value={val}
                                disabled={readOnly}
                                on:input={(e) =>
                                    setFieldValue(key, e.currentTarget.value)}
                            />
                            {#if prop.description}
                                <span class="text-xs text-base-content/40"
                                    >{fieldDescription(key, prop.description)}</span
                                >
                            {/if}
                        </label>
                    </div>
                {/if}
            {/each}
        </div>
    {:else}
        <!-- Raw JSON editor -->
        <textarea
            class="textarea textarea-bordered w-full bg-base-100 text-base-content text-sm font-mono resize-none h-40 focus:outline-none focus:border-primary border-base-300"
            bind:value={rawJsonText}
        ></textarea>
        <div class="flex gap-3 justify-end">
            <button
                class="btn btn-ghost text-base-content text-sm font-semibold px-4"
                on:click={() => (showRawJson = false)}
            >
                {$_("admin_strategy_cancel")}
            </button>
            <button
                class="btn btn-primary text-primary-content text-sm font-semibold px-4"
                on:click={handleRawJsonChange}
            >
                {$_("admin_strategy_apply_json")}
            </button>
        </div>
    {/if}

    {#if !readOnly}
        <div class="flex items-center gap-2 pt-1">
            <input
                type="checkbox"
                id="show-raw-json"
                class="checkbox checkbox-xs checkbox-primary"
                bind:checked={showRawJson}
            />
            <label
                for="show-raw-json"
                class="text-xs text-base-content/50 cursor-pointer select-none"
            >
                {$_("admin_strategy_show_raw_json")}
            </label>
        </div>
    {/if}
</div>
