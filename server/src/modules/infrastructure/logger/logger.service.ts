/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger, Scope } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import * as winston from 'winston';

export type MarketMakingLogFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type MarketMakingLogFields = Record<string, MarketMakingLogFieldValue>;

export type MarketMakingLogOptions = {
  onceKey?: string;
  windowMs?: number;
};

export type MarketMakingLogger = {
  info(message: string, fields?: MarketMakingLogFields): void;
  debug(message: string, fields?: MarketMakingLogFields): void;
  warn(
    message: string,
    fields?: MarketMakingLogFields,
    options?: MarketMakingLogOptions,
  ): void;
  error(message: string, fields?: MarketMakingLogFields, trace?: string): void;
};

@Injectable({ scope: Scope.DEFAULT })
export class CustomLogger extends Logger {
  private static discordWebhookUrl = '';
  private static mixinGroupWebhookUrl = '';
  private static readonly marketMakingRateLimitUntilByKey = new Map<
    string,
    number
  >();
  private static readonly marketMakingIdentityFieldOrder = [
    'reason',
    'strategy',
    'exchange',
    'pair',
    'account',
    'side',
    'order',
    'slot',
    'scope',
  ];
  private static readonly marketMakingDiagnosticFieldOrder = [
    'actions',
    'creates',
    'cancels',
    'layers',
    'ageMs',
    'durationMs',
    'thresholdMs',
    'required',
    'available',
    'asset',
    'status',
    'repeat',
    'driver',
    'count',
    'maxMs',
    'lastMs',
  ];

  private logger: winston.Logger;
  private readonly silentForTests: boolean;

  static configureWebhooks(config: {
    discordWebhookUrl?: string;
    mixinGroupWebhookUrl?: string;
  }) {
    CustomLogger.discordWebhookUrl = config.discordWebhookUrl || '';
    CustomLogger.mixinGroupWebhookUrl = config.mixinGroupWebhookUrl || '';
  }

  constructor(context?: string) {
    super(context);
    const isTestRuntime =
      process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

    this.silentForTests = isTestRuntime;
    const logsDir =
      process.env.NODE_ENV !== 'production'
        ? path.join(__dirname, '..', '..', 'logs')
        : path.join(__dirname, '..', 'logs'); // Adjust as necessary for production

    const transports: winston.transport[] = isTestRuntime
      ? [new winston.transports.Console({ silent: this.silentForTests })]
      : [
          new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
          }),
          new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
          }),
        ];

    this.logger = winston.createLogger({
      level: 'info', // Default logging level
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
          (info) =>
            `[${info.timestamp}] [${info.level.toUpperCase()}] [${
              context || this.context
            }] ${info.message}`,
        ),
      ),
      transports,
    });
  }

  async logToDiscord(message: string, level: string = 'INFO') {
    if (CustomLogger.discordWebhookUrl.length === 0) {
      return;
    }

    try {
      await axios.post(CustomLogger.discordWebhookUrl, {
        content: `${level} [${this.context}]: ${message}`,
      });
    } catch (error) {
      super.error('Failed to send log to Discord', error.message);
    }
  }

  async logToMixinGroup(message: string) {
    if (CustomLogger.mixinGroupWebhookUrl.length === 0) {
      return;
    }

    try {
      await axios.post(CustomLogger.mixinGroupWebhookUrl, {
        category: 'PLAIN_TEXT',
        data: message,
      });
    } catch (error) {
      super.error('Failed to send log to Mixin Group', error.message);
    }
  }

  log(message: any, ...optionalParams: any[]) {
    if (!this.silentForTests) {
      super.log(message);
    }
    this.logger.info(message, optionalParams);
  }

  error(message: any, trace?: string, ...optionalParams: any[]) {
    if (!this.silentForTests) {
      super.error(message, trace);
    }
    this.logger.error(`${message}, Trace: ${trace}`, optionalParams);

    this.logToDiscord(`${message}, Trace: ${trace}`, 'ERROR');
    this.logToMixinGroup(
      `ERROR [${this.context}]: ${message}, Trace: ${trace}`,
    );
  }

  debug(message: any, ...optionalParams: any[]) {
    if (!this.silentForTests) {
      super.debug(message);
    }
    this.logger.debug(message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    if (!this.silentForTests) {
      super.warn(message);
    }
    this.logger.warn(message, optionalParams);

    this.logToDiscord(message, 'WARNING');
    this.logToMixinGroup(`WARN [${this.context}]: ${message}`);
  }

  marketMaking(): MarketMakingLogger {
    return {
      info: (message, fields = {}) => {
        this.log(this.formatMarketMakingMessage(message, fields));
      },
      debug: (message, fields = {}) => {
        this.debug(this.formatMarketMakingMessage(message, fields));
      },
      warn: (message, fields = {}, options = {}) => {
        if (this.shouldSkipMarketMakingLog(options)) {
          return;
        }

        this.warn(this.formatMarketMakingMessage(message, fields));
      },
      error: (message, fields = {}, trace) => {
        this.error(this.formatMarketMakingMessage(message, fields), trace);
      },
    };
  }

  private shouldSkipMarketMakingLog(options: MarketMakingLogOptions): boolean {
    if (!options.onceKey) {
      return false;
    }

    const windowMs = Number(options.windowMs || 0);

    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      return false;
    }

    const nowMs = Date.now();
    const suppressUntilMs =
      CustomLogger.marketMakingRateLimitUntilByKey.get(options.onceKey) || 0;

    if (nowMs < suppressUntilMs) {
      return true;
    }

    CustomLogger.marketMakingRateLimitUntilByKey.set(
      options.onceKey,
      nowMs + windowMs,
    );

    return false;
  }

  private formatMarketMakingMessage(
    message: string,
    fields: MarketMakingLogFields,
  ): string {
    const formattedFieldGroups = this.formatMarketMakingFieldGroups(fields);

    return [`[MM] ${message}`, ...formattedFieldGroups].join(' | ');
  }

  private formatMarketMakingFieldGroups(
    fields: MarketMakingLogFields,
  ): string[] {
    const normalizedFields = this.normalizeMarketMakingFields(fields);
    const identityFields = this.pickMarketMakingFields(
      normalizedFields,
      CustomLogger.marketMakingIdentityFieldOrder,
    );
    const diagnosticFields = this.pickMarketMakingFields(
      normalizedFields,
      CustomLogger.marketMakingDiagnosticFieldOrder,
    );
    const knownFieldNames = new Set([
      ...CustomLogger.marketMakingIdentityFieldOrder,
      ...CustomLogger.marketMakingDiagnosticFieldOrder,
    ]);
    const remainingFields = Object.entries(normalizedFields)
      .filter(([key]) => !knownFieldNames.has(key))
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    return [identityFields, diagnosticFields, remainingFields].filter(
      (group) => group.length > 0,
    );
  }

  private normalizeMarketMakingFields(
    fields: MarketMakingLogFields,
  ): Record<string, string> {
    return Object.entries(fields).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (value === undefined || value === null || value === '') {
          return acc;
        }

        acc[key] = String(value);

        return acc;
      },
      {},
    );
  }

  private pickMarketMakingFields(
    fields: Record<string, string>,
    fieldOrder: string[],
  ): string {
    return fieldOrder
      .filter((field) => fields[field] !== undefined)
      .map((field) => `${field}=${fields[field]}`)
      .join(' ');
  }

  onModuleInit() {
    // this.log('Logger module initialized', 'Logger');
  }

  onModuleDestroy() {
    this.log('Logger module destroyed. Performing cleanup...', 'Logger');
  }
}
