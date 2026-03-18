const REQUIRED_SANDBOX_ENV_VARS = [
  'CCXT_SANDBOX_EXCHANGE',
  'CCXT_SANDBOX_API_KEY',
  'CCXT_SANDBOX_SECRET',
] as const;

export type SandboxExchangeTestConfig = {
  exchangeId: string;
  apiKey: string;
  secret: string;
  password?: string;
  uid?: string;
  accountLabel: string;
  account2Label?: string;
  account2ApiKey?: string;
  account2Secret?: string;
  account2Password?: string;
  account2Uid?: string;
  symbol: string;
  minRequestIntervalMs: number;
};

export function getSystemSandboxSkipReason(): string | null {
  const missingEnvVars = REQUIRED_SANDBOX_ENV_VARS.filter(
    (key) => !process.env[key]?.trim(),
  );

  if (missingEnvVars.length === 0) {
    return null;
  }

  return `missing sandbox env vars: ${missingEnvVars.join(', ')}`;
}

export function readSystemSandboxConfig(): SandboxExchangeTestConfig {
  const skipReason = getSystemSandboxSkipReason();

  if (skipReason) {
    throw new Error(skipReason);
  }

  const minRequestIntervalMs = Number(
    process.env.CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS || 100,
  );

  return {
    exchangeId: process.env.CCXT_SANDBOX_EXCHANGE!.trim(),
    apiKey: process.env.CCXT_SANDBOX_API_KEY!.trim(),
    secret: process.env.CCXT_SANDBOX_SECRET!.trim(),
    password: process.env.CCXT_SANDBOX_PASSWORD?.trim() || undefined,
    uid: process.env.CCXT_SANDBOX_UID?.trim() || undefined,
    accountLabel: process.env.CCXT_SANDBOX_ACCOUNT_LABEL?.trim() || 'default',
    account2Label: process.env.CCXT_SANDBOX_ACCOUNT2_LABEL?.trim() || undefined,
    account2ApiKey:
      process.env.CCXT_SANDBOX_ACCOUNT2_API_KEY?.trim() || undefined,
    account2Secret:
      process.env.CCXT_SANDBOX_ACCOUNT2_SECRET?.trim() || undefined,
    account2Password:
      process.env.CCXT_SANDBOX_ACCOUNT2_PASSWORD?.trim() || undefined,
    account2Uid: process.env.CCXT_SANDBOX_ACCOUNT2_UID?.trim() || undefined,
    symbol: process.env.CCXT_SANDBOX_SYMBOL?.trim() || 'BTC/USDT',
    minRequestIntervalMs:
      Number.isFinite(minRequestIntervalMs) && minRequestIntervalMs >= 0
        ? minRequestIntervalMs
        : 100,
  };
}

export function hasSecondarySystemSandboxAccount(
  config: SandboxExchangeTestConfig,
): boolean {
  return Boolean(config.account2ApiKey && config.account2Secret);
}

export async function pollUntil<T>(
  work: () => Promise<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  options?: {
    description?: string;
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 45000;
  const intervalMs = options?.intervalMs ?? 1000;
  const deadlineAtMs = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadlineAtMs) {
    try {
      const value = await work();

      if (await predicate(value)) {
        return value;
      }

      lastError = null;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(
    `Timed out waiting for ${options?.description || 'system-test condition'}`,
  );
}
