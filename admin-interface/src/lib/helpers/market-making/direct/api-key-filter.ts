import type { AdminSingleKey } from '$lib/types/hufi/admin';
import type { GrowInfo } from '$lib/types/hufi/grow';
import {
  getApiKeyUseReadiness,
  getApiKeyPermissionViews,
  type ApiKeyRequiredCapability,
  type ApiKeyUseReadinessView,
} from '$lib/helpers/admin/api-key-readiness';

export interface DirectApiKeyUseView extends ApiKeyUseReadinessView {
  key: AdminSingleKey;
}

const addExchangeName = (names: Set<string>, exchangeName: unknown) => {
  const normalized = String(exchangeName || '').trim();
  if (normalized) {
    names.add(normalized);
  }
};

export function buildDirectOrderExchangeOptions(
  growInfo: Pick<GrowInfo, 'exchanges' | 'market_making'> | null | undefined,
  apiKeys: AdminSingleKey[],
): string[] {
  const exchangeNames = new Set<string>();

  for (const exchange of growInfo?.market_making?.exchanges ?? []) {
    addExchangeName(exchangeNames, exchange.exchange_id || exchange.name);
  }

  for (const pair of growInfo?.market_making?.pairs ?? []) {
    addExchangeName(exchangeNames, pair.exchange_id);
  }

  for (const exchange of growInfo?.exchanges ?? []) {
    addExchangeName(exchangeNames, exchange.exchange_id || exchange.name);
  }

  for (const key of apiKeys) {
    addExchangeName(exchangeNames, key.exchange);
  }

  return Array.from(exchangeNames);
}

export function isApiKeyForExchange(key: AdminSingleKey, exchangeName: string): boolean {
  const normalizedExchange = normalizeExchangeName(exchangeName);
  return !normalizedExchange || normalizeExchangeName(key.exchange) === normalizedExchange;
}

export function isReadOnlyApiKey(key: AdminSingleKey): boolean {
  const permissions = getApiKeyPermissionViews(key);

  return (
    permissions.some((view) => view.capability === 'read') &&
    !permissions.some((view) => view.capability === 'trade')
  );
}

export function getDirectApiKeyUseView(
  key: AdminSingleKey,
  requiredCapability: ApiKeyRequiredCapability = 'trade',
): DirectApiKeyUseView {
  return {
    ...getApiKeyUseReadiness(key, requiredCapability),
    key,
  };
}

export function getDirectApiKeyUseViews(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
  requiredCapability: ApiKeyRequiredCapability = 'trade',
): DirectApiKeyUseView[] {
  return apiKeys
    .filter((key) => isApiKeyForExchange(key, exchangeName))
    .map((key) => getDirectApiKeyUseView(key, requiredCapability));
}

export function filterExecutableApiKeys(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
): AdminSingleKey[] {
  return getDirectApiKeyUseViews(apiKeys, exchangeName, 'trade')
    .filter((view) => view.usable)
    .map((view) => view.key);
}

export function filterReadableApiKeys(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
): AdminSingleKey[] {
  return getDirectApiKeyUseViews(apiKeys, exchangeName, 'read')
    .filter((view) => view.usable)
    .map((view) => view.key);
}

export function filterReadOnlyApiKeys(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
): AdminSingleKey[] {
  return filterReadableApiKeys(apiKeys, exchangeName).filter(isReadOnlyApiKey);
}

export function getBlockedDirectApiKeyUseViews(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
  requiredCapability: ApiKeyRequiredCapability = 'trade',
): DirectApiKeyUseView[] {
  return getDirectApiKeyUseViews(apiKeys, exchangeName, requiredCapability).filter(
    (view) => !view.usable,
  );
}

function normalizeExchangeName(exchangeName: unknown): string {
  const normalized = String(exchangeName || '').trim().toLowerCase();

  return normalized === '—' || normalized === '-' || normalized === 'n/a'
    ? ''
    : normalized;
}
