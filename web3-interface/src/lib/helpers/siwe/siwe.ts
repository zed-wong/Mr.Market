import { get } from 'svelte/store';
import { selectedMockAccountId, switchMockAccount, walletAccount, walletStatus } from '$lib/stores/wallet';
import { isAuthed, authState } from '$lib/stores/auth';

export const buildSiweMessage = (
  nonce: string,
  address: string,
  chainId: number,
  domain: string,
  uri: string,
): string => {
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Mr.Market',
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n');
};

export const signInWithEthereum = async (): Promise<boolean> => {
  const accountId = get(selectedMockAccountId) ?? 'evm-primary';
  switchMockAccount(accountId);

  const account = get(walletAccount);
  if (!account || account.unsupported) {
    walletStatus.set('disconnected');
    isAuthed.set(false);
    throw new Error('Select a supported mocked EVM account');
  }

  isAuthed.set(true);
  authState.set({
    token: 'mock-web3-session-token',
    address: account.address,
    chainId: String(account.chainId ?? 0),
    userId: account.id,
  });

  return true;
};
