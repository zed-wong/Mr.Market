/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Scope,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import * as ccxt from 'ccxt';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import {
  TradingAccountService,
  TradingAccountWalletCredentials,
} from 'src/modules/market-making/trading-account/trading-account.service';

type ExchangeAccountConfig = {
  label: string;
  apiKey?: string;
  secret?: string;
  password?: string;
  uid?: string;
  walletAddress?: string;
  sandboxMode?: boolean;
};

type ExchangeConfig = {
  name: string;
  accounts: ExchangeAccountConfig[];
  class: any;
};

type ExchangeInitializationState = 'pending' | 'ready' | 'failed';
type ExchangeReadyListener = (
  exchangeName: string,
  accountLabel: string,
) => void | Promise<void>;

@Injectable({ scope: Scope.DEFAULT })
export class ExchangeInitService {
  private readonly logger = new CustomLogger(ExchangeInitService.name);
  private exchanges = new Map<string, Map<string, ccxt.Exchange>>();
  private defaultAccounts = new Map<string, ccxt.Exchange>();
  private readonly exchangeInitializationErrors = new Map<string, Error>();
  private readonly exchangeInitializationStates = new Map<
    string,
    ExchangeInitializationState
  >();
  private readonly exchangeReadyListeners = new Set<ExchangeReadyListener>();
  private readonly marketsCacheTtlSeconds = 60 * 60;
  private readonly refreshIntervalMs = 10 * 1000;
  private readonly initializationRetryAttempts = 3;
  private readonly initializationRetryDelayMs = 1000;
  private apiKeysSignature: string | null = null;

  constructor(
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private exchangeService: ExchangeApiKeyService,
    private tradingAccountService: TradingAccountService,
  ) {
    this.initializeExchanges()
      .then(() => {
        const failedExchangeCount = this.countFailedExchangeInitializations();

        if (failedExchangeCount > 0) {
          this.logger.warn(
            `Exchange initialization completed with ${failedExchangeCount} failed exchange configuration(s).`,
          );
        } else {
          this.logger.log('Exchanges initialized successfully');
        }

        this.startKeepAlive();
        this.startRefresh();
      })
      .catch((error) =>
        this.logger.error(
          'Error during exchanges initialization',
          error.message,
        ),
      );
  }

  private resolveExchangeClass(exchangeName: string): any {
    const normalizedExchangeName = exchangeName.trim().toLowerCase();
    const ccxtPro = (ccxt as any).pro || {};

    return (
      ccxtPro[normalizedExchangeName] || (ccxt as any)[normalizedExchangeName]
    );
  }

  private applySandboxExchangeOverrides(
    exchangeName: string,
    exchange: ccxt.Exchange,
  ): void {
    if (exchangeName !== 'binance') {
      return;
    }

    const exchangeOptions = (exchange as any).options || {};

    (exchange as any).options = {
      ...exchangeOptions,
      defaultType: 'spot',
      fetchMarkets: {
        ...(exchangeOptions.fetchMarkets || {}),
        types: ['spot'],
      },
      fetchOrder: {
        ...(exchangeOptions.fetchOrder || {}),
        defaultType: 'spot',
      },
      fetchOpenOrders: {
        ...(exchangeOptions.fetchOpenOrders || {}),
        defaultType: 'spot',
      },
      cancelOrder: {
        ...(exchangeOptions.cancelOrder || {}),
        defaultType: 'spot',
      },
    };
  }

  private buildExchangeConfigsFromDb(
    apiKeys: APIKeysConfig[],
    clobTradingAccounts: TradingAccountWalletCredentials[] = [],
  ): ExchangeConfig[] {
    const grouped = new Map<string, APIKeysConfig[]>();

    for (const key of apiKeys) {
      if (!grouped.has(key.exchange)) {
        grouped.set(key.exchange, []);
      }
      grouped.get(key.exchange)?.push(key);
    }

    const exchangeConfigs: ExchangeConfig[] = [];

    for (const [exchange, keys] of grouped) {
      const exchangeClass = this.resolveExchangeClass(exchange);

      if (!exchangeClass) {
        this.logger.warn(`Exchange ${exchange} is not supported by CCXT.`);
        continue;
      }

      const accounts = keys.map((key) => ({
        label: String(key.key_id || '').trim(),
        apiKey: key.api_key,
        secret: key.api_secret,
        walletAddress:
          key.exchange === 'hyperliquid'
            ? String(key.api_key || '').trim() || undefined
            : undefined,
      }));

      exchangeConfigs.push({
        name: exchange,
        accounts,
        class: exchangeClass,
      });
    }

    const hyperliquidWalletAccounts = clobTradingAccounts.map((account) => ({
      label: account.id,
      apiKey: account.walletAddress,
      secret: account.privateKey,
      walletAddress: account.walletAddress,
    }));

    if (hyperliquidWalletAccounts.length > 0) {
      const exchangeClass = this.resolveExchangeClass('hyperliquid');

      if (!exchangeClass) {
        this.logger.warn('Exchange hyperliquid is not supported by CCXT.');
      } else {
        const existing = exchangeConfigs.find(
          (config) => config.name === 'hyperliquid',
        );

        if (existing) {
          const existingLabels = new Set(
            existing.accounts.map((account) => account.label),
          );
          existing.accounts.push(
            ...hyperliquidWalletAccounts.filter(
              (account) => !existingLabels.has(account.label),
            ),
          );
        } else {
          exchangeConfigs.push({
            name: 'hyperliquid',
            accounts: hyperliquidWalletAccounts,
            class: exchangeClass,
          });
        }
      }
    }

    return exchangeConfigs;
  }

  private computeCredentialsSignature(
    apiKeys: APIKeysConfig[],
    clobTradingAccounts: TradingAccountWalletCredentials[] = [],
  ): string {
    const entries = [
      ...apiKeys.map((key) =>
        ['api_key', key.key_id, key.exchange, key.api_key, key.api_secret].join(
          '::',
        ),
      ),
      ...clobTradingAccounts.map((account) =>
        [
          'trading_account',
          account.id,
          'hyperliquid',
          account.walletAddress,
          account.privateKey,
        ].join('::'),
      ),
    ];

    entries.sort();

    return entries.join('|');
  }

  private countFailedExchangeInitializations(): number {
    return [...this.exchangeInitializationStates.values()].filter(
      (state) => state === 'failed',
    ).length;
  }

  private async readClobTradingAccounts(): Promise<
    TradingAccountWalletCredentials[]
  > {
    try {
      return await this.tradingAccountService.listValidWalletCredentialsByPurpose(
        'clob_trading',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('no such table: trading_accounts')) {
        this.logger.warn(
          'trading_accounts table is missing. Skipping CLOB trading account preload until migrations complete.',
        );

        return [];
      }

      throw error;
    }
  }

  private getExchangeAccountKey(exchangeName: string, label: string): string {
    return `${exchangeName}:${label}`;
  }

  private normalizeInitializationError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private async initializeAccountWithRetry(
    config: ExchangeConfig,
    account: ExchangeAccountConfig,
  ): Promise<ccxt.Exchange> {
    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= this.initializationRetryAttempts;
      attempt += 1
    ) {
      try {
        const exchange = new config.class({
          apiKey: account.apiKey,
          secret: account.secret,
          password: account.password,
          uid: account.uid,
          ...(account.walletAddress
            ? {
                walletAddress: account.walletAddress,
                options: {
                  builderFee: false,
                  walletAddress: account.walletAddress,
                },
              }
            : {}),
        });

        if (account.sandboxMode) {
          this.applySandboxExchangeOverrides(config.name, exchange);
        }

        if (account.sandboxMode) {
          if (typeof (exchange as any).setSandboxMode !== 'function') {
            throw new Error(
              `Exchange ${config.name} does not expose setSandboxMode(true)`,
            );
          }

          (exchange as any).setSandboxMode(true);
        }

        await exchange.loadMarkets();

        if (config.name === 'probit' && exchange.has['signIn']) {
          try {
            await exchange.signIn();
            this.logger.log(
              `${config.name} ${account.label} signed in successfully.`,
            );
          } catch (error) {
            const normalizedError = this.normalizeInitializationError(error);

            this.logger.error(
              `ProBit ${account.label} sign-in failed: ${normalizedError.message}`,
            );
          }
        }

        return exchange;
      } catch (error) {
        lastError = this.normalizeInitializationError(error);

        if (attempt >= this.initializationRetryAttempts) {
          break;
        }

        this.logger.warn(
          `Retrying initialization for ${config.name} ${account.label} after attempt ${attempt}/${this.initializationRetryAttempts}: ${lastError.message}`,
        );
        await this.sleep(this.initializationRetryDelayMs);
      }
    }

    throw lastError || new Error('exchange initialization failed');
  }

  private async initializeExchangeConfigs(exchangeConfigs: ExchangeConfig[]) {
    this.exchanges.clear();
    this.defaultAccounts.clear();
    this.exchangeInitializationErrors.clear();
    this.exchangeInitializationStates.clear();

    await Promise.all(
      exchangeConfigs.map(async (config) => {
        if (!config.class) {
          this.logger.warn(
            `Exchange ${config.name} is not supported by current CCXT version. Skipping initialization.`,
          );

          return;
        }

        const exchangeMap = new Map<string, ccxt.Exchange>();
        const configuredAccounts = config.accounts.filter(
          (account) => account.apiKey && account.secret,
        );

        if (configuredAccounts.length === 0) {
          return;
        }

        this.exchangeInitializationStates.set(config.name, 'pending');

        await Promise.all(
          configuredAccounts.map(async (account) => {
            try {
              const exchange = await this.initializeAccountWithRetry(
                config,
                account,
              );

              // Save the initialized exchange
              exchangeMap.set(account.label, exchange);
              this.exchangeInitializationErrors.delete(
                this.getExchangeAccountKey(config.name, account.label),
              );

              // Save the default account reference
              if (
                account.label === 'default' ||
                !this.defaultAccounts.has(config.name)
              ) {
                this.defaultAccounts.set(config.name, exchange);
              }
            } catch (error) {
              const normalizedError = this.normalizeInitializationError(error);

              this.exchangeInitializationErrors.set(
                this.getExchangeAccountKey(config.name, account.label),
                normalizedError,
              );
              this.logger.error(
                `Failed to initialize ${config.name} ${account.label}: ${normalizedError.message}`,
              );
            }
          }),
        );

        if (exchangeMap.size > 0) {
          this.exchanges.set(config.name, exchangeMap);
          this.exchangeInitializationStates.set(config.name, 'ready');
          this.notifyExchangeReady(config.name, [...exchangeMap.keys()]);

          return;
        }

        const firstInitializationError = configuredAccounts
          .map((account) =>
            this.exchangeInitializationErrors.get(
              this.getExchangeAccountKey(config.name, account.label),
            ),
          )
          .find((error): error is Error => Boolean(error));

        this.exchangeInitializationStates.set(config.name, 'failed');

        if (firstInitializationError) {
          this.exchangeInitializationErrors.set(
            config.name,
            firstInitializationError,
          );
        }
      }),
    );
  }

  private async initializeExchanges() {
    const apiKeys = await this.exchangeService.readDecryptedAPIKeys();
    const clobTradingAccounts = await this.readClobTradingAccounts();
    const exchangeConfigs = this.buildExchangeConfigsFromDb(
      apiKeys,
      clobTradingAccounts,
    );

    this.apiKeysSignature =
      apiKeys.length || clobTradingAccounts.length
        ? this.computeCredentialsSignature(apiKeys, clobTradingAccounts)
        : null;

    await this.initializeExchangeConfigs(exchangeConfigs);
  }

  private startRefresh() {
    const refreshTimer = setInterval(async () => {
      try {
        const apiKeys = await this.exchangeService.readDecryptedAPIKeys();
        const clobTradingAccounts = await this.readClobTradingAccounts();
        const signature =
          apiKeys.length || clobTradingAccounts.length
            ? this.computeCredentialsSignature(apiKeys, clobTradingAccounts)
            : null;

        if (signature === this.apiKeysSignature) {
          return;
        }

        const exchangeConfigs = this.buildExchangeConfigsFromDb(
          apiKeys,
          clobTradingAccounts,
        );

        this.apiKeysSignature = signature;
        await this.initializeExchangeConfigs(exchangeConfigs);
        this.logger.log('Exchanges reinitialized after API key changes.');
      } catch (error) {
        this.logger.error(
          `Failed to refresh exchanges from DB: ${error.message}`,
        );
      }
    }, this.refreshIntervalMs);

    refreshTimer.unref?.();
  }

  private startKeepAlive() {
    const intervalMs = 5 * 60 * 1000; // 5 minutes

    const keepAliveTimer = setInterval(async () => {
      this.logger.log('Running keep-alive checks for all exchanges...');
      for (const [exchangeName, accounts] of this.exchanges) {
        // Only do special logic for ProBit
        if (exchangeName === 'probit') {
          for (const [label, exchange] of accounts) {
            try {
              // If the exchange does not have signIn, skip
              if (!exchange.has['signIn']) {
                this.logger.log(
                  `ProBit ${label} does not support signIn. Skipping...`,
                );
                continue;
              }

              // Check for open orders
              const openOrders = await exchange.fetchOpenOrders();

              if (openOrders.length > 0) {
                this.logger.log(
                  `ProBit ${label} has open orders. Skipping signIn to avoid resetting them.`,
                );
                continue; // Do not signIn
              }

              // Otherwise, signIn if no open orders
              await exchange.signIn();
              this.logger.log(`ProBit ${label} re-signed in successfully.`);
            } catch (error) {
              this.logger.error(
                `ProBit ${label} keep-alive signIn failed: ${error.message}`,
              );
            }
          }
        }
        // other exchange keep-alive logic if needed...
      }
    }, intervalMs);

    keepAliveTimer.unref?.();
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  onExchangeReady(listener: ExchangeReadyListener): () => void {
    this.exchangeReadyListeners.add(listener);

    return () => {
      this.exchangeReadyListeners.delete(listener);
    };
  }

  isReady(exchangeName: string, label = 'default'): boolean {
    try {
      this.getExchange(exchangeName, label);

      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return false;
      }

      throw error;
    }
  }

  private notifyExchangeReady(
    exchangeName: string,
    accountLabels: string[],
  ): void {
    for (const accountLabel of accountLabels) {
      for (const listener of this.exchangeReadyListeners) {
        Promise.resolve(listener(exchangeName, accountLabel)).catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);

          this.logger.error(
            `Exchange ready listener failed for ${exchangeName}:${accountLabel}: ${message}`,
          );
        });
      }
    }
  }

  getExchange(exchangeName: string, label: string = 'default'): ccxt.Exchange {
    const exchangeMap = this.exchanges.get(exchangeName);
    const initializationState =
      this.exchangeInitializationStates.get(exchangeName);
    const exchangeInitializationError =
      this.exchangeInitializationErrors.get(exchangeName);
    const accountInitializationError = this.exchangeInitializationErrors.get(
      this.getExchangeAccountKey(exchangeName, label),
    );

    if (!exchangeMap) {
      if (initializationState === 'pending') {
        throw new ServiceUnavailableException(
          `Exchange ${exchangeName} is still initializing.`,
        );
      }

      if (accountInitializationError || exchangeInitializationError) {
        const message = (
          accountInitializationError || exchangeInitializationError
        )?.message;

        throw new InternalServerErrorException(
          `Exchange ${exchangeName} failed to initialize: ${message}`,
        );
      }

      this.logger.warn(`Exchange ${exchangeName} is not configured.`);
      throw new InternalServerErrorException('Exchange configuration error.');
    }
    const exchange =
      exchangeMap.get(label) ||
      (label === 'default'
        ? this.defaultAccounts.get(exchangeName)
        : undefined);

    if (!exchange) {
      if (initializationState === 'pending') {
        throw new ServiceUnavailableException(
          `Exchange ${exchangeName} account ${label} is still initializing.`,
        );
      }

      if (accountInitializationError) {
        throw new InternalServerErrorException(
          `Exchange ${exchangeName} account ${label} failed to initialize: ${accountInitializationError.message}`,
        );
      }

      const message = `Exchange ${exchangeName} with label ${label} is not configured.`;

      this.logger.warn(message);
      throw new InternalServerErrorException(message);
    }

    return exchange;
  }

  async getSupportedExchanges(): Promise<string[]> {
    const dbExchanges = await this.exchangeService.readSupportedExchanges();

    if (dbExchanges.length > 0) {
      return dbExchanges;
    }

    return Array.from(this.exchanges.keys());
  }

  getAccountsForExchange(exchangeName: string): string[] {
    const exchangeMap = this.exchanges.get(exchangeName);

    if (!exchangeMap) {
      this.logger.error(`Exchange ${exchangeName} is not configured.`);
      throw new InternalServerErrorException('Exchange configuration error.');
    }

    return Array.from(exchangeMap.keys());
  }

  getDefaultExchange(exchangeName: string): ccxt.Exchange {
    const exchange = this.defaultAccounts.get(exchangeName);

    if (!exchange) {
      this.logger.error(`Default exchange ${exchangeName} is not configured.`);
      throw new InternalServerErrorException(
        'Default exchange configuration error.',
      );
    }

    return exchange;
  }
  /**
   * Function to get the deposit address for a specific token on a specific network
   * @param exchangeName - The name of the exchange
   * @param tokenSymbol - The symbol of the token (e.g., 'USDT')
   * @param network - The network (e.g., 'ERC20', 'BSC')
   * @param label - Optional account label
   */
  async getDepositAddress(
    exchangeName: string,
    tokenSymbol: string,
    network: string,
    label: string = 'default',
  ): Promise<string> {
    try {
      const exchange = this.getExchange(exchangeName, label);

      if (!exchange.has['fetchDepositAddress']) {
        throw new InternalServerErrorException(
          `Exchange ${exchangeName} does not support fetching deposit addresses.`,
        );
      }

      const params = network ? { network } : {};
      const addressInfo = await exchange.fetchDepositAddress(
        tokenSymbol,
        params,
      );

      if (!addressInfo || !addressInfo.address) {
        throw new InternalServerErrorException(
          `Unable to fetch deposit address for ${tokenSymbol} on ${network} network from ${exchangeName}.`,
        );
      }

      return addressInfo.address;
    } catch (error) {
      this.logger.error(
        `Error fetching deposit address for ${tokenSymbol} on ${network} from ${exchangeName}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to get deposit address.');
    }
  }

  getAllCcxtExchanges(): string[] {
    return (ccxt as any).exchanges;
  }

  async getCcxtExchangeDetails(exchangeId: string): Promise<any> {
    if (!(ccxt as any).exchanges.includes(exchangeId)) {
      throw new BadRequestException(
        `Exchange ${exchangeId} is not supported by CCXT.`,
      );
    }

    try {
      // Instantiate the exchange to get its properties
      // We don't need API keys for this
      const exchangeClass = ccxt[exchangeId];
      const exchange = new exchangeClass();

      return {
        id: exchange.id,
        name: exchange.name,
        urls: exchange.urls,
        countries: exchange.countries,
        version: exchange.version,
        // Add other metadata if needed
      };
    } catch (error) {
      this.logger.error(
        `Failed to get details for ${exchangeId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to get details for ${exchangeId}`,
      );
    }
  }

  async getCcxtExchangeMarkets(exchangeId: string): Promise<any> {
    if (!(ccxt as any).exchanges.includes(exchangeId)) {
      throw new BadRequestException(
        `Exchange ${exchangeId} is not supported by CCXT.`,
      );
    }

    try {
      const cacheKey = `ccxt_markets_${exchangeId}`;
      const cachedMarkets = await this.cacheService.get<any[]>(cacheKey);

      if (cachedMarkets) {
        return cachedMarkets;
      }

      const exchangeClass = ccxt[exchangeId];
      const exchange = new exchangeClass();

      // Some exchanges require loading markets to get the list
      // Since we are not authenticated, we can only get public markets
      await exchange.loadMarkets();

      const markets = Object.values(exchange.markets).map((market: any) => ({
        symbol: market.symbol,
        base: market.base,
        quote: market.quote,
        baseId: market.baseId,
        quoteId: market.quoteId,
        active: market.active,
        id: market.id,
        precision: market.precision,
        limits: market.limits,
      }));

      await this.cacheService.set(
        cacheKey,
        markets,
        this.marketsCacheTtlSeconds,
      );

      return markets;
    } catch (error) {
      this.logger.error(
        `Failed to get markets for ${exchangeId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to get markets for ${exchangeId}`,
      );
    }
  }
}
