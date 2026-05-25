import type { Web3AuthState } from '$lib/types/auth';

export const normalizeWalletScopeValue = (value: string | number | null | undefined): string =>
  String(value ?? '').trim().toLowerCase();

export const authMatchesWalletScope = ({
  auth,
  address,
  chainId,
  hasUsableSession,
}: {
  auth: Web3AuthState;
  address: string | number | null | undefined;
  chainId: string | number | null | undefined;
  hasUsableSession: boolean;
}): boolean =>
  Boolean(auth.token) &&
  hasUsableSession &&
  normalizeWalletScopeValue(auth.address) === normalizeWalletScopeValue(address) &&
  normalizeWalletScopeValue(auth.chainId) === normalizeWalletScopeValue(chainId);
