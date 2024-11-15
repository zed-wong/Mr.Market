/**
 * CustomLogger
 *
 * This service extends NestJS's Logger to provide enhanced logging capabilities using
 * the winston logging library. It supports logging messages to both the console and
 * log files, with separate handling for development and production environments.
 *
 * Dependencies:
 * - Logger: NestJS's built-in logger class for basic logging functionality.
 * - winston: Advanced logging library for Node.js.
 * - path: Node.js path module for handling file paths.
 *
 * Configuration:
 * - Logs directory is determined based on the IS_DEV environment variable.
 * - Logging levels are defined with 'info' as the default level.
 * - Two winston transports are used: one for error logs and one for combined logs.
 *
 * Methods:
 * - constructor: Initializes the winston logger with specified configuration and log file paths.
 * - log(message: any, context?: string): Logs informational messages. Uses NestJS's log method and winston for file logging.
 * - error(message: any, trace?: string, context?: string): Logs error messages with trace information. Uses NestJS's error method and winston for file logging.
 * - debug(message: any, context?: string): Logs debug messages. Uses NestJS's debug method.
 * - onModuleInit(): Logs a message when the logger module is initialized.
 * - onModuleDestroy(): Logs a message when the logger module is destroyed and performs any necessary cleanup.
 *
 * Notes:
 * - Additional methods such as warn and verbose can be implemented similarly to debug.
 * - The service adjusts the logs directory based on the environment to ensure proper file management in both development and production.
 * - The context parameter is used to specify the logging context, allowing for more organized and readable logs.
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import * as winston from 'winston';
import * as path from 'path';

@Injectable({ scope: Scope.DEFAULT })
export class CustomLogger extends Logger {
  private logger: winston.Logger;

  constructor(context?: string) {
    super(context);
    const logsDir = process.env.IS_DEV
      ? path.join(__dirname, '..', '..', 'logs')
      : path.join(__dirname, '..', 'logs'); // Adjust as necessary for production

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
      transports: [
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
        }),
      ],
    });
  }

  log(message: any, context?: string) {
    if (context) {
      super.log(message, context); // NestJS's internal logging
      this.logger.info(message, { context }); // winston log into file
      return;
    }
    super.log(message);
    this.logger.info(message);
  }

  error(message: any, trace?: string, context?: string) {
    if (context) {
      super.error(message, trace, context); // NestJS's internal error logging
      this.logger.error(`${message}, Trace: ${trace}`, { context }); // winston log into file
      return;
    }
    super.error(message, trace);
    this.logger.error(`${message}, Trace: ${trace}`);
  }

  // Implement warn, debug, verbose similarly...
  debug(message: any, context?: string) {
    if (context) {
      super.debug(message, context); // NestJS's internal logging
      return;
    }
    super.debug(message);
  }

  onModuleInit() {
    this.log('Logger module initialized', 'Logger');
  }

  onModuleDestroy() {
    this.log('Logger module destroyed. Performing cleanup...', 'Logger');
  }
}
