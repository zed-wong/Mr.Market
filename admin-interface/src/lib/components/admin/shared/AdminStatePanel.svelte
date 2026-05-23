<script lang="ts">
  import type { AdminCommonStateKind } from '$lib/helpers/admin/common-states';

  interface Props {
    kind: AdminCommonStateKind;
    title: string;
    message: string;
    context?: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
    disabled?: boolean;
    testId?: string;
  }

  let {
    kind,
    title,
    message,
    context = '',
    actionLabel = '',
    actionHref = '',
    onAction,
    disabled = false,
    testId = 'admin-state-panel',
  }: Props = $props();

  const tone: Record<AdminCommonStateKind, string> = {
    loading: 'border-base-300',
    empty: 'border-base-300',
    error: 'border-error/30',
    permission: 'border-warning/40',
    session: 'border-warning/40',
  };
</script>

<div class="card border bg-base-100 shadow-none {tone[kind]}" data-testid={testId} aria-live={kind === 'loading' ? 'polite' : 'assertive'}>
  <div class="card-body gap-3 p-5">
    {#if context}
      <span class="text-xs font-medium tracking-wide text-base-content/50 capitalize">{context}</span>
    {/if}
    <div class="flex items-start gap-3">
      {#if kind === 'loading'}
        <span class="loading loading-spinner loading-sm text-base-content/60" aria-hidden="true"></span>
      {/if}
      <div class="flex flex-1 flex-col gap-2">
        <span class="text-lg font-semibold text-base-content capitalize">{title}</span>
        <span class="text-sm leading-relaxed text-base-content/60">{message}</span>
        {#if actionLabel}
          <div class="pt-1">
            {#if actionHref}
              <a class="btn btn-sm btn-primary capitalize" href={actionHref}>{actionLabel}</a>
            {:else if onAction}
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={onAction} {disabled}>
                {actionLabel}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
