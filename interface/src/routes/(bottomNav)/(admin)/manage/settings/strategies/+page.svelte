<script lang="ts">
    import { invalidate } from "$app/navigation";
    import { page } from "$app/stores";
    import { _ } from "svelte-i18n";
    import { toast } from "svelte-sonner";

    import {
        backfillStrategyInstanceDefinitionLinks,
        createStrategyDefinition,
        disableStrategyDefinition,
        enableStrategyDefinition,
        listStrategyDefinitionVersions,
        listStrategyInstances,
        publishStrategyDefinitionVersion,
        startStrategyInstance,
        stopStrategyInstance,
        validateStrategyInstance,
    } from "$lib/helpers/mrm/admin/strategy";
    import type {
        PublishStrategyDefinitionVersionPayload,
        StartStrategyInstancePayload,
        StrategyDefinitionPayload,
        StrategyDefinitionVersion,
        StrategyDefinition,
        StrategyInstanceView,
    } from "$lib/types/hufi/strategy-definition";

    let definitions: StrategyDefinition[] = [];
    let instances: StrategyInstanceView[] = [];

    $: definitions = ($page.data.definitions || []) as StrategyDefinition[];
    $: instances = ($page.data.instances || []) as StrategyInstanceView[];

    let selectedDefinitionId = "";
    let userId = "";
    let clientId = "";
    let configText = "{}";
    let isRefreshing = false;
    let selectedDefinitionVersions: StrategyDefinitionVersion[] = [];

    let newDefinition: StrategyDefinitionPayload = {
        key: "",
        name: "",
        description: "",
        executorType: "pureMarketMaking",
        configSchema: {
            type: "object",
            required: ["pair", "exchangeName"],
            properties: {
                pair: { type: "string" },
                exchangeName: { type: "string" },
            },
        },
        defaultConfig: {},
        visibility: "system",
    };
    let newDefinitionSchemaText = JSON.stringify(newDefinition.configSchema, null, 2);
    let newDefinitionDefaultConfigText = JSON.stringify(newDefinition.defaultConfig, null, 2);
    let publishVersionText = "";
    let lastSelectedDefinitionId = "";

    $: selectedDefinition =
        definitions.find((d) => d.id === selectedDefinitionId) || null;

    $: if (selectedDefinitionId !== lastSelectedDefinitionId) {
        lastSelectedDefinitionId = selectedDefinitionId;

        if (selectedDefinition) {
            publishVersionText = selectedDefinition.currentVersion;
            loadSelectedDefinitionVersions();
        } else {
            selectedDefinitionVersions = [];
            publishVersionText = "";
        }
    }

    async function refreshInstances(showToast = false) {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        isRefreshing = true;
        const task = async () => {
            const response = await listStrategyInstances(token);
            instances = Array.isArray(response)
                ? (response as StrategyInstanceView[])
                : [];
        };

        if (showToast) {
            await toast.promise(task, {
                loading: $_("refreshing_msg"),
                success: $_("refresh_success_msg"),
                error: $_("refresh_failed_msg"),
            });
        } else {
            try {
                await task();
            } catch {
                toast.error($_("refresh_failed_msg"));
            }
        }
        isRefreshing = false;
    }

    function parseConfig(): Record<string, unknown> {
        try {
            const parsed = JSON.parse(configText || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            throw new Error("Config must be a JSON object");
        } catch {
            throw new Error($_("strategy_config_invalid_json"));
        }
    }

    function parseJsonObject(value: string, fallbackKey: string): Record<string, unknown> {
        try {
            const parsed = JSON.parse(value || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            throw new Error();
        } catch {
            throw new Error($_(fallbackKey));
        }
    }

    async function loadSelectedDefinitionVersions() {
        if (!selectedDefinitionId) {
            selectedDefinitionVersions = [];
            return;
        }

        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            return;
        }

        try {
            selectedDefinitionVersions = await listStrategyDefinitionVersions(
                selectedDefinitionId,
                token,
            );
        } catch {
            selectedDefinitionVersions = [];
        }
    }

    async function createDefinition() {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        if (!newDefinition.key || !newDefinition.name || !newDefinition.executorType) {
            toast.error($_("strategy_definition_required_fields"));
            return;
        }

        try {
            const payload: StrategyDefinitionPayload = {
                ...newDefinition,
                configSchema: parseJsonObject(
                    newDefinitionSchemaText,
                    "strategy_config_invalid_json",
                ),
                defaultConfig: parseJsonObject(
                    newDefinitionDefaultConfigText,
                    "strategy_config_invalid_json",
                ),
            };

            await createStrategyDefinition(payload, token);
            toast.success($_("strategy_definition_create_success"));
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_create_failed"),
            );
        }
    }

    async function toggleDefinition(definition: StrategyDefinition) {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            if (definition.enabled) {
                await disableStrategyDefinition(definition.id, token);
            } else {
                await enableStrategyDefinition(definition.id, token);
            }
            toast.success($_("strategy_definition_toggle_success"));
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_toggle_failed"),
            );
        }
    }

    async function publishDefinition(definition: StrategyDefinition) {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            const payload: PublishStrategyDefinitionVersionPayload = {
                version:
                    publishVersionText && publishVersionText !== definition.currentVersion
                        ? publishVersionText
                        : undefined,
            };
            await publishStrategyDefinitionVersion(definition.id, payload, token);
            toast.success($_("strategy_definition_publish_success"));
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_publish_failed"),
            );
        }
    }

    async function backfillLegacyInstances() {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            const result = await backfillStrategyInstanceDefinitionLinks(token);
            toast.success(
                $_("strategy_backfill_done", {
                    values: { updated: result.updated, skipped: result.skipped },
                }),
            );
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_backfill_failed"),
            );
        }
    }

    async function validateSelectedDefinition() {
        if (!selectedDefinitionId || !userId || !clientId) {
            toast.error($_("strategy_required_fields"));
            return;
        }

        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            const config = parseConfig();
            const payload: StartStrategyInstancePayload = {
                definitionId: selectedDefinitionId,
                userId,
                clientId,
                config,
            };
            await validateStrategyInstance(payload, token);
            toast.success($_("strategy_validation_success"));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_validation_failed"),
            );
        }
    }

    async function startSelectedDefinition() {
        if (!selectedDefinitionId || !userId || !clientId) {
            toast.error($_("strategy_required_fields"));
            return;
        }

        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            const config = parseConfig();
            const payload: StartStrategyInstancePayload = {
                definitionId: selectedDefinitionId,
                userId,
                clientId,
                config,
            };
            await startStrategyInstance(payload, token);

            toast.success($_("strategy_start_success"));
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_start_failed"),
            );
        }
    }

    async function stopInstance(instance: StrategyInstanceView) {
        if (!instance.definitionId) {
            toast.error($_("strategy_instance_missing_definition"));
            return;
        }

        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            toast.error($_("auth_token_missing"));
            return;
        }

        try {
            await stopStrategyInstance(
                {
                    definitionId: instance.definitionId,
                    userId: instance.userId,
                    clientId: instance.clientId,
                },
                token,
            );
            toast.success($_("strategy_stop_success"));
            await invalidate("admin:settings:strategies");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_stop_failed"),
            );
        }
    }
</script>

<div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">{$_("strategies")}</h1>
            <p class="text-base-content/60">{$_("manage_strategies")}</p>
        </div>
        <button
            class="btn btn-outline"
            on:click={() => refreshInstances(true)}
            disabled={isRefreshing}
        >
            {#if isRefreshing}
                <span class="loading loading-spinner loading-sm" />
            {/if}
            {$_("refresh")}
        </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card bg-base-100 shadow border border-base-200">
            <div class="card-body space-y-4">
                <h2 class="card-title">{$_("start_strategy_instance")}</h2>

                <label class="form-control">
                    <span class="label-text">{$_("strategy_definition")}</span>
                    <select
                        class="select select-bordered"
                        bind:value={selectedDefinitionId}
                    >
                        <option value="">{$_("select_strategy_definition")}</option>
                        {#each definitions as definition}
                            <option value={definition.id}>
                                {definition.name} ({definition.executorType})
                            </option>
                        {/each}
                    </select>
                </label>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="form-control">
                        <span class="label-text">User ID</span>
                        <input
                            class="input input-bordered"
                            bind:value={userId}
                            placeholder="user123"
                        />
                    </label>

                    <label class="form-control">
                        <span class="label-text">Client ID</span>
                        <input
                            class="input input-bordered"
                            bind:value={clientId}
                            placeholder="client123"
                        />
                    </label>
                </div>

                <label class="form-control">
                    <span class="label-text">{$_("strategy_config_override")}</span>
                    <textarea
                        class="textarea textarea-bordered h-40 font-mono text-xs"
                        bind:value={configText}
                    />
                </label>

                {#if selectedDefinition}
                    <div class="text-xs bg-base-200 rounded p-3">
                        <div class="font-semibold mb-1">
                            {$_("default_config_preview")}
                        </div>
                        <pre class="whitespace-pre-wrap">{JSON.stringify(
                            selectedDefinition.defaultConfig,
                            null,
                            2,
                        )}</pre>
                    </div>
                {/if}

                <div class="flex items-center gap-2 justify-end">
                    <button
                        class="btn btn-ghost"
                        on:click={validateSelectedDefinition}
                    >
                        {$_("validate")}
                    </button>
                    <button
                        class="btn btn-primary"
                        on:click={startSelectedDefinition}
                    >
                        {$_("start")}
                    </button>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow border border-base-200">
            <div class="card-body">
                <div class="flex items-center justify-between gap-2">
                    <h2 class="card-title">{$_("strategy_definitions")}</h2>
                    <button class="btn btn-xs btn-outline" on:click={backfillLegacyInstances}>
                        {$_("strategy_backfill")}
                    </button>
                </div>

                <div class="space-y-2 rounded border border-base-200 p-3 bg-base-50">
                    <div class="font-medium text-sm">{$_("create_strategy_definition")}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input class="input input-bordered input-sm" placeholder="key" bind:value={newDefinition.key} />
                        <input class="input input-bordered input-sm" placeholder="name" bind:value={newDefinition.name} />
                    </div>
                    <input class="input input-bordered input-sm" placeholder="executorType" bind:value={newDefinition.executorType} />
                    <textarea class="textarea textarea-bordered h-20 font-mono text-xs" bind:value={newDefinitionSchemaText} />
                    <textarea class="textarea textarea-bordered h-20 font-mono text-xs" bind:value={newDefinitionDefaultConfigText} />
                    <div class="flex justify-end">
                        <button class="btn btn-sm btn-primary" on:click={createDefinition}>{$_("create")}</button>
                    </div>
                </div>

                {#if definitions.length === 0}
                    <p class="text-base-content/60">{$_("no_data")}</p>
                {:else}
                    <div class="space-y-2 max-h-[500px] overflow-auto pr-1">
                        {#each definitions as definition}
                            <div class="p-3 border border-base-200 rounded-lg bg-base-50">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <div class="font-semibold">{definition.name}</div>
                                        <div class="text-xs text-base-content/60">
                                            {definition.key} - {definition.executorType} - v{definition.currentVersion}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span
                                            class={definition.enabled
                                                ? "badge badge-success"
                                                : "badge badge-warning"}
                                        >
                                            {definition.enabled
                                                ? $_("enabled")
                                                : $_("disabled")}
                                        </span>
                                        <button class="btn btn-xs btn-ghost" on:click={() => toggleDefinition(definition)}>
                                            {definition.enabled ? $_("disable") : $_("enable")}
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-2 flex items-center gap-2">
                                    <input
                                        class="input input-bordered input-xs w-28"
                                        bind:value={publishVersionText}
                                        placeholder="1.0.1"
                                    />
                                    <button class="btn btn-xs btn-outline" on:click={() => publishDefinition(definition)}>
                                        {$_("publish")}
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>

                    {#if selectedDefinition && selectedDefinitionVersions.length > 0}
                        <div class="mt-3 rounded border border-base-200 p-3 bg-base-50">
                            <div class="font-medium text-sm mb-2">{$_("strategy_definition_versions")}</div>
                            <div class="space-y-1 max-h-32 overflow-auto">
                                {#each selectedDefinitionVersions as version}
                                    <div class="text-xs">
                                        v{version.version} - {version.executorType}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>

    <div class="card bg-base-100 shadow border border-base-200">
        <div class="card-body">
            <h2 class="card-title">{$_("strategy_instances")}</h2>
            {#if instances.length === 0}
                <p class="text-base-content/60">{$_("no_data")}</p>
            {:else}
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{$_("strategy")}</th>
                                <th>User</th>
                                <th>Client</th>
                                <th>{$_("status")}</th>
                                <th>{$_("action")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each instances as instance}
                                <tr>
                                    <td>
                                        <div class="font-medium">
                                            {instance.definitionName || instance.strategyType}
                                        </div>
                                        <div class="text-xs text-base-content/60">
                                            {instance.strategyKey}
                                        </div>
                                    </td>
                                    <td>{instance.userId}</td>
                                    <td>{instance.clientId}</td>
                                    <td>
                                        <span
                                            class={instance.status === "running"
                                                ? "badge badge-success"
                                                : "badge"}
                                        >
                                            {instance.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline"
                                            on:click={() => stopInstance(instance)}
                                            disabled={instance.status !== "running"}
                                        >
                                            {$_("stop")}
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
    </div>
</div>
