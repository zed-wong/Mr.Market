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
    'funding.funding_account': '',
    'fees.spot_fee': '',
    'fees.market_making_fee': '',
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

  const apiPermissionOptions: Array<{ value: string; label: string; hint: string }> = [
    { value: 'read-trade', label: 'read + trade', hint: 'Required for market making and order execution.' },
    { value: 'read', label: 'read only', hint: 'Safe for monitoring; cannot place or cancel orders.' },
  ];

  const configFields: Array<{ key: keyof typeof configForm; label: string; placeholder: string; hint: string }> = [
    { key: 'funding.funding_account', label: 'funding account', placeholder: '0x… or mixin uuid', hint: 'Account that receives user deposits.' },
    { key: 'fees.spot_fee', label: 'spot fee (bps)', placeholder: 'e.g. 10', hint: 'Per-trade fee charged for spot orders, in basis points.' },
    { key: 'fees.market_making_fee', label: 'market making fee (bps)', placeholder: 'e.g. 5', hint: 'Per-fill fee charged on market-making orders.' },
  ];

  const mixinFields: Array<{ key: keyof typeof mixinEnv; label: string; placeholder: string; secret: boolean }> = [
    { key: 'MIXIN_APP_ID', label: 'app id (UUID)', placeholder: '00000000-0000-0000-0000-000000000000', secret: false },
    { key: 'MIXIN_SESSION_ID', label: 'session id (UUID)', placeholder: '00000000-0000-0000-0000-000000000000', secret: false },
    { key: 'MIXIN_SERVER_PUBLIC_KEY', label: 'server public key', placeholder: 'hex string from Mixin dashboard', secret: false },
    { key: 'MIXIN_SESSION_PRIVATE_KEY', label: 'session private key', placeholder: 'ed25519 private key', secret: true },
    { key: 'MIXIN_SPEND_PRIVATE_KEY', label: 'spend private key', placeholder: 'hex spend key', secret: true },
    { key: 'MIXIN_OAUTH_SECRET', label: 'oauth secret', placeholder: 'optional, for OAuth login', secret: true },
  ];

  const web3Fields: Array<{ key: keyof typeof web3Env; label: string; placeholder: string; secret: boolean }> = [
    { key: 'WEB3_MAINNET_RPC_URL', label: 'mainnet RPC URL', placeholder: 'https://…', secret: false },
    { key: 'WEB3_SEPOLIA_RPC_URL', label: 'sepolia RPC URL', placeholder: 'https://…', secret: false },
    { key: 'WEB3_POLYGON_RPC_URL', label: 'polygon RPC URL', placeholder: 'https://…', secret: false },
    { key: 'WEB3_PRIVATE_KEY', label: 'operator private key', placeholder: '0x…', secret: true },
    { key: 'COINGECKO_API_KEY', label: 'coingecko API key', placeholder: 'optional, for price data', secret: true },
    { key: 'DISCORD_WEBHOOK_URL', label: 'discord webhook URL', placeholder: 'optional, for alerts', secret: false },
  ];

  let passwordsMatch = $derived(
    !passwordForm.confirm || passwordForm.password === passwordForm.confirm,
  );

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
              <span class="text-xs text-base-content/60">{progressCount} of {steps.length} setup areas complete</span>
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
                  {:else if activeStep === 'apiKeys'}
                    Add the first encrypted exchange API key.
                  {:else if activeStep === 'customConfig'}
                    Optionally tune global fee and funding settings.
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
            {:else if activeStep === 'apiKeys'}
              <form onsubmit={(event) => { event.preventDefault(); void submitApiKey(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">exchange</span>
                    <input class="input input-bordered" placeholder="must match an enabled exchange id" bind:value={apiKeyForm.exchange} required />
                  </label>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">key name</span>
                    <input class="input input-bordered" placeholder="e.g. Primary key" bind:value={apiKeyForm.name} required />
                  </label>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">API key</span>
                    <input class="input input-bordered font-mono text-sm" autocomplete="off" placeholder="public key from exchange" bind:value={apiKeyForm.api_key} required />
                  </label>
                  <label class="form-control gap-2">
                    <span class="label-text capitalize">API secret</span>
                    <input class="input input-bordered font-mono text-sm" type="password" autocomplete="off" placeholder="encrypted in transit and at rest" bind:value={apiKeyForm.api_secret} required />
                  </label>
                  <label class="form-control gap-2 md:col-span-2">
                    <span class="label-text capitalize">permissions</span>
                    <select class="select select-bordered" bind:value={apiKeyForm.permissions}>
                      {#each apiPermissionOptions as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                    <span class="text-xs text-base-content/60">
                      {apiPermissionOptions.find((o) => o.value === apiKeyForm.permissions)?.hint}
                    </span>
                  </label>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save encrypted API key</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={goPrev}>previous</button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'customConfig'}
              <form onsubmit={(event) => { event.preventDefault(); void submitConfig(); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  {#each configFields as field (field.key)}
                    <label class="form-control gap-2">
                      <span class="label-text capitalize">{field.label}</span>
                      <input
                        class="input input-bordered"
                        placeholder={field.placeholder}
                        value={configForm[field.key]}
                        oninput={(event) =>
                          (configForm = {
                            ...configForm,
                            [field.key]: (event.currentTarget as HTMLInputElement).value,
                          })}
                      />
                      <span class="text-xs text-base-content/60">{field.hint}</span>
                    </label>
                  {/each}
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save custom config</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={() => void skipStep('customConfig')}>skip</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={goPrev}>previous</button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'mixin'}
              <form onsubmit={(event) => { event.preventDefault(); void submitEnv('mixin'); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  {#each mixinFields as field (field.key)}
                    <label class="form-control gap-2">
                      <span class="label-text capitalize">{field.label}</span>
                      <input
                        class="input input-bordered font-mono text-sm"
                        type={field.secret ? 'password' : 'text'}
                        autocomplete="off"
                        placeholder={field.placeholder}
                        value={mixinEnv[field.key]}
                        oninput={(event) =>
                          (mixinEnv = {
                            ...mixinEnv,
                            [field.key]: (event.currentTarget as HTMLInputElement).value,
                          })}
                      />
                    </label>
                  {/each}
                  <div class="alert alert-warning md:col-span-2 text-sm">
                    <span>Credentials are stored in the setup config database and applied to runtime config when possible.</span>
                  </div>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save Mixin config</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={() => void skipStep('mixin')}>skip</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={goPrev}>previous</button>
                  </div>
                </fieldset>
              </form>
            {:else if activeStep === 'web3'}
              <form onsubmit={(event) => { event.preventDefault(); void submitEnv('web3'); }}>
                <fieldset class="grid gap-4 md:grid-cols-2" disabled={saving}>
                  {#each web3Fields as field (field.key)}
                    <label class="form-control gap-2">
                      <span class="label-text capitalize">{field.label}</span>
                      <input
                        class="input input-bordered font-mono text-sm"
                        type={field.secret ? 'password' : 'text'}
                        autocomplete="off"
                        placeholder={field.placeholder}
                        value={web3Env[field.key]}
                        oninput={(event) =>
                          (web3Env = {
                            ...web3Env,
                            [field.key]: (event.currentTarget as HTMLInputElement).value,
                          })}
                      />
                    </label>
                  {/each}
                  <div class="alert alert-warning md:col-span-2 text-sm">
                    <span>Values are stored in the setup config database and applied to runtime config when possible.</span>
                  </div>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="submit">save Web3 config</button>
                    <button class="btn btn-ghost rounded-full capitalize" type="button" onclick={() => void skipStep('web3')}>skip</button>
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
                <div class="alert alert-info text-sm">
                  <span>After completion, setup config writes are disabled and this route redirects to the dashboard.</span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-primary rounded-full capitalize" disabled={saving} type="button" onclick={() => void finishSetup()}>
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
