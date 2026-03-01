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
        publishStrategyDefinitionVersion,
        startStrategyInstance,
        stopStrategyInstance,
        validateStrategyInstance,
    } from "$lib/helpers/mrm/admin/strategy";
    import type {
        PublishStrategyDefinitionVersionPayload,
        StartStrategyInstancePayload,
        StrategyDefinition,
        StrategyDefinitionPayload,
        StrategyDefinitionVersion,
        StrategyInstanceView,
    } from "$lib/types/hufi/strategy-definition";

    $: definitions = ($page.data.definitions || []) as StrategyDefinition[];
    $: instances = ($page.data.instances || []) as StrategyInstanceView[];
    $: selectedDefinition =
        definitions.find((definition) => definition.id === selectedDefinitionId) || null;

    let isRefreshing = false;
    let selectedDefinitionId = "";
    let selectedDefinitionVersions: StrategyDefinitionVersion[] = [];
    let publishVersionText = "";
    let lastSelectedDefinitionId = "";

    let userId = "";
    let clientId = "";
    let configText = "{}";

    let createPayload: StrategyDefinitionPayload = {
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
    let createSchemaText = JSON.stringify(createPayload.configSchema, null, 2);
    let createDefaultConfigText = JSON.stringify(createPayload.defaultConfig, null, 2);

    $: if (selectedDefinitionId !== lastSelectedDefinitionId) {
        lastSelectedDefinitionId = selectedDefinitionId;
        if (!selectedDefinition) {
            selectedDefinitionVersions = [];
            publishVersionText = "";
        } else {
            publishVersionText = selectedDefinition.currentVersion;
            loadDefinitionVersions();
        }
    }

    function getAdminToken(): string {
        const token = localStorage.getItem("admin-access-token");
        if (!token) {
            throw new Error($_("auth_token_missing"));
        }

        return token;
    }

    function parseObjectJson(input: string, messageKey = "strategy_config_invalid_json") {
        try {
            const parsed = JSON.parse(input || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error();
            }

            return parsed as Record<string, unknown>;
        } catch {
            throw new Error($_(messageKey));
        }
    }

    async function refreshStrategies(showToast = true) {
        isRefreshing = true;
        const task = () =>
            invalidate("admin:settings:strategies").finally(() => {
                isRefreshing = false;
            });

        if (showToast) {
            await toast.promise(task, {
                loading: $_("refreshing_msg"),
                success: $_("refresh_success_msg"),
                error: $_("refresh_failed_msg"),
            });
        } else {
            await task();
        }
    }

    async function loadDefinitionVersions() {
        if (!selectedDefinitionId) {
            selectedDefinitionVersions = [];
            return;
        }

        try {
            const token = getAdminToken();
            selectedDefinitionVersions = await listStrategyDefinitionVersions(
                selectedDefinitionId,
                token,
            );
        } catch (err) {
            selectedDefinitionVersions = [];
            console.error("Failed to load strategy definition versions", err);
            toast.error($_("strategy_definition_versions_load_failed"));
        }
    }

    function buildStartPayload(): StartStrategyInstancePayload | null {
        if (!selectedDefinitionId || !userId || !clientId) {
            toast.error($_("strategy_required_fields"));
            return null;
        }

        try {
            return {
                definitionId: selectedDefinitionId,
                userId,
                clientId,
                config: parseObjectJson(configText),
            };
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_config_invalid_json"),
            );
            return null;
        }
    }

    async function onCreateDefinition() {
        if (!createPayload.key || !createPayload.name || !createPayload.executorType) {
            toast.error($_("strategy_definition_required_fields"));
            return;
        }

        try {
            const token = getAdminToken();
            await createStrategyDefinition(
                {
                    ...createPayload,
                    configSchema: parseObjectJson(createSchemaText),
                    defaultConfig: parseObjectJson(createDefaultConfigText),
                },
                token,
            );

            toast.success($_("strategy_definition_create_success"));
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_create_failed"),
            );
        }
    }

    async function onToggleDefinition(definition: StrategyDefinition) {
        try {
            const token = getAdminToken();
            if (definition.enabled) {
                await disableStrategyDefinition(definition.id, token);
            } else {
                await enableStrategyDefinition(definition.id, token);
            }
            toast.success($_("strategy_definition_toggle_success"));
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_toggle_failed"),
            );
        }
    }

    async function onPublishVersion() {
        if (!selectedDefinition) {
            toast.error($_("strategy_required_fields"));
            return;
        }

        try {
            const token = getAdminToken();
            const payload: PublishStrategyDefinitionVersionPayload = {
                version:
                    publishVersionText &&
                    publishVersionText !== selectedDefinition.currentVersion
                        ? publishVersionText
                        : undefined,
            };

            await publishStrategyDefinitionVersion(selectedDefinition.id, payload, token);
            toast.success($_("strategy_definition_publish_success"));
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : $_("strategy_definition_publish_failed"),
            );
        }
    }

    async function onBackfillLegacyLinks() {
        try {
            const token = getAdminToken();
            const result = await backfillStrategyInstanceDefinitionLinks(token);
            toast.success(
                $_("strategy_backfill_done", {
                    values: { updated: result.updated, skipped: result.skipped },
                }),
            );
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_backfill_failed"),
            );
        }
    }

    async function onValidateStartConfig() {
        const payload = buildStartPayload();
        if (!payload) {
            return;
        }

        try {
            const token = getAdminToken();
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

    async function onStartStrategyInstance() {
        const payload = buildStartPayload();
        if (!payload) {
            return;
        }

        try {
            const token = getAdminToken();
            await startStrategyInstance(payload, token);
            toast.success($_("strategy_start_success"));
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_start_failed"),
            );
        }
    }

    async function onStopStrategyInstance(instance: StrategyInstanceView) {
        if (!instance.definitionId) {
            toast.error($_("strategy_instance_missing_definition"));
            return;
        }

        try {
            const token = getAdminToken();
            await stopStrategyInstance(
                {
                    definitionId: instance.definitionId,
                    userId: instance.userId,
                    clientId: instance.clientId,
                },
                token,
            );
            toast.success($_("strategy_stop_success"));
            await refreshStrategies(false);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : $_("strategy_stop_failed"),
            );
        }
    }
</script>

<div class="p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto min-h-screen bg-base-200">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div class="flex items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <button on:click={() => window.history.back()} class="btn btn-ghost btn-circle">
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
                        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                    />
                </svg>
            </button>

            <div class="flex flex-col text-start items-start justify-center min-w-0">
                <span class="text-xl sm:text-2xl font-bold">{$_("strategies")}</span>
                <span class="text-sm text-base-content/60">{$_("manage_strategies")}</span>
            </div>
        </div>

        <div class="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <button class="btn btn-outline btn-sm" on:click={onBackfillLegacyLinks}>
                {$_("strategy_backfill")}
            </button>
            <button class="btn btn-square btn-outline" on:click={() => refreshStrategies(true)}>
                <span class={isRefreshing ? "loading loading-spinner loading-sm" : ""}>
                    {#if !isRefreshing}
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
                                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                            />
                        </svg>
                    {/if}
                </span>
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body gap-4">
                <h2 class="card-title text-base">{$_("start_strategy_instance")}</h2>

                <label class="form-control">
                    <span class="label-text">{$_("strategy_definition")}</span>
                    <select class="select select-bordered" bind:value={selectedDefinitionId}>
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
                        <span class="label-text">{$_("user_id")}</span>
                        <input class="input input-bordered" bind:value={userId} placeholder="user123" />
                    </label>
                    <label class="form-control">
                        <span class="label-text">{$_("client_id")}</span>
                        <input class="input input-bordered" bind:value={clientId} placeholder="client123" />
                    </label>
                </div>

                <label class="form-control">
                    <span class="label-text">{$_("strategy_config_override")}</span>
                    <textarea class="textarea textarea-bordered h-40 font-mono text-xs" bind:value={configText} />
                </label>

                {#if selectedDefinition}
                    <div class="rounded-lg border border-base-300 bg-base-200 p-3">
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="badge badge-outline">{selectedDefinition.key}</span>
                            <span class="badge badge-outline">{selectedDefinition.executorType}</span>
                            <span class="badge badge-outline">v{selectedDefinition.currentVersion}</span>
                        </div>
                        <div class="text-xs font-semibold mb-1">{$_("default_config_preview")}</div>
                        <pre class="text-xs whitespace-pre-wrap break-all">{JSON.stringify(
                            selectedDefinition.defaultConfig,
                            null,
                            2,
                        )}</pre>
                    </div>
                {/if}

                <div class="card-actions justify-end">
                    <button class="btn btn-ghost" on:click={onValidateStartConfig}>{$_("validate")}</button>
                    <button class="btn btn-primary" on:click={onStartStrategyInstance}>{$_("start")}</button>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body gap-4">
                <h2 class="card-title text-base">{$_("strategy_definitions")}</h2>

                <div class="rounded-lg border border-base-300 bg-base-200 p-3 space-y-2">
                    <div class="text-sm font-medium">{$_("create_strategy_definition")}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input class="input input-bordered input-sm" placeholder="key" bind:value={createPayload.key} />
                        <input class="input input-bordered input-sm" placeholder="name" bind:value={createPayload.name} />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select class="select select-bordered select-sm" bind:value={createPayload.executorType}>
                            <option value="pureMarketMaking">pureMarketMaking</option>
                            <option value="arbitrage">arbitrage</option>
                            <option value="volume">volume</option>
                        </select>
                        <select class="select select-bordered select-sm" bind:value={createPayload.visibility}>
                            <option value="system">system</option>
                            <option value="private">private</option>
                            <option value="public">public</option>
                        </select>
                    </div>
                    <input
                        class="input input-bordered input-sm"
                        placeholder="description"
                        bind:value={createPayload.description}
                    />
                    <textarea
                        class="textarea textarea-bordered h-20 font-mono text-xs"
                        bind:value={createSchemaText}
                    />
                    <textarea
                        class="textarea textarea-bordered h-20 font-mono text-xs"
                        bind:value={createDefaultConfigText}
                    />
                    <div class="flex justify-end">
                        <button class="btn btn-sm btn-primary" on:click={onCreateDefinition}>{$_("create")}</button>
                    </div>
                </div>

                {#if definitions.length === 0}
                    <p class="text-sm text-base-content/60">{$_("no_data")}</p>
                {:else}
                    <div class="space-y-2 max-h-60 overflow-auto pr-1">
                        {#each definitions as definition}
                            <div
                                class="rounded-lg border p-3 transition-colors"
                                class:border-primary={selectedDefinitionId === definition.id}
                                class:bg-base-200={selectedDefinitionId === definition.id}
                                class:border-base-300={selectedDefinitionId !== definition.id}
                            >
                                <div class="flex items-start justify-between gap-3">
                                    <button
                                        type="button"
                                        class="text-left min-w-0 flex-1"
                                        on:click={() => (selectedDefinitionId = definition.id)}
                                    >
                                        <div class="font-medium truncate">{definition.name}</div>
                                        <div class="text-xs text-base-content/60 break-all">
                                            {definition.key} | {definition.executorType} | v{definition.currentVersion}
                                        </div>
                                    </button>
                                    <div class="flex items-center gap-2">
                                        <span
                                            class={definition.enabled
                                                ? "badge badge-success"
                                                : "badge badge-warning"}
                                        >
                                            {definition.enabled ? $_("enabled") : $_("disabled")}
                                        </span>
                                        <button
                                            type="button"
                                            class="btn btn-xs btn-ghost"
                                            on:click={() => onToggleDefinition(definition)}
                                        >
                                            {definition.enabled ? $_("disable") : $_("enable")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    {#if selectedDefinition}
                        <div class="rounded-lg border border-base-300 bg-base-200 p-3 space-y-2">
                            <div class="flex items-center gap-2">
                                <input
                                    class="input input-bordered input-sm w-32"
                                    bind:value={publishVersionText}
                                    placeholder="1.0.1"
                                />
                                <button class="btn btn-sm btn-outline" on:click={onPublishVersion}>
                                    {$_("publish")}
                                </button>
                            </div>

                            <div class="text-sm font-medium">{$_("strategy_definition_versions")}</div>
                            {#if selectedDefinitionVersions.length === 0}
                                <p class="text-sm text-base-content/60">{$_("no_data")}</p>
                            {:else}
                                <div class="max-h-28 overflow-auto space-y-1">
                                    {#each selectedDefinitionVersions as version}
                                        <div class="text-xs">
                                            v{version.version} - {version.executorType}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>

    <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body gap-4">
            <h2 class="card-title text-base">{$_("strategy_instances")}</h2>

            {#if instances.length === 0}
                <p class="text-sm text-base-content/60">{$_("no_data")}</p>
            {:else}
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{$_("strategy")}</th>
                                <th>{$_("user")}</th>
                                <th>{$_("client")}</th>
                                <th>{$_("status")}</th>
                                <th>{$_("action")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each instances as instance}
                                <tr>
                                    <td>
                                        <div class="font-medium">{instance.definitionName || instance.strategyType}</div>
                                        <div class="text-xs text-base-content/60 break-all">{instance.strategyKey}</div>
                                    </td>
                                    <td>{instance.userId}</td>
                                    <td>{instance.clientId}</td>
                                    <td>
                                        <span class={instance.status === "running" ? "badge badge-success" : "badge"}>
                                            {instance.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline"
                                            disabled={instance.status !== "running"}
                                            on:click={() => onStopStrategyInstance(instance)}
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
