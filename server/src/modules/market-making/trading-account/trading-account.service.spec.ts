import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { TradingAccount } from 'src/common/entities/market-making/trading-account.entity';
import { encrypt, generateKeyPair } from 'src/common/helpers/crypto';

import { TradingAccountService } from './trading-account.service';

describe('TradingAccountService', () => {
  const rows = new Map<string, TradingAccount>();
  const keyPair = generateKeyPair();
  const wallet = ethers.Wallet.createRandom();
  const repository = {
    create: jest.fn((value: TradingAccount) => value),
    save: jest.fn(async (value: TradingAccount) => {
      rows.set(value.id, value);

      return value;
    }),
    findOneBy: jest.fn(async ({ id }: { id?: string }) =>
      id ? rows.get(id) || null : null,
    ),
    find: jest.fn(async ({ where }: { where?: { purpose?: string } }) =>
      [...rows.values()].filter(
        (row) => !where?.purpose || row.purpose === where.purpose,
      ),
    ),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'admin.encryption_private_key': keyPair.privateKey,
        'web3.network.mainnet.rpc_url': 'http://localhost:8545',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    rows.clear();
    jest.clearAllMocks();
  });

  it('creates an EVM trading account without returning private key material', async () => {
    const service = new TradingAccountService(repository as any, configService);
    const account = await service.create({
      id: 'account-1',
      label: 'Main EVM',
      purpose: 'dex_execution',
      chainIds: [1, 1],
      walletAddress: wallet.address,
      encryptedPrivateKey: encrypt(wallet.privateKey, keyPair.publicKey),
      validationStatus: 'valid',
    });

    expect(account).toMatchObject({
      id: 'account-1',
      label: 'Main EVM',
      type: 'evm_wallet',
      purpose: 'dex_execution',
      chainIds: [1],
      walletAddress: wallet.address,
      validationStatus: 'valid',
    });
    expect(account.encryptedPrivateKey).not.toBe(wallet.privateKey);
  });

  it('resolves a signer for a valid purpose and chain', async () => {
    const service = new TradingAccountService(repository as any, configService);

    await service.create({
      id: 'account-1',
      label: 'Gas sponsor',
      purpose: 'funding_operator',
      chainIds: [1],
      walletAddress: wallet.address,
      encryptedPrivateKey: encrypt(wallet.privateKey, keyPair.publicKey),
      validationStatus: 'valid',
    });

    const signer = await service.getSignerForPurpose('funding_operator', 1);

    expect(signer.address).toBe(wallet.address);
    expect(
      (signer.provider as ethers.providers.JsonRpcProvider).connection.url,
    ).toBe('http://localhost:8545');
  });

  it('lists valid clob trading wallet credentials for connector initialization', async () => {
    const service = new TradingAccountService(repository as any, configService);

    await service.create({
      id: 'hl-valid',
      label: 'Hyperliquid wallet',
      purpose: 'clob_trading',
      chainIds: [1],
      walletAddress: wallet.address,
      encryptedPrivateKey: encrypt(wallet.privateKey, keyPair.publicKey),
      validationStatus: 'valid',
    });
    await service.create({
      id: 'hl-pending',
      label: 'Pending Hyperliquid wallet',
      purpose: 'clob_trading',
      chainIds: [1],
      walletAddress: wallet.address,
      encryptedPrivateKey: encrypt(wallet.privateKey, keyPair.publicKey),
      validationStatus: 'pending',
    });

    await expect(
      service.listValidWalletCredentialsByPurpose('clob_trading'),
    ).resolves.toEqual([
      {
        id: 'hl-valid',
        label: 'Hyperliquid wallet',
        purpose: 'clob_trading',
        walletAddress: wallet.address,
        privateKey: wallet.privateKey,
      },
    ]);
  });

  it('rejects a decrypted key that does not match the stored wallet address', async () => {
    const service = new TradingAccountService(repository as any, configService);

    await service.create({
      id: 'account-1',
      label: 'Bad account',
      purpose: 'dex_execution',
      chainIds: [1],
      walletAddress: ethers.Wallet.createRandom().address,
      encryptedPrivateKey: encrypt(wallet.privateKey, keyPair.publicKey),
      validationStatus: 'valid',
    });

    await expect(service.getSigner('account-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
