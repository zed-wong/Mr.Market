import type { AdminSingleKey } from '$lib/types/hufi/admin';
import {
  getApiKeyUseReadiness,
  type ApiKeyRequiredCapability,
  type ApiKeyUseReadinessView,
} from '$lib/helpers/admin/api-key-readiness';

export interface DirectApiKeyUseView extends ApiKeyUseReadinessView {
  key: AdminSingleKey;
}

export function isApiKeyForExchange(key: AdminSingleKey, exchangeName: string): boolean {
  return !exchangeName || key.exchange === exchangeName;
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

export function getBlockedDirectApiKeyUseViews(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
  requiredCapability: ApiKeyRequiredCapability = 'trade',
): DirectApiKeyUseView[] {
  return getDirectApiKeyUseViews(apiKeys, exchangeName, requiredCapability).filter(
    (view) => !view.usable,
  );
}
