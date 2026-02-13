import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Scope,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import * as ccxt from 'ccxt';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { ExchangeService } from 'src/modules/mixin/exchange/exchange.service';

@Injectable({ scope: Scope.DEFAULT })
export class ExchangeInitService {
  private readonly logger = new CustomLogger(ExchangeInitService.name);
  private exchanges = new Map<string, Map<string, ccxt.Exchange>>();
  private defaultAccounts = new Map<string, ccxt.Exchange>();
  private readonly marketsCacheTtlSeconds = 60 * 60;
  private readonly refreshIntervalMs = 10 * 1000;
  private apiKeysSignature: string | null = null;

  constructor(
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private exchangeService: ExchangeService,
  ) {
    this.initializeExchanges()
      .then(() => {
        this.logger.log('Exchanges initialized successfully');
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

  private getEnvExchangeConfigs() {
    return [
      {
        name: 'okx',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.OKX_API_KEY,
            secret: process.env.OKX_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.OKX_API_KEY_2,
            secret: process.env.OKX_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.OKX_API_KEY_READ_ONLY,
            secret: process.env.OKX_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.okx,
      },
      {
        name: 'alpaca',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.ALPACA_KEY,
            secret: process.env.ALPACA_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.ALPACA_KEY_2,
            secret: process.env.ALPACA_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.ALPACA_KEY_READ_ONLY,
            secret: process.env.ALPACA_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.alpaca,
      },
      {
        name: 'bitfinex',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.BITFINEX_API_KEY,
            secret: process.env.BITFINEX_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.BITFINEX_API_KEY_2,
            secret: process.env.BITFINEX_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.BITFINEX_API_KEY_READ_ONLY,
            secret: process.env.BITFINEX_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.bitfinex,
      },
      {
        name: 'gate',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.GATE_API_KEY,
            secret: process.env.GATE_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.GATE_API_KEY_2,
            secret: process.env.GATE_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.GATE_API_KEY_READ_ONLY,
            secret: process.env.GATE_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.gate,
      },
      {
        name: 'mexc',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.MEXC_API_KEY,
            secret: process.env.MEXC_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.MEXC_API_KEY_2,
            secret: process.env.MEXC_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.MEXC_API_KEY_READ_ONLY,
            secret: process.env.MEXC_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.mexc,
      },
      {
        name: 'binance',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.BINANCE_API_KEY,
            secret: process.env.BINANCE_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.BINANCE_API_KEY_2,
            secret: process.env.BINANCE_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.BINANCE_API_KEY_READ_ONLY,
            secret: process.env.BINANCE_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.binance,
      },
      {
        name: 'lbank',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.LBANK_API_KEY,
            secret: process.env.LBANK_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.LBANK_API_KEY_2,
            secret: process.env.LBANK_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.LBANK_API_KEY_READ_ONLY,
            secret: process.env.LBANK_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.lbank,
      },
      {
        name: 'bitmart',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.BITMART_API_KEY,
            secret: process.env.BITMART_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.BITMART_API_KEY_2,
            secret: process.env.BITMART_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.BITMART_API_KEY_READ_ONLY,
            secret: process.env.BITMART_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.bitmart,
      },
      {
        name: 'bigone',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.BIGONE_API_KEY,
            secret: process.env.BIGONE_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.BIGONE_API_KEY_2,
            secret: process.env.BIGONE_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.BIGONE_API_KEY_READ_ONLY,
            secret: process.env.BIGONE_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.bigone,
      },
      {
        name: 'p2b',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.P2B_API_KEY,
            secret: process.env.P2B_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.P2B_API_KEY_2,
            secret: process.env.P2B_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.P2B_API_KEY_READ_ONLY,
            secret: process.env.P2B_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.p2b,
      },
      {
        name: 'probit',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.PROBIT_API_KEY,
            secret: process.env.PROBIT_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.PROBIT_API_KEY_2,
            secret: process.env.PROBIT_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.PROBIT_API_KEY_READ_ONLY,
            secret: process.env.PROBIT_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.pro.probit,
      },
      {
        name: 'digifinex',
        accounts: [
          {
            label: 'default',
            apiKey: process.env.DIGIFINEX_API_KEY,
            secret: process.env.DIGIFINEX_SECRET,
          },
          {
            label: 'account2',
            apiKey: process.env.DIGIFINEX_API_KEY_2,
            secret: process.env.DIGIFINEX_SECRET_2,
          },
          {
            label: 'read-only',
            apiKey: process.env.DIGIFINEX_API_KEY_READ_ONLY,
            secret: process.env.DIGIFINEX_SECRET_READ_ONLY,
          },
        ],
        class: ccxt.digifinex,
      },
    ];
  }

  private buildExchangeConfigsFromDb(apiKeys: APIKeysConfig[]) {
    const grouped = new Map<string, APIKeysConfig[]>();

    for (const key of apiKeys) {
      if (!grouped.has(key.exchange)) {
        grouped.set(key.exchange, []);
      }
      grouped.get(key.exchange)?.push(key);
    }

    const exchangeConfigs: Array<{
      name: string;
      accounts: Array<{ label: string; apiKey: string; secret: string }>;
      class: any;
    }> = [];

    for (const [exchange, keys] of grouped) {
      const ccxtPro = (ccxt as any).pro || {};
      const exchangeClass = ccxtPro[exchange] || (ccxt as any)[exchange];

      if (!exchangeClass) {
        this.logger.warn(`Exchange ${exchange} is not supported by CCXT.`);
        continue;
      }

      const accounts = keys.map((key) => ({
        label: key.exchange_index || 'default',
        apiKey: key.api_key,
        secret: key.api_secret,
      }));

      exchangeConfigs.push({
        name: exchange,
        accounts,
        class: exchangeClass,
      });
    }

    return exchangeConfigs;
  }

  private computeApiKeysSignature(apiKeys: APIKeysConfig[]): string {
    const entries = apiKeys.map((key) =>
      [
        key.key_id,
        key.exchange,
        key.exchange_index,
        key.api_key,
        key.api_secret,
      ].join('::'),
    );

    entries.sort();

    return entries.join('|');
  }

  private async initializeExchangeConfigs(
    exchangeConfigs: Array<{
      name: string;
      accounts: Array<{ label: string; apiKey: string; secret: string }>;
      class: any;
    }>,
  ) {
    this.exchanges.clear();
    this.defaultAccounts.clear();

    await Promise.all(
      exchangeConfigs.map(async (config) => {
        const exchangeMap = new Map<string, ccxt.Exchange>();

        await Promise.all(
          config.accounts.map(async (account) => {
            try {
              if (!account.apiKey || !account.secret) {
                // this.logger.warn(
                //   `API key or secret for ${config.name} ${account.label} is missing. Skipping initialization.`,
                // );
                return;
              }

              const exchange = new config.class({
                apiKey: account.apiKey,
                secret: account.secret,
              });

              // Load markets
              await exchange.loadMarkets();

              // Call signIn only for ProBit accounts
              if (config.name === 'probit' && exchange.has['signIn']) {
                try {
                  await exchange.signIn();
                  this.logger.log(
                    `${config.name} ${account.label} signed in successfully.`,
                  );
                } catch (error) {
                  this.logger.error(
                    `ProBit ${account.label} sign-in failed: ${error.message}`,
                  );
                }
              }

              // Save the initialized exchange
              exchangeMap.set(account.label, exchange);

              // Save the default account reference
              if (account.label === 'default') {
                this.defaultAccounts.set(config.name, exchange);
              }
            } catch (error) {
              this.logger.error(
                `Failed to initialize ${config.name} ${account.label}: ${error.message}`,
              );
            }
          }),
        );

        if (exchangeMap.size > 0) {
          this.exchanges.set(config.name, exchangeMap);
        }
      }),
    );
  }

  private async initializeExchanges() {
    let apiKeys = await this.exchangeService.readDecryptedAPIKeys();

    if (!apiKeys.length) {
      const seededCount = await this.exchangeService.seedApiKeysFromEnv(
        this.getEnvExchangeConfigs(),
      );

      if (seededCount > 0) {
        apiKeys = await this.exchangeService.readDecryptedAPIKeys();
      }
    }

    const exchangeConfigs = apiKeys.length
      ? this.buildExchangeConfigsFromDb(apiKeys)
      : this.getEnvExchangeConfigs();

    this.apiKeysSignature = apiKeys.length
      ? this.computeApiKeysSignature(apiKeys)
      : null;

    await this.initializeExchangeConfigs(exchangeConfigs);
  }

  private startRefresh() {
    setInterval(async () => {
      try {
        const apiKeys = await this.exchangeService.readDecryptedAPIKeys();
        const signature = apiKeys.length
          ? this.computeApiKeysSignature(apiKeys)
          : null;

        if (signature === this.apiKeysSignature) {
          return;
        }

        const exchangeConfigs = apiKeys.length
          ? this.buildExchangeConfigsFromDb(apiKeys)
          : this.getEnvExchangeConfigs();

        this.apiKeysSignature = signature;
        await this.initializeExchangeConfigs(exchangeConfigs);
        this.logger.log('Exchanges reinitialized after API key changes.');
      } catch (error) {
        this.logger.error(
          `Failed to refresh exchanges from DB: ${error.message}`,
        );
      }
    }, this.refreshIntervalMs);
  }

  private startKeepAlive() {
    const intervalMs = 5 * 60 * 1000; // 5 minutes

    setInterval(async () => {
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
  }

  getExchange(exchangeName: string, label: string = 'default'): ccxt.Exchange {
    const exchangeMap = this.exchanges.get(exchangeName);

    if (!exchangeMap) {
      this.logger.warn(`Exchange ${exchangeName} is not configured.`);
      throw new InternalServerErrorException('Exchange configuration error.');
    }
    const exchange = exchangeMap.get(label);

    if (!exchange) {
      this.logger.warn(
        `Exchange ${exchangeName} with label ${label} is not configured.`,
      );
      throw new InternalServerErrorException('Exchange configuration error.');
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
