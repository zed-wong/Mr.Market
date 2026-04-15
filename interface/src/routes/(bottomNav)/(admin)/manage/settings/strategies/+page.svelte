<script lang="ts">
  import { onMount } from "svelte";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/stores";
  import { _ } from "svelte-i18n";

  import type { PageData } from "./$types";
  import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";
  import type { StrategyInstanceView } from "$lib/types/hufi/strategy-definition";

  import DefinitionsSummaryPanel from "$lib/components/admin/settings/strategies/DefinitionsSummaryPanel.svelte";
  import InstancesSummaryPanel from "$lib/components/admin/settings/strategies/InstancesSummaryPanel.svelte";
  import DefinitionsTable from "$lib/components/admin/settings/strategies/DefinitionsTable.svelte";
  import InstancesTable from "$lib/components/admin/settings/strategies/InstancesTable.svelte";
  import CreateDefinitionModal from "$lib/components/admin/settings/strategies/CreateDefinitionModal.svelte";
  import EditDefinitionModal from "$lib/components/admin/settings/strategies/EditDefinitionModal.svelte";
  import RemoveDefinitionModal from "$lib/components/admin/settings/strategies/RemoveDefinitionModal.svelte";
  import DefinitionDetailsModal from "$lib/components/admin/settings/strategies/DefinitionDetailsModal.svelte";
  import StopInstanceModal from "$lib/components/admin/settings/strategies/StopInstanceModal.svelte";

  export let data: PageData;

  let pageLoading = true;
  let definitions: StrategyDefinition[] = [];
  let instances: StrategyInstanceView[] = [];

  $: {
    definitions = (data.definitions || []) as StrategyDefinition[];
    instances = (data.instances || []) as StrategyInstanceView[];
  }

  let showCreateModal = false;
  let showEditModal = false;
  let showRemoveModal = false;
  let showDetailsModal = false;
  let showStopInstanceModal = false;

  let editingDefinition: StrategyDefinition | null = null;
  let removingDefinition: StrategyDefinition | null = null;
  let detailsDefinition: StrategyDefinition | null = null;
  let stoppingInstance: StrategyInstanceView | null = null;

  let isSubmitting = false;
  let isRemoving = false;
  let isStopping = false;
  let isRefreshing = false;

  onMount(() => {
    pageLoading = false;
  });

  async function refreshData() {
    isRefreshing = true;
    await invalidate("admin:settings:strategies");
    isRefreshing = false;
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
</script>

<div class="min-h-screen pb-10 bg-slate-50">
  <div class="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
    <!-- Back + Title -->
    <div class="flex items-center gap-3 sm:gap-4">
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
        <span class="text-sm text-base-content/50">{$_("manage_strategies")}</span>
      </div>
    </div>

    {#if pageLoading}
      <div class="skeleton h-12 w-full rounded-xl"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="skeleton h-48 w-full rounded-xl"></div>
        <div class="skeleton h-48 w-full rounded-xl"></div>
      </div>
      <div class="skeleton h-64 w-full rounded-xl"></div>
      <div class="skeleton h-64 w-full rounded-xl"></div>
    {:else}
      <!-- Summary panels -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DefinitionsSummaryPanel {definitions} />
        <InstancesSummaryPanel {instances} />
      </div>

      <!-- Definitions table -->
      <DefinitionsTable
        {definitions}
        onEdit={handleEdit}
        onRemove={handleRemove}
        onDetails={handleDetails}
        onRefresh={refreshData}
        onNewClick={openCreateModal}
      />

      <!-- Instances table -->
      <InstancesTable
        {instances}
        onStop={handleStopInstance}
        onRefresh={refreshData}
      />
    {/if}
  </div>
</div>

<!-- Modals -->
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
