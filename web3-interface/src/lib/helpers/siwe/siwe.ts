import { get } from 'svelte/store';
import { walletAccount, walletStatus } from '$lib/stores/wallet';
import { clearAuth } from '$lib/stores/auth';

export const buildSiweMessage = (
  nonce: string,
  address: string,
  chainId: number,
  domain: string,
  uri: string,
  statement = 'Sign in to Mr.Market web3 market-making orders',
): string => {
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    statement,
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
    clearAuth();
    throw new Error('Connect a supported EVM wallet before signing in');
  }

  const { getNonce, login } = await import('$lib/helpers/api/auth');
  const { signWalletMessage } = await import('$lib/stores/wallet');
  const chainId = String(account.chainId ?? 0);
  const nonce = await getNonce(account.address, chainId);
  const message = buildSiweMessage(
    nonce.nonce,
    account.address,
    Number(chainId) || 0,
    nonce.domain,
    nonce.uri,
    nonce.statement
  );
  const signature = await signWalletMessage(message);
  await login(message, signature);

  return true;
};
