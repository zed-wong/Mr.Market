<script lang="ts">
  import { _ } from "svelte-i18n";
  import {
    formatRelativeTime,
    getControllerTypeLabel,
    getStatusClasses,
    getStatusLabel,
  } from "$lib/helpers/admin/settings/strategies/helpers";
  import type {
    StrategyDefinition,
    StrategyInstanceView,
  } from "$lib/types/hufi/strategy-definition";

  export let definitions: StrategyDefinition[] = [];
  export let instances: StrategyInstanceView[] = [];
  export let onRefresh: () => void;
  export let onNewClick: () => void;

  function needsAttention(instance: StrategyInstanceView): boolean {
    return ["failed", "stale"].includes(instance.status);
  }

  function ownerLabel(instance: StrategyInstanceView): string {
    return instance.clientId || instance.userId || "—";
  }

  function runName(instance: StrategyInstanceView): string {
    return instance.definitionName || instance.definitionKey || instance.strategyKey || "—";
  }

  function shortValue(value: string | undefined, head = 12, tail = 10): string {
    if (!value) return "—";
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  $: totalRuns = instances.length;
  $: runningRuns = instances.filter((i) => i.status === "running").length;
  $: attentionRuns = instances.filter(needsAttention).length;
  $: enabledTemplates = definitions.filter((d) => d.enabled).length;
  $: disabledTemplates = definitions.length - enabledTemplates;
  $: attentionQueue = instances
    .filter(needsAttention)
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);
  $: recentRuns = instances
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  $: latestRun = recentRuns[0];
  $: enabledTypes = Array.from(
    new Set(definitions.filter((d) => d.enabled).map((d) => d.controllerType).filter(Boolean)),
  );
  $: healthLabel = attentionRuns > 0
    ? $_("admin_strategy_health_attention")
    : runningRuns > 0
      ? $_("admin_strategy_health_running")
      : totalRuns > 0
        ? $_("admin_strategy_health_idle")
        : $_("admin_strategy_health_empty");
  $: healthClasses = attentionRuns > 0
    ? "border-warning/30 bg-warning/5 text-warning"
    : runningRuns > 0
      ? "border-success/30 bg-success/5 text-success"
      : "border-base-300 bg-base-200/40 text-base-content/70";
</script>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
  <div class="card card-surface shadow-none">
    <div class="card-body gap-5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-base-content/55">
              {$_("admin_strategy_ops_snapshot")}
            </span>
            <span class="rounded-full border px-2 py-0.5 text-xs font-semibold {healthClasses}">
              {healthLabel}
            </span>
          </div>
          <h2 class="mt-2 text-xl font-semibold text-base-content">
            {$_("admin_strategy_ops_headline")}
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-base-content/55">
            {$_("admin_strategy_ops_subtitle")}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm btn-ghost" on:click={onRefresh}>
            {$_("admin_strategy_refresh")}
          </button>
          <button class="btn btn-sm btn-primary" on:click={() => scrollTo("instances-table")}>
            {$_("admin_strategy_review_runs")}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          class="rounded-lg border border-base-300 bg-base-100 p-4 text-left transition-colors hover:bg-base-200/60"
          on:click={() => scrollTo("instances-table")}
        >
          <span class="text-xs font-semibold text-base-content/45">
            {$_("admin_strategy_needs_attention")}
          </span>
          <span class="mt-2 block font-mono text-3xl font-semibold {attentionRuns > 0 ? 'text-warning' : 'text-base-content'}">
            {attentionRuns}
          </span>
          <span class="mt-1 block text-xs text-base-content/45">
            {$_("admin_strategy_attention_hint")}
          </span>
        </button>

        <button
          class="rounded-lg border border-base-300 bg-base-100 p-4 text-left transition-colors hover:bg-base-200/60"
          on:click={() => scrollTo("instances-table")}
        >
          <span class="text-xs font-semibold text-base-content/45">
            {$_("admin_strategy_running_now")}
          </span>
          <span class="mt-2 block font-mono text-3xl font-semibold text-success">
            {runningRuns}
          </span>
          <span class="mt-1 block text-xs text-base-content/45">
            {totalRuns} {$_("admin_strategy_total_runs_hint")}
          </span>
        </button>

        <div class="rounded-lg border border-base-300 bg-base-100 p-4">
          <span class="text-xs font-semibold text-base-content/45">
            {$_("admin_strategy_latest_activity")}
          </span>
          {#if latestRun}
            <span class="mt-2 block truncate text-sm font-semibold text-base-content">
              {runName(latestRun)}
            </span>
            <span class="mt-1 block text-xs text-base-content/45">
              {formatRelativeTime(latestRun.updatedAt)}
            </span>
          {:else}
            <span class="mt-2 block text-sm font-semibold text-base-content/50">
              {$_("admin_strategy_no_instances")}
            </span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="card card-surface shadow-none">
    <div class="card-body gap-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-base-content">
            {$_("admin_strategy_attention_queue")}
          </h2>
          <p class="mt-1 text-sm text-base-content/50">
            {$_("admin_strategy_attention_queue_hint")}
          </p>
        </div>
        <button class="btn btn-xs btn-ghost" on:click={() => scrollTo("instances-table")}>
          {$_("admin_strategy_details")}
        </button>
      </div>

      {#if attentionQueue.length > 0}
        <div class="space-y-2">
          {#each attentionQueue as instance}
            <button
              class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-200/60"
              on:click={() => scrollTo("instances-table")}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-base-content">
                    {runName(instance)}
                  </div>
                  <div class="mt-1 truncate text-xs text-base-content/50" title={instance.strategyKey}>
                    {shortValue(instance.strategyKey, 14, 12)}
                  </div>
                </div>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold {getStatusClasses(instance.status)}">
                  {getStatusLabel(instance.status)}
                </span>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-base-content/45">
                <span class="truncate">{ownerLabel(instance)}</span>
                <span class="shrink-0">{formatRelativeTime(instance.updatedAt)}</span>
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="rounded-lg border border-success/20 bg-success/5 p-4 text-sm text-success">
          {$_("admin_strategy_no_attention_instances")}
        </div>
      {/if}
    </div>
  </div>
</div>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
  <div class="card card-surface shadow-none">
    <div class="card-body gap-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-base-content">
            {$_("admin_strategy_launch_readiness")}
          </h2>
          <p class="mt-1 text-sm text-base-content/50">
            {$_("admin_strategy_launch_readiness_hint")}
          </p>
        </div>
        <button class="btn btn-xs btn-ghost" on:click={onNewClick}>
          {$_("admin_strategy_new_definition")}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-lg bg-base-200/60 p-3">
          <span class="block text-xs text-base-content/45">{$_("admin_strategy_templates")}</span>
          <span class="mt-1 block font-mono text-xl font-semibold">{definitions.length}</span>
        </div>
        <div class="rounded-lg bg-base-200/60 p-3">
          <span class="block text-xs text-base-content/45">{$_("admin_strategy_enabled")}</span>
          <span class="mt-1 block font-mono text-xl font-semibold text-success">{enabledTemplates}</span>
        </div>
        <div class="rounded-lg bg-base-200/60 p-3">
          <span class="block text-xs text-base-content/45">{$_("disabled")}</span>
          <span class="mt-1 block font-mono text-xl font-semibold">{disabledTemplates}</span>
        </div>
      </div>

      {#if enabledTypes.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each enabledTypes as type}
            <span class="rounded-full bg-base-200 px-2.5 py-1 text-xs font-semibold text-base-content/70">
              {getControllerTypeLabel(type)}
            </span>
          {/each}
        </div>
      {:else}
        <div class="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning">
          {$_("admin_strategy_no_enabled_templates")}
        </div>
      {/if}
    </div>
  </div>

  <div class="card card-surface shadow-none">
    <div class="card-body gap-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-base-content">
            {$_("admin_strategy_recent_activity")}
          </h2>
          <p class="mt-1 text-sm text-base-content/50">
            {$_("admin_strategy_recent_activity_hint")}
          </p>
        </div>
        <button class="btn btn-xs btn-ghost" on:click={() => scrollTo("instances-table")}>
          {$_("admin_strategy_view_all_instances")}
        </button>
      </div>

      {#if recentRuns.length > 0}
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          {#each recentRuns as instance}
            <div class="rounded-lg border border-base-300 bg-base-100 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-sm font-semibold text-base-content">
                  {runName(instance)}
                </span>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold {getStatusClasses(instance.status)}">
                  {getStatusLabel(instance.status)}
                </span>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-base-content/45">
                <span class="truncate">{ownerLabel(instance)}</span>
                <span class="shrink-0">{formatRelativeTime(instance.updatedAt)}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="rounded-lg border border-base-300 bg-base-100 p-4 text-sm text-base-content/50">
          {$_("admin_strategy_no_instances")}
        </div>
      {/if}
    </div>
  </div>
</div>
