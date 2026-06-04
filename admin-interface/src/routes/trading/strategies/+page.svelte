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

  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import StrategyOperationsBoard from "$lib/components/admin/settings/strategies/StrategyOperationsBoard.svelte";
  import DefinitionsTable from "$lib/components/admin/settings/strategies/DefinitionsTable.svelte";
  import InstancesTable from "$lib/components/admin/settings/strategies/InstancesTable.svelte";
  import CreateDefinitionModal from "$lib/components/admin/settings/strategies/CreateDefinitionModal.svelte";
  import EditDefinitionModal from "$lib/components/admin/settings/strategies/EditDefinitionModal.svelte";
  import RemoveDefinitionModal from "$lib/components/admin/settings/strategies/RemoveDefinitionModal.svelte";
  import DefinitionDetailsModal from "$lib/components/admin/settings/strategies/DefinitionDetailsModal.svelte";
  import StopInstanceModal from "$lib/components/admin/settings/strategies/StopInstanceModal.svelte";

  let { data }: { data: PageData } = $props();

  let pageLoading = $state(true);
  let definitions = $derived((data.definitions || []) as StrategyDefinition[]);
  let instances = $derived((data.instances || []) as StrategyInstanceView[]);

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
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title={$_("admin_strategy_operations_title")}
    subtitle={$_("manage_strategies")}
  />

  {#if pageLoading}
    <div class="skeleton h-24 w-full rounded-xl"></div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="skeleton h-48 w-full rounded-xl"></div>
      <div class="skeleton h-48 w-full rounded-xl"></div>
    </div>
    <div class="skeleton h-64 w-full rounded-xl"></div>
    <div class="skeleton h-64 w-full rounded-xl"></div>
  {:else}
    <StrategyOperationsBoard
      {definitions}
      {instances}
      onRefresh={refreshStrategies}
      onNewClick={openCreateModal}
    />

    <InstancesTable
      {instances}
      onStop={handleStopInstance}
      onRefresh={refreshStrategies}
    />

    <DefinitionsTable
      {definitions}
      onEdit={handleEdit}
      onRemove={handleRemove}
      onDetails={handleDetails}
      onRefresh={refreshStrategies}
      onNewClick={openCreateModal}
    />
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
