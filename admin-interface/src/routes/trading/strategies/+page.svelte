<script lang="ts">
  import { onMount } from "svelte";
  import { invalidate } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";

  import type { PageData } from "./$types";
  import type {
    StrategyDefinition,
    StrategyInstanceView,
  } from "$lib/types/hufi/strategy-definition";
  import {
    formatDate,
    getControllerTypeClasses,
    getControllerTypeLabel,
    getStatusClasses,
    getStatusLabel,
  } from "$lib/helpers/admin/settings/strategies/helpers";

  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import DefinitionsTable from "$lib/components/admin/settings/strategies/DefinitionsTable.svelte";
  import CreateDefinitionModal from "$lib/components/admin/settings/strategies/CreateDefinitionModal.svelte";
  import EditDefinitionModal from "$lib/components/admin/settings/strategies/EditDefinitionModal.svelte";
  import RemoveDefinitionModal from "$lib/components/admin/settings/strategies/RemoveDefinitionModal.svelte";
  import DefinitionDetailsModal from "$lib/components/admin/settings/strategies/DefinitionDetailsModal.svelte";
  import StopInstanceModal from "$lib/components/admin/settings/strategies/StopInstanceModal.svelte";

  let { data }: { data: PageData } = $props();

  let pageLoading = $state(true);
  let definitions = $derived((data.definitions || []) as StrategyDefinition[]);
  let instances = $derived((data.instances || []) as StrategyInstanceView[]);
  let templateRows = $derived(
    definitions.map((definition) => ({
      id: definition.id,
      name: `${definition.name || definition.key} default template`,
      definition,
      configKeys: Object.keys(definition.defaultConfig || {}),
      scopeKey: "admin_strategy_template_scope_definition_default",
    })),
  );

  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let showRemoveModal = $state(false);
  let showDetailsModal = $state(false);
  let showStopInstanceModal = $state(false);

  let editingDefinition = $state<StrategyDefinition | null>(null);
  let removingDefinition = $state<StrategyDefinition | null>(null);
  let detailsDefinition = $state<StrategyDefinition | null>(null);
  let stoppingInstance = $state<StrategyInstanceView | null>(null);

  let isSubmitting = $state(false);
  let isRemoving = $state(false);
  let isStopping = $state(false);

  onMount(() => {
    pageLoading = false;
  });

  async function refreshData() {
    await invalidate("admin:settings:strategies");
  }

  function refreshStrategies() {
    void toast.promise(refreshData(), {
      loading: "refreshing strategies",
      success: "strategies refreshed",
      error: "failed to refresh strategies",
    });
  }

  function handleEdit(definition: StrategyDefinition) {
    editingDefinition = definition;
    showEditModal = true;
  }

  function handleRemove(definition: StrategyDefinition) {
    removingDefinition = definition;
    showRemoveModal = true;
  }

  function handleDetails(definition: StrategyDefinition) {
    detailsDefinition = definition;
    showDetailsModal = true;
  }

  function handleStopInstance(instance: StrategyInstanceView) {
    stoppingInstance = instance;
    showStopInstanceModal = true;
  }

  function openCreateModal() {
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
  }

  function closeEditModal() {
    showEditModal = false;
    editingDefinition = null;
  }

  function closeRemoveModal() {
    showRemoveModal = false;
    removingDefinition = null;
  }

  function closeDetailsModal() {
    showDetailsModal = false;
    detailsDefinition = null;
  }

  function closeStopInstanceModal() {
    showStopInstanceModal = false;
    stoppingInstance = null;
  }

  function configSummary(config: Record<string, unknown> | undefined) {
    const keys = Object.keys(config || {});
    if (keys.length === 0) return $_("admin_strategy_template_no_config");
    return $_("admin_strategy_template_field_count", { values: { count: keys.length } });
  }

  function shortValue(value: string | undefined, head = 12, tail = 10) {
    if (!value) return "—";
    if (value.length <= head + tail + 3) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
  }

  function snapshotSource(instance: StrategyInstanceView) {
    return instance.strategyDefinitionSnapshot
      ? $_("admin_strategy_snapshot_source_frozen")
      : $_("admin_strategy_snapshot_legacy");
  }

  function snapshotDefinitionLabel(instance: StrategyInstanceView) {
    return (
      instance.strategyDefinitionSnapshot?.definitionName ||
      instance.definitionName ||
      instance.definitionKey ||
      instance.strategyKey ||
      "—"
    );
  }
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title={$_("admin_strategy_operations_title")}
    subtitle={$_("manage_strategies")}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        onclick={openCreateModal}
      >
        {$_("admin_strategy_new_definition")}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-ghost rounded-full capitalize"
        onclick={refreshStrategies}
      >
        {$_("refresh")}
      </button>
    {/snippet}
  </PageHeader>

  {#if pageLoading}
    <div class="skeleton h-24 w-full rounded-xl"></div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="skeleton h-48 w-full rounded-xl"></div>
      <div class="skeleton h-48 w-full rounded-xl"></div>
    </div>
    <div class="skeleton h-64 w-full rounded-xl"></div>
    <div class="skeleton h-64 w-full rounded-xl"></div>
  {:else}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none">
        <span class="text-xs font-semibold capitalize tracking-wide text-base-content/50">{$_("admin_strategy_definition_layer_tag")}</span>
        <span class="mt-2 block text-lg font-semibold text-base-content">{$_("admin_strategy_definitions_table_title")}</span>
        <span class="mt-2 block text-sm text-base-content/60">{$_("admin_strategy_definition_layer_hint")}</span>
        <span class="mt-4 block font-mono text-2xl font-semibold">{definitions.length}</span>
      </div>
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none">
        <span class="text-xs font-semibold capitalize tracking-wide text-base-content/50">{$_("admin_strategy_template_summary_tag")}</span>
        <span class="mt-2 block text-lg font-semibold text-base-content">{$_("admin_strategy_template_section_title")}</span>
        <span class="mt-2 block text-sm text-base-content/60">{$_("admin_strategy_template_summary_desc")}</span>
        <span class="mt-4 block font-mono text-2xl font-semibold">{templateRows.length}</span>
      </div>
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none">
        <span class="text-xs font-semibold capitalize tracking-wide text-base-content/50">{$_("admin_strategy_snapshot_summary_tag")}</span>
        <span class="mt-2 block text-lg font-semibold text-base-content">{$_("admin_strategy_snapshot_section_title")}</span>
        <span class="mt-2 block text-sm text-base-content/60">{$_("admin_strategy_snapshot_summary_desc")}</span>
        <span class="mt-4 block font-mono text-2xl font-semibold">{instances.length}</span>
      </div>
    </div>

    <DefinitionsTable
      {definitions}
      onEdit={handleEdit}
      onRemove={handleRemove}
      onDetails={handleDetails}
      onRefresh={refreshStrategies}
      onNewClick={openCreateModal}
    />

    <section class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none" data-testid="strategy-templates-section">
      <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span class="text-lg font-semibold text-base-content">{$_("admin_strategy_template_section_title")}</span>
          <span class="mt-1 block text-sm text-base-content/60">{$_("admin_strategy_template_section_desc")}</span>
        </div>
        <span class="rounded-full border border-base-300 px-3 py-1 font-mono text-xs text-base-content/60">{$_("admin_strategy_template_section_count", { values: { count: templateRows.length } })}</span>
      </div>

      {#if templateRows.length === 0}
        <div class="rounded-lg border border-base-300 py-12 text-center text-sm text-base-content/50">{$_("admin_strategy_no_enabled_templates")}</div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                <th class="font-medium">{$_("admin_strategy_templates")}</th>
                <th class="font-medium">{$_("admin_strategy_template_definition")}</th>
                <th class="font-medium">{$_("admin_strategy_snapshot_controller")}</th>
                <th class="font-medium">{$_("admin_strategy_template_scope")}</th>
                <th class="font-medium">{$_("admin_strategy_template_config")}</th>
                <th class="font-medium">{$_("admin_strategy_updated")}</th>
              </tr>
            </thead>
            <tbody>
              {#each templateRows as template (template.id)}
                <tr class="border-b border-base-300 hover:bg-neutral">
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm font-semibold text-base-content">{template.name}</span>
                      <span class="font-mono text-[10px] text-base-content/50">{$_("admin_strategy_template_legacy_default")}</span>
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm text-base-content/80">{template.definition.name || "—"}</span>
                      <span class="font-mono text-[10px] text-base-content/50">{template.definition.key}</span>
                    </div>
                  </td>
                  <td>
                    <span class="rounded-full px-2 py-1 text-[10px] font-semibold {getControllerTypeClasses(template.definition.controllerType)}">
                      {getControllerTypeLabel(template.definition.controllerType)}
                    </span>
                  </td>
                  <td class="text-xs capitalize text-base-content/60">{$_(template.scopeKey)}</td>
                  <td>
                    <div class="flex flex-col">
                      <span class="font-mono text-xs text-base-content/70">{configSummary(template.definition.defaultConfig)}</span>
                      <span class="max-w-[320px] truncate font-mono text-[10px] text-base-content/40" title={template.configKeys.join(", ")}>{template.configKeys.slice(0, 4).join(", ") || "—"}</span>
                    </div>
                  </td>
                  <td class="font-mono text-xs text-base-content/60">{formatDate(template.definition.updatedAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-none" data-testid="strategy-snapshots-section">
      <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span class="text-lg font-semibold text-base-content">{$_("admin_strategy_snapshot_section_title")}</span>
          <span class="mt-1 block text-sm text-base-content/60">{$_("admin_strategy_snapshot_section_desc")}</span>
        </div>
        <span class="rounded-full border border-base-300 px-3 py-1 font-mono text-xs text-base-content/60">{$_("admin_strategy_snapshot_section_count", { values: { count: instances.length } })}</span>
      </div>

      {#if instances.length === 0}
        <div class="rounded-lg border border-base-300 py-12 text-center text-sm text-base-content/50">{$_("admin_strategy_no_instances")}</div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                <th class="font-medium">{$_("admin_strategy_snapshot_runtime_binding")}</th>
                <th class="font-medium">{$_("admin_strategy_snapshot_frozen_definition")}</th>
                <th class="font-medium">{$_("admin_strategy_snapshot_controller")}</th>
                <th class="font-medium">{$_("status")}</th>
                <th class="font-medium">{$_("admin_strategy_snapshot_source")}</th>
                <th class="font-medium">{$_("admin_strategy_updated")}</th>
                <th class="font-medium text-right">{$_("admin_strategy_snapshot_action")}</th>
              </tr>
            </thead>
            <tbody>
              {#each instances as instance (instance.id)}
                <tr class="border-b border-base-300 hover:bg-neutral">
                  <td>
                    <div class="flex flex-col">
                      <span class="font-mono text-xs text-base-content">{shortValue(instance.strategyKey, 14, 12)}</span>
                      <span class="font-mono text-[10px] text-base-content/50">{$_("admin_strategy_snapshot_client", { values: { client: shortValue(instance.clientId, 8, 8) } })}</span>
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-col">
                      <span class="text-sm text-base-content/80">{snapshotDefinitionLabel(instance)}</span>
                      <span class="font-mono text-[10px] text-base-content/50">{instance.strategyDefinitionSnapshot?.strategyDefinitionId || instance.strategyDefinitionId || $_("admin_strategy_snapshot_unbound")}</span>
                    </div>
                  </td>
                  <td class="text-xs text-base-content/60">{instance.strategyDefinitionSnapshot?.controllerType || instance.controllerType || instance.strategyType || "—"}</td>
                  <td>
                    <span class="rounded-full px-2 py-1 text-[10px] font-semibold capitalize {getStatusClasses(instance.status)}">
                      {getStatusLabel(instance.status)}
                    </span>
                  </td>
                  <td class="text-xs capitalize text-base-content/60">{snapshotSource(instance)}</td>
                  <td class="font-mono text-xs text-base-content/60">{formatDate(instance.updatedAt)}</td>
                  <td class="text-right">
                    {#if instance.status === "running"}
                      <button
                        type="button"
                        class="btn btn-xs rounded-full bg-error/10 text-error hover:bg-error/15 capitalize"
                        onclick={() => handleStopInstance(instance)}
                      >
                        {$_("admin_strategy_stop")}
                      </button>
                    {:else}
                      <span class="text-xs text-base-content/30">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</section>

<CreateDefinitionModal
  show={showCreateModal}
  {isSubmitting}
  onSuccess={() => {
    closeCreateModal();
    void refreshData();
  }}
  onClose={closeCreateModal}
/>

<EditDefinitionModal
  show={showEditModal}
  definition={editingDefinition}
  {isSubmitting}
  onSuccess={() => {
    closeEditModal();
    void refreshData();
  }}
  onClose={closeEditModal}
/>

<RemoveDefinitionModal
  show={showRemoveModal}
  definition={removingDefinition}
  {isRemoving}
  onSuccess={() => {
    closeRemoveModal();
    void refreshData();
  }}
  onClose={closeRemoveModal}
/>

<DefinitionDetailsModal
  show={showDetailsModal}
  definition={detailsDefinition}
  onClose={closeDetailsModal}
/>

<StopInstanceModal
  show={showStopInstanceModal}
  instance={stoppingInstance}
  {isStopping}
  onSuccess={() => {
    closeStopInstanceModal();
    void refreshData();
  }}
  onClose={closeStopInstanceModal}
/>
