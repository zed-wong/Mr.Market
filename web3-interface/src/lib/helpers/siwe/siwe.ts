import { getNonce, login } from '../api/auth';
import { initAppKit, getWagmiAdapter } from '../wallet/appkit';
import { walletAddress, walletChainId, walletStatus } from '$lib/stores/wallet';
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
  const adapter = getWagmiAdapter();
  const appKit = initAppKit();
  if (!adapter || !appKit) throw new Error('Wallet not initialized');

  const wagmiClient = adapter.wagmiConfig;
  const { getAccount, getChainId, signMessage } = await import('@wagmi/core');

  const account = getAccount(wagmiClient);
  if (!account.address) throw new Error('No wallet connected');

  const chainId = getChainId(wagmiClient);
  const address = account.address;

  walletStatus.set('connecting');

  try {
    const nonceResponse = await getNonce(address, String(chainId));
    const domain = nonceResponse.domain || window.location.host;
    const uri = nonceResponse.uri || window.location.origin;

    const message = buildSiweMessage(
      nonceResponse.nonce,
      address,
      chainId,
      domain,
      uri,
    );

    const signature = await signMessage(wagmiClient, { message });

    const loginResult = await login(message, signature);

    walletAddress.set(address);
    walletChainId.set(chainId);
    isAuthed.set(true);
    authState.set({
      token: loginResult.jwt,
      address: loginResult.address,
      chainId: loginResult.chainId,
      userId: loginResult.userId,
    });

    return true;
  } catch (err) {
    walletStatus.set('disconnected');
    isAuthed.set(false);
    throw err;
  }
};