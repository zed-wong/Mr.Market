import { get } from 'svelte/store';
import { walletAccount, walletStatus } from '$lib/stores/wallet';
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
  const account = get(walletAccount);
  if (!account || account.namespace !== 'evm') {
    walletStatus.set('disconnected');
    isAuthed.set(false);
    throw new Error('Connect a supported EVM wallet before signing in');
  }

  isAuthed.set(true);
  authState.set({
    token: 'mock-pending-real-siwe',
    address: account.address,
    chainId: String(account.chainId ?? 0),
    userId: account.address,
  });

  return true;
};
