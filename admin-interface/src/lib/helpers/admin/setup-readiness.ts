import type { AdminSession } from '$lib/helpers/api/auth';
import type { AdminSystemHealthResponse } from '$lib/helpers/api/system';
import type { AdminSingleKey } from '$lib/types/hufi/admin';
import type { DirectOrderSummary, DirectWalletStatus } from '$lib/types/hufi/admin-direct-market-making';
import type { GrowInfo } from '$lib/types/hufi/grow';
import type { StrategyDefinition } from '$lib/types/hufi/strategy-definition';
import { getApiKeyReadiness, summarizeApiKeyReadiness } from './api-key-readiness';
import { getDirectOrderDisplayState } from '$lib/helpers/market-making/direct/helpers';
import { summarizeExchangeReadiness } from './exchange-readiness';

export type SetupReadinessStatus = 'loading' | 'ready' | 'needs_attention' | 'unknown' | 'failed';

export interface SetupReadinessArea {
  id: string;
  title: string;
  status: SetupReadinessStatus;
  summary: string;
  evidence: string[];
  href: string;
  actionLabel: string;
}

export interface SetupReadinessInput {
  backendReachable?: boolean;
  backendError?: string | null;
  session?: AdminSession | null;
  sessionError?: string | null;
  growInfo?: GrowInfo | null;
  growInfoError?: string | null;
  apiKeys?: AdminSingleKey[] | null;
  apiKeysError?: string | null;
  health?: AdminSystemHealthResponse | null;
  healthError?: string | null;
  wallet?: DirectWalletStatus | null;
  walletError?: string | null;
  directOrders?: DirectOrderSummary[] | null;
  directOrdersError?: string | null;
  directStrategies?: StrategyDefinition[] | null;
  directStrategiesError?: string | null;
}

export const setupStatusLabels: Record<SetupReadinessStatus, string> = {
  loading: 'loading',
  ready: 'ready',
  needs_attention: 'needs attention',
  unknown: 'unknown',
  failed: 'failed to load',
};

export const setupStatusTone: Record<SetupReadinessStatus, string> = {
  loading: 'bg-info/10 text-info',
  ready: 'bg-success/10 text-success',
  needs_attention: 'bg-warning/10 text-warning',
  unknown: 'bg-base-content/5 text-base-content/60',
  failed: 'bg-error/10 text-error',
};

const hasValue = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const errorText = (value?: string | null) => value || 'The readiness request did not complete.';

export const apiKeyReadiness = (key: AdminSingleKey): SetupReadinessStatus => {
  const readiness = getApiKeyReadiness(key);
  if (readiness.status === 'ready') return 'ready';
  if (readiness.status === 'unknown') return 'unknown';
  return 'needs_attention';
};

export const buildSetupReadiness = (input: SetupReadinessInput): SetupReadinessArea[] => {
  const exchanges = input.growInfo?.exchanges ?? [];
  const exchangeSummary = summarizeExchangeReadiness(exchanges);
  const keys = input.apiKeys ?? [];
  const keySummary = summarizeApiKeyReadiness(keys);
  const activeOrders = (input.directOrders ?? []).filter((order) =>
    ['running', 'created'].includes(getDirectOrderDisplayState(order)),
  );
  const failedOrders = (input.directOrders ?? []).filter((order) =>
    getDirectOrderDisplayState(order) === 'failed',
  );

  const backend: SetupReadinessArea = input.backendError
    ? {
        id: 'backend',
        title: 'backend reachability',
        status: 'failed',
        summary: errorText(input.backendError),
        evidence: ['Backend ping failed before setup data could be trusted.'],
        href: '/system/health',
        actionLabel: 'open system health',
      }
    : input.backendReachable
      ? {
          id: 'backend',
          title: 'backend reachability',
          status: 'ready',
          summary: 'The admin frontend can reach the Mr.Market backend.',
          evidence: ['Health ping returned successfully.'],
          href: '/system/health',
          actionLabel: 'open system health',
        }
      : {
          id: 'backend',
          title: 'backend reachability',
          status: 'loading',
          summary: 'Checking backend reachability.',
          evidence: ['Waiting for the health ping response.'],
          href: '/system/health',
          actionLabel: 'open system health',
        };

  const auth: SetupReadinessArea = input.sessionError
    ? {
        id: 'auth',
        title: 'admin authentication and session',
        status: 'failed',
        summary: errorText(input.sessionError),
        evidence: ['Session verification failed. Sign in again if this persists.'],
        href: '/system/passkeys',
        actionLabel: 'manage passkeys',
      }
    : input.session?.authenticated
      ? {
          id: 'auth',
          title: 'admin authentication and session',
          status: 'ready',
          summary: 'Your administrator session is active.',
          evidence: [input.session.username ? `Signed in as ${input.session.username}.` : 'Authenticated admin session returned by the backend.'],
          href: '/system/passkeys',
          actionLabel: 'manage passkeys',
        }
      : hasValue(input.session)
        ? {
            id: 'auth',
            title: 'admin authentication and session',
            status: 'needs_attention',
            summary: 'The backend did not confirm an authenticated admin session.',
            evidence: ['Return to login or register a passkey after signing in.'],
            href: '/system/passkeys',
            actionLabel: 'manage passkeys',
          }
        : {
            id: 'auth',
            title: 'admin authentication and session',
            status: 'loading',
            summary: 'Verifying the current admin session.',
            evidence: ['Waiting for the session check.'],
            href: '/system/passkeys',
            actionLabel: 'manage passkeys',
          };

  const exchange: SetupReadinessArea = input.growInfoError
    ? {
        id: 'exchanges',
        title: 'exchange configuration',
        status: 'failed',
        summary: errorText(input.growInfoError),
        evidence: ['Exchange readiness could not be loaded.'],
        href: '/trading/exchanges',
        actionLabel: 'manage exchanges',
      }
    : hasValue(input.growInfo)
      ? {
          id: 'exchanges',
          title: 'exchange configuration',
          status:
            exchangeSummary.ready > 0 && exchangeSummary.unknown === 0
              ? 'ready'
              : exchangeSummary.unknown > 0
                ? 'unknown'
                : 'needs_attention',
          summary:
            exchangeSummary.ready > 0 && exchangeSummary.unknown === 0
              ? `${exchangeSummary.ready} exchange${exchangeSummary.ready === 1 ? ' is' : 's are'} ready and enabled for operations.`
              : exchangeSummary.unknown > 0
                ? 'Exchange readiness is unknown for at least one configured exchange.'
                : exchanges.length > 0
                  ? 'Exchanges are configured but disabled and not usable for trading.'
                  : 'Exchange readiness is missing because no exchanges are configured yet.',
          evidence: [
            `${exchanges.length} configured exchange${exchanges.length === 1 ? '' : 's'} returned.`,
            `${exchangeSummary.ready} ready exchange${exchangeSummary.ready === 1 ? '' : 's'} returned.`,
            `${exchangeSummary.disabled} disabled exchange${exchangeSummary.disabled === 1 ? '' : 's'} returned.`,
            `${exchangeSummary.unknown} unknown exchange${exchangeSummary.unknown === 1 ? '' : 's'} returned.`,
          ],
          href: '/trading/exchanges',
          actionLabel: 'manage exchanges',
        }
      : {
          id: 'exchanges',
          title: 'exchange configuration',
          status: 'loading',
          summary: 'Loading exchange configuration.',
          evidence: ['Waiting for grow exchange data.'],
          href: '/trading/exchanges',
          actionLabel: 'manage exchanges',
        };

  const apiKeys: SetupReadinessArea = input.apiKeysError
    ? {
        id: 'api-keys',
        title: 'API key validation',
        status: 'failed',
        summary: errorText(input.apiKeysError),
        evidence: ['API key readiness could not be loaded.'],
        href: '/system/connectivity/api-keys',
        actionLabel: 'manage API keys',
      }
    : hasValue(input.apiKeys)
      ? {
          id: 'api-keys',
          title: 'API key validation',
          status:
            keySummary.ready > 0 &&
            keySummary.validation_pending === 0 &&
            keySummary.validation_failed === 0 &&
            keySummary.disabled === 0 &&
            keySummary.unknown === 0
              ? 'ready'
              : keySummary.unknown > 0
                ? 'unknown'
                : 'needs_attention',
          summary:
            keySummary.ready > 0 &&
            keySummary.validation_pending === 0 &&
            keySummary.validation_failed === 0 &&
            keySummary.disabled === 0 &&
            keySummary.unknown === 0
              ? `${keySummary.ready} API key${keySummary.ready === 1 ? ' is' : 's are'} ready.`
              : keySummary.unknown > 0
                ? 'API key readiness is unknown for at least one configured key.'
                : keySummary.validation_failed > 0
                  ? 'API key validation failed for at least one configured key.'
                  : keySummary.validation_pending > 0
                    ? 'API key validation pending for at least one configured key.'
                    : keySummary.disabled > 0
                      ? 'API keys are configured but disabled and not usable for trading.'
                      : 'API key readiness is missing because no exchange API keys are configured yet.',
          evidence: [
            `${keys.length} API key${keys.length === 1 ? '' : 's'} returned.`,
            `${keySummary.ready} ready key${keySummary.ready === 1 ? '' : 's'} returned.`,
            `${keySummary.validation_pending} validation pending key${keySummary.validation_pending === 1 ? '' : 's'} returned.`,
            `${keySummary.validation_failed} validation failed key${keySummary.validation_failed === 1 ? '' : 's'} returned.`,
            `${keySummary.disabled} disabled key${keySummary.disabled === 1 ? '' : 's'} returned.`,
            `${keySummary.unknown} unknown key${keySummary.unknown === 1 ? '' : 's'} returned.`,
          ],
          href: '/system/connectivity/api-keys',
          actionLabel: 'manage API keys',
        }
      : {
          id: 'api-keys',
          title: 'API key validation',
          status: 'loading',
          summary: 'Loading API key validation state.',
          evidence: ['Waiting for encrypted key metadata.'],
          href: '/system/connectivity/api-keys',
          actionLabel: 'manage API keys',
        };

  const systemDataLoaded = hasValue(input.health) || hasValue(input.wallet);
  const systemErrors = [input.healthError, input.walletError].filter(Boolean) as string[];
  const healthReady = input.health?.overallStatus === 'healthy';
  const walletReady = input.wallet?.configured === true;

  const walletSystem: SetupReadinessArea =
    systemErrors.length > 0 && !systemDataLoaded
      ? {
          id: 'wallet-system',
          title: 'wallet and system health',
          status: 'failed',
          summary: systemErrors.join(' · '),
          evidence: ['System health and wallet status could not be loaded.'],
          href: '/system/health',
          actionLabel: 'open system health',
        }
      : systemDataLoaded
        ? {
            id: 'wallet-system',
            title: 'wallet and system health',
            status: healthReady && walletReady ? 'ready' : 'needs_attention',
            summary:
              healthReady && walletReady
                ? 'System health is healthy and the direct wallet is configured.'
                : 'Review system health or wallet configuration before production trading.',
            evidence: [
              `System health: ${input.health?.overallStatus ?? 'unknown'}.`,
              `Direct wallet: ${walletReady ? 'configured' : input.wallet ? 'missing' : 'unknown'}.`,
              ...systemErrors.map((message) => `Load issue: ${message}.`),
            ],
            href: '/system/health',
            actionLabel: 'open system health',
          }
        : {
            id: 'wallet-system',
            title: 'wallet and system health',
            status: 'loading',
            summary: 'Loading wallet and system health.',
            evidence: ['Waiting for system health and direct wallet status.'],
            href: '/system/health',
            actionLabel: 'open system health',
          };

  const directDataLoaded = hasValue(input.directOrders) || hasValue(input.directStrategies);
  const directErrors = [input.directOrdersError, input.directStrategiesError].filter(Boolean) as string[];
  const hasStrategies = (input.directStrategies ?? []).length > 0;

  const direct: SetupReadinessArea =
    directErrors.length > 0 && !directDataLoaded
      ? {
          id: 'direct-market-making',
          title: 'direct market-making readiness',
          status: 'failed',
          summary: directErrors.join(' · '),
          evidence: ['Direct market-making readiness could not be loaded.'],
          href: '/trading/direct-market-making',
          actionLabel: 'open direct market making',
        }
      : directDataLoaded
        ? {
            id: 'direct-market-making',
            title: 'direct market-making readiness',
            status: hasStrategies && activeOrders.length > 0 && failedOrders.length === 0 ? 'ready' : 'needs_attention',
            summary:
              hasStrategies && activeOrders.length > 0 && failedOrders.length === 0
                ? `${activeOrders.length} direct order${activeOrders.length === 1 ? ' is' : 's are'} active.`
                : 'Review strategies, API keys, and order diagnostics before starting direct market making.',
            evidence: [
              `${input.directStrategies?.length ?? 0} direct strategy definition${(input.directStrategies?.length ?? 0) === 1 ? '' : 's'} returned.`,
              `${input.directOrders?.length ?? 0} direct order${(input.directOrders?.length ?? 0) === 1 ? '' : 's'} returned.`,
              `${failedOrders.length} failed order${failedOrders.length === 1 ? '' : 's'} returned.`,
              ...directErrors.map((message) => `Load issue: ${message}.`),
            ],
            href: '/trading/direct-market-making',
            actionLabel: 'open direct market making',
          }
        : {
            id: 'direct-market-making',
            title: 'direct market-making readiness',
            status: 'loading',
            summary: 'Loading direct market-making readiness.',
            evidence: ['Waiting for strategy definitions and direct orders.'],
            href: '/trading/direct-market-making',
            actionLabel: 'open direct market making',
          };

  return [backend, auth, exchange, apiKeys, walletSystem, direct];
};
