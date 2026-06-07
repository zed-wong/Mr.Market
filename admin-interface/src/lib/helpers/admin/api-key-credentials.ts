import type { AdminSingleKey } from '$lib/types/hufi/admin';

type CredentialFieldKey =
  | 'api_key'
  | 'api_secret'
  | 'admin_connectivity_paste_api_key'
  | 'admin_connectivity_paste_api_secret'
  | 'admin_connectivity_paste_wallet_address'
  | 'admin_connectivity_paste_private_key'
  | 'admin_form_paste_api_key'
  | 'admin_form_paste_api_secret'
  | 'admin_form_paste_wallet_address'
  | 'admin_form_paste_private_key'
  | 'admin_form_api_key_min_length'
  | 'admin_form_api_secret_min_length'
  | 'admin_form_wallet_address_min_length'
  | 'admin_form_private_key_min_length'
  | 'admin_api_key_api_key_help'
  | 'admin_api_key_api_secret_help'
  | 'admin_api_key_wallet_address'
  | 'admin_api_key_wallet_address_help'
  | 'admin_api_key_private_key'
  | 'admin_api_key_private_key_help';

export interface AdminApiKeyCredentialCopy {
  apiKeyLabel: CredentialFieldKey;
  apiKeyPlaceholder: CredentialFieldKey;
  apiKeyRequired: CredentialFieldKey;
  apiKeyMinLength: CredentialFieldKey;
  apiKeyHelp: CredentialFieldKey;
  apiSecretLabel: CredentialFieldKey;
  apiSecretPlaceholder: CredentialFieldKey;
  apiSecretRequired: CredentialFieldKey;
  apiSecretMinLength: CredentialFieldKey;
  apiSecretHelp: CredentialFieldKey;
}

export interface AdminApiKeySubmissionInput {
  exchange: string;
  name: string;
  apiKey: string;
  encryptedSecret: string;
  permissions?: string;
}

export interface AdminApiKeyDisplayRecord {
  keyId: string;
  exchange: string;
  name: string;
  publicCredentialFingerprint: string;
}

const DEX_WALLET_EXCHANGES = new Set(['hyperliquid']);

export const normalizeExchangeId = (exchange?: string | null): string =>
  String(exchange || '').trim().toLowerCase();

export const isDexWalletStyleApiKeyExchange = (exchange?: string | null): boolean =>
  DEX_WALLET_EXCHANGES.has(normalizeExchangeId(exchange));

export const getAdminApiKeyCredentialCopy = (exchange?: string | null): AdminApiKeyCredentialCopy => {
  if (isDexWalletStyleApiKeyExchange(exchange)) {
    return {
      apiKeyLabel: 'admin_api_key_wallet_address',
      apiKeyPlaceholder: 'admin_connectivity_paste_wallet_address',
      apiKeyRequired: 'admin_form_paste_wallet_address',
      apiKeyMinLength: 'admin_form_wallet_address_min_length',
      apiKeyHelp: 'admin_api_key_wallet_address_help',
      apiSecretLabel: 'admin_api_key_private_key',
      apiSecretPlaceholder: 'admin_connectivity_paste_private_key',
      apiSecretRequired: 'admin_form_paste_private_key',
      apiSecretMinLength: 'admin_form_private_key_min_length',
      apiSecretHelp: 'admin_api_key_private_key_help',
    };
  }

  return {
    apiKeyLabel: 'api_key',
    apiKeyPlaceholder: 'admin_connectivity_paste_api_key',
    apiKeyRequired: 'admin_form_paste_api_key',
    apiKeyMinLength: 'admin_form_api_key_min_length',
    apiKeyHelp: 'admin_api_key_api_key_help',
    apiSecretLabel: 'api_secret',
    apiSecretPlaceholder: 'admin_connectivity_paste_api_secret',
    apiSecretRequired: 'admin_form_paste_api_secret',
    apiSecretMinLength: 'admin_form_api_secret_min_length',
    apiSecretHelp: 'admin_api_key_api_secret_help',
  };
};

export const buildAdminApiKeySubmission = ({
  exchange,
  name,
  apiKey,
  encryptedSecret,
  permissions,
}: AdminApiKeySubmissionInput): Partial<AdminSingleKey> => ({
  exchange,
  name,
  api_key: apiKey,
  api_secret: encryptedSecret,
  permissions,
});

export const fingerprintApiKeyCredential = (value?: string, maskChar = '•'): string => {
  const raw = String(value || '').replace(/\s/g, '');
  if (!raw) return '—';
  const tail = raw.slice(-8).padStart(8, maskChar);
  return tail.match(/.{1,2}/g)?.join('·') || tail;
};

export const toAdminApiKeyDisplayRecord = (key: AdminSingleKey): AdminApiKeyDisplayRecord => ({
  keyId: key.key_id,
  exchange: key.exchange,
  name: key.name,
  publicCredentialFingerprint: fingerprintApiKeyCredential(key.api_key),
});
