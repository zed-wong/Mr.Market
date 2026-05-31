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

<section class="min-h-screen bg-base-100 p-5 text-base-content md:p-8" data-testid="setup-wizard-page">
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <PageHeader
      eyebrow="setup"
      title="one-time setup wizard"
      subtitle="Configure the admin password, exchange access, optional credentials, seed data, and then lock setup writes."
    />

    {#if loading}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body flex-row items-center gap-3 p-5">
          <span class="loading loading-spinner loading-sm"></span>
          <span class="text-sm text-base-content/60 capitalize">loading setup state</span>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_1fr]">
        <div class="card h-fit border border-base-300 bg-base-100 shadow-none">
          <div class="card-body gap-4 p-5">
            <div class="flex flex-col gap-2">
              <span class="text-lg font-semibold text-base-content capitalize">progress</span>
              <progress class="progress progress-primary w-full" value={progressPercent} max="100"></progress>
              <span class="text-xs text-base-content/60">{progressCount} of {requiredProgressSteps.length} required setup areas complete</span>
            </div>

            <ul class="flex flex-col gap-1">
              {#each steps as step, index (step.key)}
                {@const completed = step.key === 'review' ? Boolean($setupStatus?.completedAt) : Boolean($setupStatus?.completedSteps?.[step.key])}
                {@const isCurrent = activeStep === step.key}
                {@const locked = !$setupStatus?.initialized && step.key !== 'password'}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors capitalize disabled:cursor-not-allowed disabled:opacity-50"
                    class:border-primary={isCurrent}
                    class:bg-primary={isCurrent}
                    class:text-primary-content={isCurrent}
                    class:border-base-300={!isCurrent}
                    class:hover:bg-base-300={!isCurrent}
                    disabled={locked}
                    aria-current={isCurrent ? 'step' : undefined}
                    onclick={() => (activeStep = step.key)}
                  >
                    <span
                      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      class:bg-success={completed}
                      class:text-success-content={completed}
                      class:bg-base-300={!completed && !isCurrent}
                      class:bg-primary-content={!completed && isCurrent}
                      class:text-primary={!completed && isCurrent}
                    >
                      {#if completed}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {:else}
                        {index + 1}
                      {/if}
                    </span>
                    <span class="flex-1 text-sm font-medium">{step.label}</span>
                    {#if !step.required}
                      <span class="text-[10px] opacity-60">optional</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100 shadow-none">
          <div class="card-body gap-5 p-5 md:p-7">
            {#if error}
              <div class="alert alert-error">
                <span>{error}</span>
              </div>
            {/if}

            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-col gap-1">
                <span class="text-2xl font-semibold text-base-content capitalize">{steps[stepIndex]?.label}</span>
                <span class="text-sm text-base-content/60">
                  {#if activeStep === 'password'}
                    Set the admin password before any other route becomes available.
                  {:else if activeStep === 'exchange'}
                    Add the first exchange entry using the existing exchange management API.
                  {:else if activeStep === 'seed'}
                    Seed reference data if the database is missing exchanges, tokens, pairs, config, or strategies.
                  {:else}
                    Review the required setup items. API keys and runtime settings can be configured afterwards.
                  {/if}
                </span>
              </div>
              <button
                type="button"
                class="btn bg-base-300 hover:bg-base-300 text-base-content border-none min-h-[42px] h-[42px] px-4 rounded-lg text-sm font-semibold shadow-sm capitalize"
                onclick={() => void refreshSetupStatus()}
              >
                refresh
              </button>
            </div>

            {#if activeStep === 'password'}
              <form onsubmit={(event) => { event.preventDefault(); void submitPassword(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">admin password</span>
                    <input class="input input-bordered" type="password" minlength="8" autocomplete="new-password" placeholder="at least 8 characters" bind:value={passwordForm.password} required />
                    <span class="text-xs text-base-content/60">Used to sign in to the admin console afterwards.</span>
                  </label>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">confirm password</span>
                    <input class="input input-bordered" type="password" minlength="8" autocomplete="new-password" placeholder="re-enter the password" bind:value={passwordForm.confirm} required />
                    {#if !passwordsMatch}
                      <span class="text-xs text-error">Passwords do not match.</span>
                    {/if}
                  </label>
                  <div class="md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving || !passwordsMatch} type="submit">
                      {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                      save password and sign in
                    </button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'exchange'}
              <form onsubmit={(event) => { event.preventDefault(); void submitExchange(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">exchange id</span>
                    <input class="input input-bordered" list="ccxt-exchanges" placeholder="e.g. binance, okx, bybit" bind:value={exchangeForm.exchange_id} required />
                    <span class="text-xs text-base-content/60">Lowercase CCXT identifier. Start typing to see suggestions.</span>
                  </label>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">display name</span>
                    <input class="input input-bordered" placeholder="Shown in admin UI" bind:value={exchangeForm.name} required />
                  </label>
                  <datalist id="ccxt-exchanges">
                    {#each ccxtExchanges.slice(0, 300) as exchange (exchange)}
                      <option value={exchange}>{exchange}</option>
                    {/each}
                  </datalist>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save exchange</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={goPrev}>previous</button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'seed'}
              {@const seedMissing = seedStatus?.seedRequired ?? $setupStatus?.seedRequired}
              <div class="space-y-4">
                <div class="rounded-xl border p-4 {seedMissing ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10'}">
                  <span class="block font-semibold capitalize">seed status</span>
                  <span class="text-sm text-base-content/70">
                    {seedMissing ? 'Reference data (exchanges, tokens, pairs, strategies) is missing and will be inserted.' : 'Required seed data is already present.'}
                  </span>
                </div>
                {#if seedCheckEntries.length > 0}
                  <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {#each seedCheckEntries as [name, count] (name)}
                      <div class="flex items-center justify-between rounded-xl border border-base-300 bg-base-100 px-4 py-3">
                        <span class="text-sm font-medium text-base-content capitalize">{name.replaceAll('_', ' ')}</span>
                        <span class="badge {count > 0 ? 'badge-success' : 'badge-warning'} badge-sm">{count}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="button" onclick={() => void submitSeed()}>
                    {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                    {seedMissing ? 'run database seed' : 'mark seed complete'}
                  </button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={goPrev}>previous</button>
                </div>
              </div>
            {:else}
              <div class="space-y-4">
                {#if incompleteRequiredSteps.length > 0}
                  <div class="alert alert-warning text-sm">
                    <span>
                      Complete required setup first: {incompleteRequiredSteps.map((step) => step.label).join(', ')}.
                    </span>
                  </div>
                {:else}
                  <div class="alert alert-success text-sm">
                    <span>Required setup is complete. You can lock setup-only writes now.</span>
                  </div>
                {/if}
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {#each steps.filter((step) => step.key !== 'review') as step (step.key)}
                    {@const done = Boolean($setupStatus?.completedSteps?.[step.key]) || (step.key === 'seed' && !$setupStatus?.seedRequired)}
                    <button
                      type="button"
                      class="rounded-xl border border-base-300 p-4 text-left transition-colors hover:border-primary hover:bg-base-200"
                      onclick={() => jumpToStep(step.key)}
                    >
                      <span class="flex items-center justify-between gap-2">
                        <span class="font-semibold capitalize">{step.label}</span>
                        {#if done}
                          <span class="badge badge-success badge-sm capitalize">complete</span>
                        {:else if step.required}
                          <span class="badge badge-error badge-sm capitalize">required</span>
                        {:else}
                          <span class="badge badge-ghost badge-sm capitalize">optional</span>
                        {/if}
                      </span>
                      <span class="mt-1 block text-xs text-base-content/60 capitalize">
                        {done ? 'no action needed' : 'click to open this step'}
                      </span>
                    </button>
                  {/each}
                </div>
                <div class="rounded-xl border border-base-300 bg-base-100 p-4">
                  <span class="block font-semibold text-base-content capitalize">trading credentials come next</span>
                  <span class="mt-1 block text-sm text-base-content/60">
                    API keys are not required to finish initial setup. Add and validate exchange credentials later before enabling market-making or order execution.
                  </span>
                  <a class="btn btn-ghost btn-sm mt-3 rounded-full capitalize" href="/system/connectivity/api-keys">open API key settings</a>
                </div>
                <div class="alert alert-info text-sm">
                  <span>After completion, setup config writes are disabled and this route redirects to the dashboard.</span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving || !requiredSetupComplete} type="button" onclick={() => void finishSetup()}>
                    {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                    complete setup
                  </button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={goPrev}>previous</button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
