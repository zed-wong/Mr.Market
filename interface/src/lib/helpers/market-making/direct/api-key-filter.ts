import type { AdminSingleKey } from '$lib/types/hufi/admin';

export function filterExecutableApiKeys(
  apiKeys: AdminSingleKey[],
  exchangeName: string,
): AdminSingleKey[] {
  return apiKeys.filter(
    (key) =>
      (!exchangeName || key.exchange === exchangeName) &&
      key.permissions === 'read-trade',
  );
}
