/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger, Scope } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import * as winston from 'winston';

@Injectable({ scope: Scope.DEFAULT })
export class CustomLogger extends Logger {
  private logger: winston.Logger;
  private discordWebhookUrl: string;
  private mixinGroupWebhookUrl: string;
  private readonly silentForTests: boolean;
  constructor(context?: string) {
    super(context);
    const isTestRuntime =
      process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

    this.silentForTests =
      isTestRuntime && process.env.JEST_VERBOSE_LOGS !== '1';
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
    this.discordWebhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL ?? '';
    this.mixinGroupWebhookUrl = process.env.MIXIN_GROUP_WEBHOOK_URL ?? '';
  }

  async logToDiscord(message: string, level: string = 'INFO') {
    if (this.discordWebhookUrl.length === 0) {
      return;
    }

    try {
      await axios.post(this.discordWebhookUrl, {
        content: `${level} [${this.context}]: ${message}`,
      });
    } catch (error) {
      super.error('Failed to send log to Discord', error.message);
    }
  }

  async logToMixinGroup(message: string) {
    if (this.mixinGroupWebhookUrl.length === 0) {
      return;
    }

    try {
      await axios.post(this.mixinGroupWebhookUrl, {
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

  onModuleInit() {
    // this.log('Logger module initialized', 'Logger');
  }

  onModuleDestroy() {
    this.log('Logger module destroyed. Performing cleanup...', 'Logger');
  }
}
