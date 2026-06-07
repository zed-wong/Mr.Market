import { describe, expect, it } from 'vitest';

import {
  buildAdminApiKeySubmission,
  getAdminApiKeyCredentialCopy,
  toAdminApiKeyDisplayRecord,
} from './api-key-credentials';
import type { AdminSingleKey } from '$lib/types/hufi/admin';

const baseKey: AdminSingleKey = {
  key_id: 'key-1',
  exchange: 'hyperliquid',
  name: 'Hyperliquid wallet',
  api_key: '0x1234567890abcdef1234567890abcdef12345678',
  api_secret: 'plain-hyperliquid-private-key-must-not-render',
  permissions: 'read-trade',
  validation_status: 'valid',
};

describe('admin API key credential copy', () => {
  it('uses wallet-style labels and help text for Hyperliquid', () => {
    expect(getAdminApiKeyCredentialCopy('hyperliquid')).toMatchObject({
      apiKeyLabel: 'admin_api_key_wallet_address',
      apiKeyPlaceholder: 'admin_connectivity_paste_wallet_address',
      apiKeyHelp: 'admin_api_key_wallet_address_help',
      apiSecretLabel: 'admin_api_key_private_key',
      apiSecretPlaceholder: 'admin_connectivity_paste_private_key',
      apiSecretHelp: 'admin_api_key_private_key_help',
    });
    expect(getAdminApiKeyCredentialCopy('HyperLiquid').apiSecretLabel).toBe('admin_api_key_private_key');
  });

  it('keeps standard API-key labels and help text for other exchanges', () => {
    expect(getAdminApiKeyCredentialCopy('binance')).toMatchObject({
      apiKeyLabel: 'api_key',
      apiKeyPlaceholder: 'admin_connectivity_paste_api_key',
      apiKeyHelp: 'admin_api_key_api_key_help',
      apiSecretLabel: 'api_secret',
      apiSecretPlaceholder: 'admin_connectivity_paste_api_secret',
      apiSecretHelp: 'admin_api_key_api_secret_help',
    });
  });

  it('submits Hyperliquid wallet credentials through the existing api_key/api_secret fields', () => {
    expect(
      buildAdminApiKeySubmission({
        exchange: 'hyperliquid',
        name: 'Hyperliquid wallet',
        apiKey: '0x1234567890abcdef1234567890abcdef12345678',
        encryptedSecret: 'encrypted-private-key',
        permissions: 'read-trade',
      }),
    ).toEqual({
      exchange: 'hyperliquid',
      name: 'Hyperliquid wallet',
      api_key: '0x1234567890abcdef1234567890abcdef12345678',
      api_secret: 'encrypted-private-key',
      permissions: 'read-trade',
    });
  });

  it('omits plaintext private keys from list/detail display records', () => {
    const displayRecord = toAdminApiKeyDisplayRecord(baseKey);

    expect(displayRecord).toMatchObject({
      keyId: baseKey.key_id,
      exchange: baseKey.exchange,
      name: baseKey.name,
      publicCredentialFingerprint: '12·34·56·78',
    });
    expect('api_secret' in displayRecord).toBe(false);
    expect(JSON.stringify(displayRecord)).not.toContain(baseKey.api_secret);
    expect(JSON.stringify(displayRecord)).not.toContain('plain-hyperliquid-private-key-must-not-render');
  });
});
