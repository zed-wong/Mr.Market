<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    completeSetup,
    completeSetupStep,
    fetchSetupSeedStatus,
    fetchSetupStatus,
    runSetupSeed,
    setSetupPassword,
    type SetupSeedStatus,
  } from '$lib/helpers/api/setup';
  import { getAccessToken } from '$lib/helpers/api/client';
  import { addExchange, getAllCcxtExchanges } from '$lib/helpers/mrm/admin/growdata';
  import { checked, correct } from '$lib/stores/auth';
  import { setupStatus } from '$lib/stores/setup';

  type StepKey =
    | 'password'
    | 'exchange'
    | 'seed'
    | 'review';

  const steps: Array<{ key: StepKey; label: string; required: boolean }> = [
    { key: 'password', label: 'admin password', required: true },
    { key: 'exchange', label: 'exchange config', required: true },
    { key: 'seed', label: 'database seed', required: true },
    { key: 'review', label: 'review and complete', required: true },
  ];

  let activeStep = $state<StepKey>('password');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let ccxtExchanges = $state<string[]>([]);
  let seedStatus = $state<SetupSeedStatus | null>(null);

  let passwordForm = $state({ password: '', confirm: '' });
  let exchangeForm = $state({ exchange_id: 'binance', name: 'Binance' });

  let passwordsMatch = $derived(
    !passwordForm.confirm || passwordForm.password === passwordForm.confirm,
  );

  let requiredProgressSteps = $derived(
    steps.filter((step) => step.required && step.key !== 'review' && (step.key !== 'seed' || $setupStatus?.seedRequired)),
  );
  let progressCount = $derived(
    requiredProgressSteps.filter((step) => Boolean($setupStatus?.completedSteps?.[step.key])).length,
  );
  let progressPercent = $derived(
    requiredProgressSteps.length > 0 ? Math.round((progressCount / requiredProgressSteps.length) * 100) : 100,
  );
  let stepIndex = $derived(steps.findIndex((step) => step.key === activeStep));
  let requiredSetupComplete = $derived(
    Boolean($setupStatus?.completedSteps?.password) &&
      Boolean($setupStatus?.completedSteps?.exchange) &&
      (!$setupStatus?.seedRequired || Boolean($setupStatus?.completedSteps?.seed)),
  );
  let incompleteRequiredSteps = $derived(
    steps.filter((step) => {
      if (!step.required || step.key === 'review') return false;
      if (step.key === 'seed' && !$setupStatus?.seedRequired) return false;
      return !Boolean($setupStatus?.completedSteps?.[step.key]);
    }),
  );
  let seedCheckEntries = $derived(Object.entries(seedStatus?.checks ?? {}));

  const getToken = () => getAccessToken() || '';

  const messageFrom = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Setup request failed';

  const refreshStatus = async () => {
    const status = await fetchSetupStatus();
    setupStatus.set(status);
    return status;
  };

  const loadAuthenticatedMetadata = async () => {
    const token = getToken();
    if (!token) return;

    const [exchanges, seed] = await Promise.all([
      getAllCcxtExchanges(token).catch(() => []),
      fetchSetupSeedStatus().catch(() => null),
    ]);

    ccxtExchanges = exchanges;
    seedStatus = seed;
  };

  const bootstrap = async (options: { throwOnError?: boolean } = {}) => {
    loading = true;
    error = '';
    try {
      const status = await refreshStatus();
      if (status.completedAt) {
        await goto('/');
        return;
      }
      if (status.initialized) {
        if (!getToken()) {
          await goto('/login');
          return;
        }
        await loadAuthenticatedMetadata();
      }
      activeStep = nextStep(status.completedSteps, status.seedRequired);
    } catch (cause) {
      error = messageFrom(cause);
      if (options.throwOnError) {
        throw new Error(error);
      }
    } finally {
      loading = false;
    }
  };

  const refreshSetupStatus = () =>
    toast.promise(bootstrap({ throwOnError: true }), {
      loading: 'refreshing setup status',
      success: 'setup status refreshed',
      error: 'failed to refresh setup status',
    });

  const nextStep = (completed: Record<string, boolean>, seedRequired: boolean): StepKey => {
    for (const step of steps) {
      if (step.key === 'review') continue;
      if (!step.required) continue;
      if (step.key === 'seed' && !seedRequired) continue;
      if (!completed?.[step.key]) {
        return step.key;
      }
    }
    return 'review';
  };

  const runAction = async (task: () => Promise<void>, success: string) => {
    saving = true;
    error = '';
    try {
      await task();
      const status = await refreshStatus();
      activeStep = nextStep(status.completedSteps, status.seedRequired);
      toast.success(success);
    } catch (cause) {
      error = messageFrom(cause);
      toast.error('setup step failed', { description: error });
    } finally {
      saving = false;
    }
  };

  const submitPassword = () =>
    runAction(async () => {
      if (passwordForm.password !== passwordForm.confirm) {
        throw new Error('Password confirmation does not match.');
      }
      await setSetupPassword(passwordForm.password);
      correct.set(true);
      checked.set(true);
      await loadAuthenticatedMetadata();
    }, 'admin password configured');

  const submitExchange = () =>
    runAction(async () => {
      const exchange_id = exchangeForm.exchange_id.trim();
      if (!exchange_id) {
        throw new Error('Choose an exchange.');
      }
      await addExchange(
        {
          exchange_id,
          name: exchangeForm.name.trim() || exchange_id,
          icon_url: '',
          enable: true,
        },
        getToken(),
      );
      await completeSetupStep('exchange');
    }, 'exchange configured');

  const submitSeed = () =>
    runAction(async () => {
      if (seedStatus?.seedRequired ?? $setupStatus?.seedRequired) {
        await runSetupSeed();
      }
      await completeSetupStep('seed');
      seedStatus = await fetchSetupSeedStatus();
    }, 'database seed complete');

  const finishSetup = () =>
    runAction(async () => {
      if (!requiredSetupComplete) {
        throw new Error('Complete the required setup steps before locking setup.');
      }
      await completeSetup();
      await refreshStatus();
      await goto('/');
    }, 'setup complete');

  const jumpToStep = (key: StepKey) => {
    if (!$setupStatus?.initialized && key !== 'password') return;
    activeStep = key;
  };

  const goPrev = () => {
    if (stepIndex > 0) activeStep = steps[stepIndex - 1].key;
  };

  onMount(() => {
    void bootstrap();
  });
</script>

<section class="min-h-screen bg-base-100 px-5 py-8 text-base-content md:px-10 md:py-12" data-testid="setup-wizard-page">
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-8">
    <div class="relative overflow-hidden rounded-[2rem] border border-base-300 bg-base-100 shadow-sm">
      <div class="absolute inset-y-0 left-0 w-1 bg-base-content"></div>
      <div class="grid gap-6 p-6 md:grid-cols-[1fr_18rem] md:p-8">
        <PageHeader
          eyebrow="setup ledger"
          title="initialize admin operations"
          subtitle="Create the admin access path, register one exchange, seed required reference data, then lock setup-only writes. Trading credentials and runtime tuning stay in their own settings pages."
        />
        <div class="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-4">
            <span class="block text-xs text-base-content/50 capitalize">required progress</span>
            <span class="mt-1 block text-3xl font-semibold text-base-content">{progressPercent}%</span>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-4">
            <span class="block text-xs text-base-content/50 capitalize">setup scope</span>
            <span class="mt-1 block text-sm font-semibold text-base-content capitalize">minimum viable admin</span>
          </div>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="rounded-[1.5rem] border border-base-300 bg-base-100 p-6 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="loading loading-spinner loading-sm"></span>
          <span class="text-sm text-base-content/60 capitalize">loading setup state</span>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <aside class="h-fit rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
          <div class="flex items-end justify-between gap-4 border-b border-base-300 pb-5">
            <div class="flex flex-col gap-1">
              <span class="text-sm font-semibold text-base-content capitalize">initialization checklist</span>
              <span class="text-xs text-base-content/50">{progressCount} of {requiredProgressSteps.length} required complete</span>
            </div>
            <span class="font-mono text-sm text-base-content/60">{progressPercent}%</span>
          </div>
          <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-base-300">
            <div class="h-full rounded-full bg-base-content transition-all" style={`width: ${progressPercent}%`}></div>
          </div>

          <ul class="mt-5 flex flex-col">
            {#each steps as step, index (step.key)}
              {@const completed = step.key === 'review' ? Boolean($setupStatus?.completedAt) : Boolean($setupStatus?.completedSteps?.[step.key])}
              {@const isCurrent = activeStep === step.key}
              {@const locked = !$setupStatus?.initialized && step.key !== 'password'}
              <li class="border-b border-base-300 last:border-b-0">
                <button
                  type="button"
                  class="group flex w-full items-center gap-3 py-4 text-left transition-colors capitalize disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={locked}
                  aria-current={isCurrent ? 'step' : undefined}
                  onclick={() => (activeStep = step.key)}
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors"
                    class:border-success={completed}
                    class:bg-success={completed}
                    class:text-success-content={completed}
                    class:border-base-content={isCurrent && !completed}
                    class:bg-base-content={isCurrent && !completed}
                    class:text-base-100={isCurrent && !completed}
                    class:border-base-300={!isCurrent && !completed}
                    class:text-base-content={!isCurrent && !completed}
                  >
                    {#if completed}
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {:else}
                      {index + 1}
                    {/if}
                  </span>
                  <span class="flex flex-1 flex-col gap-0.5">
                    <span class="text-sm font-semibold text-base-content">{step.label}</span>
                    <span class="text-xs text-base-content/50">
                      {completed ? 'Complete' : isCurrent ? 'In review' : locked ? 'Locked until password' : 'Required'}
                    </span>
                  </span>
                  {#if isCurrent}
                    <span class="h-2 w-2 rounded-full bg-base-content"></span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </aside>

        <main class="overflow-hidden rounded-[1.5rem] border border-base-300 bg-base-100 shadow-sm">
          <div class="border-b border-base-300 p-5 md:p-7">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex max-w-2xl flex-col gap-2">
                <span class="text-xs font-semibold text-base-content/50 capitalize">step {Math.max(stepIndex + 1, 1)} of {steps.length}</span>
                <span class="text-2xl font-semibold tracking-tight text-base-content capitalize md:text-3xl">{steps[stepIndex]?.label}</span>
                <span class="text-sm leading-6 text-base-content/60">
                  {#if activeStep === 'password'}
                    Set the admin password before any protected admin route becomes available.
                  {:else if activeStep === 'exchange'}
                    Register the first exchange venue. API credentials are intentionally configured later.
                  {:else if activeStep === 'seed'}
                    Verify required reference data and insert missing exchanges, tokens, pairs, config, or strategy definitions.
                  {:else}
                    Review required setup only. API keys and runtime settings can be configured afterwards.
                  {/if}
                </span>
              </div>
              <button
                type="button"
                class="btn min-h-10 h-10 rounded-full border border-base-300 bg-base-100 px-4 text-sm font-semibold text-base-content shadow-none hover:bg-base-300 capitalize"
                onclick={() => void refreshSetupStatus()}
              >
                refresh
              </button>
            </div>
          </div>

          <div class="p-5 md:p-7">
            {#if error}
              <div class="mb-5 rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-error">
                <span>{error}</span>
              </div>
            {/if}

            {#if activeStep === 'password'}
              <form onsubmit={(event) => { event.preventDefault(); void submitPassword(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  <label class="form-control gap-2 rounded-2xl border border-base-300 bg-base-100 p-4">
                    <span class="label-text font-semibold capitalize">admin password</span>
                    <input class="input input-bordered bg-base-100" type="password" minlength="8" autocomplete="new-password" placeholder="at least 8 characters" bind:value={passwordForm.password} required />
                    <span class="text-xs text-base-content/60">Used to sign in to the admin console afterwards.</span>
                  </label>
                  <label class="form-control gap-2 rounded-2xl border border-base-300 bg-base-100 p-4">
                    <span class="label-text font-semibold capitalize">confirm password</span>
                    <input class="input input-bordered bg-base-100" type="password" minlength="8" autocomplete="new-password" placeholder="re-enter the password" bind:value={passwordForm.confirm} required />
                    {#if !passwordsMatch}
                      <span class="text-xs text-error">Passwords do not match.</span>
                    {:else}
                      <span class="text-xs text-base-content/50">Confirmation keeps accidental lockout away.</span>
                    {/if}
                  </label>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full px-5 capitalize" disabled={saving || !passwordsMatch} type="submit">
                      {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                      save password and sign in
                    </button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'exchange'}
              <form onsubmit={(event) => { event.preventDefault(); void submitExchange(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  <label class="form-control gap-2 rounded-2xl border border-base-300 bg-base-100 p-4">
                    <span class="label-text font-semibold capitalize">exchange id</span>
                    <input class="input input-bordered bg-base-100" list="ccxt-exchanges" placeholder="e.g. binance, okx, bybit" bind:value={exchangeForm.exchange_id} required />
                    <span class="text-xs text-base-content/60">Lowercase CCXT identifier. Start typing to see suggestions.</span>
                  </label>
                  <label class="form-control gap-2 rounded-2xl border border-base-300 bg-base-100 p-4">
                    <span class="label-text font-semibold capitalize">display name</span>
                    <input class="input input-bordered bg-base-100" placeholder="Shown in admin UI" bind:value={exchangeForm.name} required />
                    <span class="text-xs text-base-content/60">Keep it recognizable for operators.</span>
                  </label>
                  <datalist id="ccxt-exchanges">
                    {#each ccxtExchanges.slice(0, 300) as exchange (exchange)}
                      <option value={exchange}>{exchange}</option>
                    {/each}
                  </datalist>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full px-5 capitalize" disabled={saving} type="submit">save exchange</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={goPrev}>previous</button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'seed'}
              {@const seedMissing = seedStatus?.seedRequired ?? $setupStatus?.seedRequired}
              <div class="space-y-5">
                <div class="rounded-2xl border border-base-300 bg-base-100 p-5">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="flex flex-col gap-1">
                      <span class="text-base font-semibold text-base-content capitalize">seed status</span>
                      <span class="text-sm leading-6 text-base-content/60">
                        {seedMissing ? 'Reference data is missing and will be inserted before setup is locked.' : 'Required seed data is already present.'}
                      </span>
                    </div>
                    <span class="badge {seedMissing ? 'badge-warning' : 'badge-success'} badge-lg capitalize">{seedMissing ? 'missing data' : 'ready'}</span>
                  </div>
                </div>
                {#if seedCheckEntries.length > 0}
                  <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
                    {#each seedCheckEntries as [name, count] (name)}
                      <div class="flex items-center justify-between border-b border-base-300 px-5 py-3 last:border-b-0">
                        <span class="text-sm font-medium text-base-content capitalize">{name.replaceAll('_', ' ')}</span>
                        <span class="font-mono text-sm {count > 0 ? 'text-success' : 'text-warning'}">{count}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-primary rounded-full px-5 capitalize" disabled={saving} type="button" onclick={() => void submitSeed()}>
                    {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                    {seedMissing ? 'run database seed' : 'mark seed complete'}
                  </button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={goPrev}>previous</button>
                </div>
              </div>
            {:else}
              <div class="space-y-5">
                {#if incompleteRequiredSteps.length > 0}
                  <div class="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                    <span>Complete required setup first: {incompleteRequiredSteps.map((step) => step.label).join(', ')}.</span>
                  </div>
                {:else}
                  <div class="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">
                    <span>Required setup is complete. You can lock setup-only writes now.</span>
                  </div>
                {/if}

                <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
                  {#each steps.filter((step) => step.key !== 'review') as step, index (step.key)}
                    {@const done = Boolean($setupStatus?.completedSteps?.[step.key]) || (step.key === 'seed' && !$setupStatus?.seedRequired)}
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-4 border-b border-base-300 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-base-300"
                      onclick={() => jumpToStep(step.key)}
                    >
                      <span class="flex items-center gap-3">
                        <span class="font-mono text-xs text-base-content/40">0{index + 1}</span>
                        <span class="flex flex-col gap-1">
                          <span class="font-semibold text-base-content capitalize">{step.label}</span>
                          <span class="text-xs text-base-content/50 capitalize">{done ? 'no action needed' : 'click to open this step'}</span>
                        </span>
                      </span>
                      <span class="badge {done ? 'badge-success' : 'badge-error'} badge-sm capitalize">{done ? 'complete' : 'required'}</span>
                    </button>
                  {/each}
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="rounded-2xl border border-base-300 bg-base-100 p-5">
                    <span class="block text-sm font-semibold text-base-content capitalize">trading credentials come next</span>
                    <span class="mt-2 block text-sm leading-6 text-base-content/60">
                      API keys are not required to finish initial setup. Add and validate exchange credentials before market-making or order execution.
                    </span>
                    <a class="btn btn-ghost btn-sm mt-4 rounded-full capitalize" href="/system/connectivity/api-keys">open API key settings</a>
                  </div>
                  <div class="rounded-2xl border border-base-300 bg-base-300 p-5">
                    <span class="block text-sm font-semibold text-base-content capitalize">setup lock behavior</span>
                    <span class="mt-2 block text-sm leading-6 text-base-content/60">
                      Completion disables setup-only writes and redirects this route back to the dashboard.
                    </span>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 border-t border-base-300 pt-5">
                  <button class="btn btn-primary rounded-full px-5 capitalize" disabled={saving || !requiredSetupComplete} type="button" onclick={() => void finishSetup()}>
                    {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                    complete setup
                  </button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={goPrev}>previous</button>
                </div>
              </div>
            {/if}
          </div>
        </main>
      </div>
    {/if}
  </div>
</section>
