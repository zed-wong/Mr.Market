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
    writeSetupEnv,
    type SetupSeedStatus,
  } from '$lib/helpers/api/setup';
  import { updateAdminSystemConfig } from '$lib/helpers/api/system';
  import { getAccessToken } from '$lib/helpers/api/client';
  import { addAPIKey, getEncryptionPublicKey } from '$lib/helpers/mrm/admin/exchanges';
  import { addExchange, getAllCcxtExchanges } from '$lib/helpers/mrm/admin/growdata';
  import { encryptSecret } from '$lib/helpers/encryption/crypto';
  import { checked, correct } from '$lib/stores/auth';
  import { setupStatus } from '$lib/stores/setup';

  type StepKey =
    | 'password'
    | 'exchange'
    | 'apiKeys'
    | 'customConfig'
    | 'mixin'
    | 'web3'
    | 'seed'
    | 'review';

  const steps: Array<{ key: StepKey; label: string; required: boolean }> = [
    { key: 'password', label: 'admin password', required: true },
    { key: 'exchange', label: 'exchange config', required: true },
    { key: 'apiKeys', label: 'API keys', required: true },
    { key: 'customConfig', label: 'custom config', required: false },
    { key: 'mixin', label: 'Mixin credentials', required: false },
    { key: 'web3', label: 'Web3 and other', required: false },
    { key: 'seed', label: 'database seed', required: true },
    { key: 'review', label: 'review and complete', required: true },
  ];

  let activeStep = $state<StepKey>('password');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let ccxtExchanges = $state<string[]>([]);
  let seedStatus = $state<SetupSeedStatus | null>(null);
  let publicKey = $state('');

  let passwordForm = $state({ password: '', confirm: '' });
  let exchangeForm = $state({ exchange_id: 'binance', name: 'Binance' });
  let apiKeyForm = $state({
    exchange: 'binance',
    name: 'Primary key',
    api_key: '',
    api_secret: '',
    permissions: 'read-trade',
  });
  let configForm = $state({
    max_balance_mixin_bot: '',
    max_balance_single_api_key: '',
    funding_account: '',
    spot_fee: '',
    market_making_fee: '',
  });
  let mixinEnv = $state({
    MIXIN_APP_ID: '',
    MIXIN_SESSION_ID: '',
    MIXIN_SERVER_PUBLIC_KEY: '',
    MIXIN_SESSION_PRIVATE_KEY: '',
    MIXIN_SPEND_PRIVATE_KEY: '',
    MIXIN_OAUTH_SECRET: '',
  });
  let web3Env = $state({
    WEB3_MAINNET_RPC_URL: '',
    WEB3_SEPOLIA_RPC_URL: '',
    WEB3_POLYGON_RPC_URL: '',
    WEB3_PRIVATE_KEY: '',
    COINGECKO_API_KEY: '',
    DISCORD_WEBHOOK_URL: '',
  });

  let progressCount = $derived(
    steps.filter((step) =>
      step.key === 'review'
        ? Boolean($setupStatus?.completedAt)
        : Boolean($setupStatus?.completedSteps?.[step.key]),
    ).length,
  );
  let progressPercent = $derived(Math.round((progressCount / steps.length) * 100));
  let stepIndex = $derived(steps.findIndex((step) => step.key === activeStep));

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

    const [exchanges, seed, keyPair] = await Promise.all([
      getAllCcxtExchanges(token).catch(() => []),
      fetchSetupSeedStatus().catch(() => null),
      getEncryptionPublicKey(token).catch(() => ({ publicKey: '' })),
    ]);

    ccxtExchanges = exchanges;
    seedStatus = seed;
    publicKey = keyPair.publicKey || '';
  };

  const bootstrap = async () => {
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
    } finally {
      loading = false;
    }
  };

  const nextStep = (completed: Record<string, boolean>, seedRequired: boolean): StepKey => {
    for (const step of steps) {
      if (step.key === 'review') continue;
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

  const submitApiKey = () =>
    runAction(async () => {
      if (!publicKey) {
        const keyPair = await getEncryptionPublicKey(getToken());
        publicKey = keyPair.publicKey || '';
      }
      if (!publicKey) {
        throw new Error('Encryption public key is unavailable.');
      }
      const encryptedSecret = await encryptSecret(apiKeyForm.api_secret, publicKey);
      await addAPIKey(
        {
          exchange: apiKeyForm.exchange.trim(),
          name: apiKeyForm.name.trim(),
          api_key: apiKeyForm.api_key.trim(),
          api_secret: encryptedSecret,
          permissions: apiKeyForm.permissions,
        },
        getToken(),
      );
      await completeSetupStep('apiKeys');
    }, 'API key saved');

  const submitConfig = () =>
    runAction(async () => {
      for (const [key, value] of Object.entries(configForm)) {
        if (String(value).trim()) {
          await updateAdminSystemConfig(key, value);
        }
      }
      await completeSetupStep('customConfig');
    }, 'custom config saved');

  const submitEnv = (kind: 'mixin' | 'web3') =>
    runAction(async () => {
      await writeSetupEnv(kind === 'mixin' ? mixinEnv : web3Env);
      await completeSetupStep(kind);
    }, `${kind} environment saved`);

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
      await completeSetup();
      await refreshStatus();
      await goto('/');
    }, 'setup complete');

  const skipStep = (step: StepKey) =>
    runAction(async () => {
      await completeSetupStep(step);
    }, 'optional step skipped');

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
              <span class="text-xs text-base-content/60">{progressCount} of {steps.length} setup areas complete</span>
            </div>

            <div class="flex flex-col gap-2">
              {#each steps as step, index (step.key)}
                {@const completed = step.key === 'review' ? Boolean($setupStatus?.completedAt) : Boolean($setupStatus?.completedSteps?.[step.key])}
                <button
                  type="button"
                  class="btn justify-start rounded-full capitalize"
                  class:btn-primary={activeStep === step.key}
                  class:btn-ghost={activeStep !== step.key}
                  disabled={!$setupStatus?.initialized && step.key !== 'password'}
                  onclick={() => (activeStep = step.key)}
                >
                  <span class="badge {completed ? 'badge-success' : 'badge-ghost'}">{index + 1}</span>
                  <span>{step.label}</span>
                  {#if step.required}<span class="badge badge-xs badge-outline">required</span>{/if}
                </button>
              {/each}
            </div>
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
                  {:else if activeStep === 'apiKeys'}
                    Add the first encrypted exchange API key.
                  {:else if activeStep === 'customConfig'}
                    Optionally tune global limits and fee settings.
                  {:else if activeStep === 'mixin'}
                    Optionally save Mixin credentials in the setup config database.
                  {:else if activeStep === 'web3'}
                    Optionally save Web3, CoinGecko, and Discord config in the setup config database.
                  {:else if activeStep === 'seed'}
                    Seed reference data if the database is missing exchanges, tokens, pairs, config, or strategies.
                  {:else}
                    Review required steps and complete the one-time setup.
                  {/if}
                </span>
              </div>
              <button type="button" class="btn btn-outline btn-sm rounded-full capitalize" onclick={() => void bootstrap()}>
                refresh
              </button>
            </div>

            {#if activeStep === 'password'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitPassword(); }}>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">admin password</span>
                  <input class="input input-bordered" type="password" minlength="8" bind:value={passwordForm.password} required />
                </label>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">confirm password</span>
                  <input class="input input-bordered" type="password" minlength="8" bind:value={passwordForm.confirm} required />
                </label>
                <div class="md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">
                    {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
                    save password and sign in
                  </button>
                </div>
              </form>
            {:else if activeStep === 'exchange'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitExchange(); }}>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">exchange id</span>
                  <input class="input input-bordered" list="ccxt-exchanges" bind:value={exchangeForm.exchange_id} required />
                </label>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">display name</span>
                  <input class="input input-bordered" bind:value={exchangeForm.name} required />
                </label>
                <datalist id="ccxt-exchanges">
                  {#each ccxtExchanges.slice(0, 300) as exchange (exchange)}
                    <option value={exchange}>{exchange}</option>
                  {/each}
                </datalist>
                <div class="md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save exchange</button>
                </div>
              </form>
            {:else if activeStep === 'apiKeys'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitApiKey(); }}>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">exchange</span>
                  <input class="input input-bordered" bind:value={apiKeyForm.exchange} required />
                </label>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">key name</span>
                  <input class="input input-bordered" bind:value={apiKeyForm.name} required />
                </label>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">API key</span>
                  <input class="input input-bordered" bind:value={apiKeyForm.api_key} required />
                </label>
                <label class="form-control gap-2">
                  <span class="label-text capitalize">API secret</span>
                  <input class="input input-bordered" type="password" bind:value={apiKeyForm.api_secret} required />
                </label>
                <div class="md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save encrypted API key</button>
                </div>
              </form>
            {:else if activeStep === 'customConfig'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitConfig(); }}>
                {#each Object.keys(configForm) as key (key)}
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">{key.replaceAll('_', ' ')}</span>
                    <input
                      class="input input-bordered"
                      value={configForm[key as keyof typeof configForm]}
                      oninput={(event) =>
                        (configForm = {
                          ...configForm,
                          [key]: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  </label>
                {/each}
                <div class="flex flex-wrap gap-2 md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save custom config</button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={() => void skipStep('customConfig')}>skip</button>
                </div>
              </form>
            {:else if activeStep === 'mixin'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitEnv('mixin'); }}>
                {#each Object.keys(mixinEnv) as key (key)}
                  <label class="form-control gap-2">
                    <span class="label-text">{key}</span>
                    <input
                      class="input input-bordered"
                      type={key.includes('KEY') || key.includes('SECRET') ? 'password' : 'text'}
                      value={mixinEnv[key as keyof typeof mixinEnv]}
                      oninput={(event) =>
                        (mixinEnv = {
                          ...mixinEnv,
                          [key]: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  </label>
                {/each}
                <div class="alert alert-warning md:col-span-2">
                  <span>Credentials are stored in the setup config database and applied to runtime config when possible.</span>
                </div>
                <div class="flex flex-wrap gap-2 md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save Mixin config</button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={() => void skipStep('mixin')}>skip</button>
                </div>
              </form>
            {:else if activeStep === 'web3'}
              <form class="grid gap-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void submitEnv('web3'); }}>
                {#each Object.keys(web3Env) as key (key)}
                  <label class="form-control gap-2">
                    <span class="label-text">{key}</span>
                    <input
                      class="input input-bordered"
                      type={key.includes('KEY') ? 'password' : 'text'}
                      value={web3Env[key as keyof typeof web3Env]}
                      oninput={(event) =>
                        (web3Env = {
                          ...web3Env,
                          [key]: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  </label>
                {/each}
                <div class="alert alert-warning md:col-span-2">
                  <span>Values are stored in the setup config database and applied to runtime config when possible.</span>
                </div>
                <div class="flex flex-wrap gap-2 md:col-span-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save Web3 config</button>
                  <button class="btn btn-ghost rounded-full capitalize" disabled={saving} type="button" onclick={() => void skipStep('web3')}>skip</button>
                </div>
              </form>
            {:else if activeStep === 'seed'}
              <div class="space-y-4">
                <div class="rounded-xl border border-base-300 p-4">
                  <span class="block font-semibold capitalize">seed status</span>
                  <span class="text-sm text-base-content/60">
                    {seedStatus?.seedRequired ?? $setupStatus?.seedRequired ? 'Seed data is missing.' : 'Required seed data is already present.'}
                  </span>
                </div>
                <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="button" onclick={() => void submitSeed()}>
                  {seedStatus?.seedRequired ?? $setupStatus?.seedRequired ? 'run database seed' : 'mark seed complete'}
                </button>
              </div>
            {:else}
              <div class="space-y-4">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {#each steps.filter((step) => step.key !== 'review') as step (step.key)}
                    {@const done = Boolean($setupStatus?.completedSteps?.[step.key]) || (step.key === 'seed' && !$setupStatus?.seedRequired)}
                    <div class="rounded-xl border border-base-300 p-4">
                      <span class="block font-semibold capitalize">{step.label}</span>
                      <span class="text-sm {done ? 'text-success' : step.required ? 'text-error' : 'text-base-content/60'}">
                        {done ? 'complete' : step.required ? 'required before completion' : 'optional'}
                      </span>
                    </div>
                  {/each}
                </div>
                <div class="alert alert-info">
                  <span>After completion, setup config writes are disabled and this route redirects to the dashboard.</span>
                </div>
                <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="button" onclick={() => void finishSetup()}>
                  complete setup
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
