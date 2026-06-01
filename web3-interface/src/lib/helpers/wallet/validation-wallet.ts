import { createConnector } from '@wagmi/core';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  custom,
  fromHex,
  hashMessage,
  hexToBytes,
  isHex,
  keccak256,
  numberToHex,
  serializeSignature,
  toHex,
  type Address,
  type EIP1193RequestFn,
  type Hex,
  type SignableMessage,
  type Transport,
} from 'viem';
import { publicKeyToAddress } from 'viem/accounts';

export const VALIDATION_WALLET_CONNECTOR_ID = 'mrmarket-validation-wallet';
export const VALIDATION_WALLET_NAME = 'Mr.Market validation wallet';

const VALIDATION_WALLET_PRIVATE_KEY =
  keccak256(toHex('Mr.Market validation wallet public test key'));

export const VALIDATION_WALLET_ADDRESS = publicKeyToAddress(
  toHex(secp256k1.getPublicKey(hexToBytes(VALIDATION_WALLET_PRIVATE_KEY), false))
);

type ValidationWalletProvider = ReturnType<
  Transport<'custom', unknown, EIP1193RequestFn>
>;

const signValidationMessage = async (message: SignableMessage): Promise<Hex> => {
  const signature = secp256k1.sign(
    hexToBytes(hashMessage(message)),
    hexToBytes(VALIDATION_WALLET_PRIVATE_KEY as Hex),
    { lowS: true }
  );

  return serializeSignature({
    r: numberToHex(signature.r, { size: 32 }),
    s: numberToHex(signature.s, { size: 32 }),
    v: signature.recovery ? 28n : 27n,
    yParity: signature.recovery,
    to: 'hex',
  });
};

const parsePersonalSignMessage = (params: unknown): SignableMessage => {
  const [message] = Array.isArray(params) ? params : [];
  if (isHex(message)) return { raw: message };
  if (typeof message === 'string') return message;
  throw new Error('Validation wallet received an unsupported personal_sign payload');
};

const parseEthSignMessage = (params: unknown): SignableMessage => {
  const [, message] = Array.isArray(params) ? params : [];
  if (isHex(message)) return { raw: message };
  if (typeof message === 'string') return message;
  throw new Error('Validation wallet received an unsupported eth_sign payload');
};

export const createValidationWalletConnector = () => {
  let connected = false;
  let connectedChainId = 1;

  return createConnector<ValidationWalletProvider>((config) => ({
    id: VALIDATION_WALLET_CONNECTOR_ID,
    name: VALIDATION_WALLET_NAME,
    type: 'validation',
    async setup() {
      connectedChainId = config.chains[0]?.id ?? 1;
    },
    async connect<withCapabilities extends boolean = false>(
      parameters?: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      }
    ) {
      const { chainId, withCapabilities } = parameters ?? {};
      if (chainId && connectedChainId !== chainId) {
        await this.switchChain?.({ chainId });
      }
      connected = true;
      const accounts = withCapabilities
        ? [{ address: VALIDATION_WALLET_ADDRESS, capabilities: {} }]
        : [VALIDATION_WALLET_ADDRESS];
      return {
        accounts: accounts as never,
        chainId: connectedChainId,
      };
    },
    async disconnect() {
      connected = false;
    },
    async getAccounts() {
      return connected ? [VALIDATION_WALLET_ADDRESS] : [];
    },
    async getChainId() {
      return connectedChainId;
    },
    async getProvider() {
      const request = (async ({ method, params }: { method: string; params?: unknown }) => {
        if (method === 'eth_chainId') return numberToHex(connectedChainId);
        if (method === 'net_version') return String(connectedChainId);
        if (method === 'eth_accounts') return connected ? [VALIDATION_WALLET_ADDRESS] : [];
        if (method === 'eth_requestAccounts') {
          connected = true;
          return [VALIDATION_WALLET_ADDRESS];
        }
        if (method === 'personal_sign') {
          return signValidationMessage(parsePersonalSignMessage(params));
        }
        if (method === 'eth_sign') {
          return signValidationMessage(parseEthSignMessage(params));
        }
        if (method === 'wallet_switchEthereumChain') {
          const [target] = Array.isArray(params) ? params : [];
          const chainId = (target as { chainId?: Hex } | undefined)?.chainId;
          if (!chainId) throw new Error('Validation wallet switchChain requires a chainId');
          const nextChainId = fromHex(chainId, 'number');
          if (!config.chains.some((chain) => chain.id === nextChainId)) {
            throw new Error('Validation wallet cannot switch to an unsupported chain');
          }
          connectedChainId = nextChainId;
          this.onChainChanged(String(nextChainId));
          return null;
        }
        if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
          throw new Error('Validation wallet only supports SIWE message signing');
        }
        if (method === 'eth_getBalance') return '0x0';
        if (method === 'eth_blockNumber') return '0x0';
        if (method === 'web3_clientVersion') return 'Mr.Market validation wallet';
        if (method === 'personal_ecRecover') {
          throw new Error('Validation wallet does not support personal_ecRecover');
        }
        if (method === 'eth_sendTransaction') {
          throw new Error('Validation wallet does not submit transactions');
        }

        throw new Error(`Validation wallet does not support ${method}`);
      }) as EIP1193RequestFn;

      return custom({ request })({ retryCount: 0 });
    },
    async isAuthorized() {
      return connected;
    },
    async switchChain({ chainId }) {
      const chain = config.chains.find((candidate) => candidate.id === chainId);
      if (!chain) throw new Error('Validation wallet cannot switch to an unsupported chain');
      connectedChainId = chainId;
      return chain;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else config.emitter.emit('change', { accounts: accounts as Address[] });
    },
    onChainChanged(chainId) {
      config.emitter.emit('change', { chainId: Number(chainId) });
    },
    onDisconnect() {
      connected = false;
      config.emitter.emit('disconnect');
    },
  }));
};
